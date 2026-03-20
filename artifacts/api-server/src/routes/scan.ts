// @ts-nocheck
// Scan routes — unified validation + analytics
// POST /api/scan            — validate freemium limit + record scan (returns freemium status)
// GET  /api/scan/stats      — return scan statistics (admin protected)
// GET  /api/scan/block-log  — return recent block events (admin protected)
// DELETE /api/scan/reset    — delete all scan records (admin protected)

import { Router }      from "express";
import { createHash }  from "crypto";
import {
  recordScanFull,
  getScanStats,
  resetScanStats,
  getUserPlan,
  getScanCountToday,
  getGroupScanCount,
  getDeviceScanCount,
  incrementScanCount,
  incrementGroupScan,
  incrementDeviceScanCount,
  getProDaysRemaining,
  FREE_SCAN_LIMIT,
  PRO_DURATION_DAYS,
} from "../lib/db";
import { checkScanRequest, getBlockLog } from "../lib/antiBot";

const router    = Router();
const ADMIN_KEY = "CoinCashAdmin2026";

// ── Helpers ─────────────────────────────────────────────────────────────────────

function getClientIP(req: any): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    return (typeof forwarded === "string" ? forwarded : forwarded[0]).split(",")[0].trim();
  }
  return req.socket?.remoteAddress ?? req.ip ?? "";
}

function getUserAgent(req: any): string {
  return (req.headers["user-agent"] ?? "").toString();
}

function ipHash(ip: string): string {
  if (!ip) return "";
  return createHash("sha256").update(ip).digest("hex");
}

async function geolocate(ip: string): Promise<{ country: string; countryCode: string }> {
  if (!ip || ip === "::1" || ip.startsWith("127.") || ip.startsWith("10.") ||
      ip.startsWith("192.168.") || ip.startsWith("172.")) {
    return { country: "Local", countryCode: "xx" };
  }
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { country: "Desconocido", countryCode: "xx" };
    const data = await res.json();
    if (data.status !== "success") return { country: "Desconocido", countryCode: "xx" };
    return { country: data.country, countryCode: (data.countryCode as string).toLowerCase() };
  } catch {
    return { country: "Desconocido", countryCode: "xx" };
  }
}

// ── POST /api/scan ─────────────────────────────────────────────────────────────
// Unified endpoint: validates limit + records scan + returns freemium status.
// Body: { wallet, ccId, deviceId }
// Returns: { ok, plan, scansToday, remaining, canScan } or error
router.post("/scan", async (req, res) => {
  const wallet   = (req.body?.wallet   ?? "").trim();
  const ccId     = (req.body?.ccId     ?? "").trim();
  const deviceId = (req.body?.deviceId ?? "").trim();

  if (!wallet) return res.status(400).json({ error: "wallet required" });

  const ip        = getClientIP(req);
  const userAgent = getUserAgent(req);
  const groupId   = ipHash(ip);

  // ── Anti-bot check ─────────────────────────────────────────────────────────
  const blocked = checkScanRequest(ip, userAgent, wallet, ccId || deviceId);
  if (blocked) {
    const BLOCK_MSG: Record<string, string> = {
      bot_ua:          "Solicitud bloqueada: cliente no permitido.",
      ip_rate_limited: "Demasiadas solicitudes desde tu IP. Espera unos minutos.",
      too_fast:        "Espera al menos 3 segundos entre escaneos.",
      wallet_repeat:   "Esa wallet fue analizada recientemente. Intenta más tarde.",
    };
    const msg    = BLOCK_MSG[blocked] ?? "Solicitud bloqueada.";
    const status = blocked === "ip_rate_limited" || blocked === "bot_ua" ? 429 : 200;
    return res.status(status).json({ ok: false, blocked, message: msg });
  }

  // ── Freemium limit validation (backend-enforced) ───────────────────────────
  try {
    let plan: string = "free";
    if (ccId) {
      plan = await getUserPlan(ccId);
    }

    if (plan !== "pro") {
      // Read all counters in parallel
      const [ccScans, groupScans, deviceScans] = await Promise.all([
        ccId     ? getScanCountToday(ccId)    : Promise.resolve(0),
        groupId  ? getGroupScanCount(groupId) : Promise.resolve(0),
        deviceId ? getDeviceScanCount(deviceId) : Promise.resolve(0),
      ]);

      // Effective count: group pool (IP-based) takes priority when available
      const effectiveScans = groupId
        ? Math.max(ccScans, groupScans)
        : Math.max(ccScans, deviceScans);

      if (effectiveScans >= FREE_SCAN_LIMIT) {
        return res.status(429).json({
          ok:         false,
          error:      "limit_reached",
          plan:       "free",
          scansToday: effectiveScans,
          limit:      FREE_SCAN_LIMIT,
          canScan:    false,
          remaining:  0,
          message:    "Límite diario de scans gratuitos alcanzado.",
        });
      }

      // ── Increment counters ─────────────────────────────────────────────────
      const increments: Promise<any>[] = [];
      if (ccId)     increments.push(incrementScanCount(ccId));
      if (groupId)  increments.push(incrementGroupScan(groupId, deviceId));
      else if (deviceId) increments.push(incrementDeviceScanCount(deviceId));
      const [newCcCount] = await Promise.all(increments);

      const scansToday = (typeof newCcCount === "number") ? newCcCount : (effectiveScans + 1);
      const remaining  = Math.max(0, FREE_SCAN_LIMIT - scansToday);

      // Record scan to DB (fire-and-forget — don't block the response)
      const geo = await geolocate(ip);
      recordScanFull({
        wallet, country: geo.country, countryCode: geo.countryCode,
        deviceId: deviceId || "", ccId: ccId || "",
        ipHash: groupId, planType: "free",
      }).catch(() => {});

      return res.json({ ok: true, plan: "free", scansToday, remaining, canScan: remaining > 0 });

    } else {
      // PRO user — record but don't increment or block
      const geo = await geolocate(ip);
      recordScanFull({
        wallet, country: geo.country, countryCode: geo.countryCode,
        deviceId: deviceId || "", ccId: ccId || "",
        ipHash: groupId, planType: "pro",
      }).catch(() => {});

      const daysRemaining = ccId ? await getProDaysRemaining(ccId) : null;
      return res.json({ ok: true, plan: "pro", scansToday: null, remaining: null, canScan: true, daysRemaining });
    }
  } catch (err: any) {
    console.error("[scan] error:", err?.message);
    // Fail open — don't block user on backend error
    return res.json({ ok: true, plan: "free", scansToday: 0, remaining: FREE_SCAN_LIMIT, canScan: true });
  }
});

// ── GET /api/scan/stats ────────────────────────────────────────────────────────
router.get("/scan/stats", async (req, res) => {
  const key = req.query.key as string | undefined;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: "Unauthorized" });
  const stats = await getScanStats();
  res.json(stats);
});

// ── GET /api/scan/block-log ────────────────────────────────────────────────────
router.get("/scan/block-log", (req, res) => {
  const key = req.query.key as string | undefined;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: "Unauthorized" });
  res.json({ events: getBlockLog(100) });
});

// ── DELETE /api/scan/reset ─────────────────────────────────────────────────────
router.delete("/scan/reset", async (req, res) => {
  const key = (req.headers["x-admin-key"] ?? req.query.key) as string | undefined;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: "Unauthorized" });
  try {
    const deleted = await resetScanStats();
    console.log(`[scan] Reset: deleted ${deleted} scan records`);
    return res.json({ ok: true, deleted });
  } catch (err: any) {
    console.error("[scan] reset error:", err?.message);
    return res.status(500).json({ error: "Reset failed" });
  }
});

export default router;
