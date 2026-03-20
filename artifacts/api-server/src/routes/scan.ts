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
  getDeviceStats,
  resetScanStats,
  getUserPlan,
  getScanCountToday,
  getGroupScanCount,
  getDeviceScanCount,
  incrementScanCount,
  incrementGroupScan,
  incrementDeviceScanCount,
  getProDaysRemaining,
  ensureFreemiumUser,
  getDistinctDevicesForIP,
  isIPWhitelisted,
  addIPWhitelist,
  removeIPWhitelist,
  getIPWhitelist,
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

  // Register the user in the users table so they appear in admin (fire-and-forget)
  if (ccId) ensureFreemiumUser(ccId).catch(() => {});

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
      // Read all counters + evasion signals in parallel
      const [ccScans, groupScans, deviceScans, distinctDevices, whitelisted] = await Promise.all([
        ccId     ? getScanCountToday(ccId)          : Promise.resolve(0),
        groupId  ? getGroupScanCount(groupId)        : Promise.resolve(0),
        deviceId ? getDeviceScanCount(deviceId)      : Promise.resolve(0),
        groupId  ? getDistinctDevicesForIP(groupId)  : Promise.resolve(0),
        groupId  ? isIPWhitelisted(groupId)          : Promise.resolve(false),
      ]);

      // Evasion check: more than 2 distinct devices on same IP today (and not whitelisted)
      if (distinctDevices > 2 && !whitelisted) {
        return res.status(429).json({
          ok:         false,
          blocked:    "evasion",
          plan:       "free",
          canScan:    false,
          remaining:  0,
          scansToday: groupScans,
          limit:      FREE_SCAN_LIMIT,
          message:    "Detectamos múltiples dispositivos en esta red. Actualiza a PRO para continuar.",
          ipHash:     groupId,
        });
      }

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

// ── GET /api/scan/devices ─────────────────────────────────────────────────────
// Returns per-device scan statistics grouped by deviceId.
// Includes IP-sharing abuse detection: devices sharing the same IP hash today
// are flagged as possible_evasion = true.
router.get("/scan/devices", async (req, res) => {
  const key = req.query.key as string | undefined;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: "Unauthorized" });
  try {
    const data = await getDeviceStats();
    res.json(data);
  } catch (err: any) {
    console.error("[scan/devices]", err?.message);
    res.status(500).json({ error: "Error fetching device stats" });
  }
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

// ── GET /api/scan/whitelist ────────────────────────────────────────────────────
// Returns all whitelisted IP hashes (admin only).
router.get("/scan/whitelist", async (req, res) => {
  const key = req.query.key as string | undefined;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: "Unauthorized" });
  try {
    const list = await getIPWhitelist();
    res.json({ whitelist: list });
  } catch (err: any) {
    console.error("[scan/whitelist] GET error:", err?.message);
    res.status(500).json({ error: "Error fetching whitelist" });
  }
});

// ── POST /api/scan/whitelist ──────────────────────────────────────────────────
// Add an IP hash to the whitelist (marks as legitimate).
// Body: { ipHash, note? }
router.post("/scan/whitelist", async (req, res) => {
  const key = req.headers["x-admin-key"] as string | undefined ?? req.body?.key;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: "Unauthorized" });
  const { ipHash, note = "" } = req.body ?? {};
  if (!ipHash) return res.status(400).json({ error: "ipHash required" });
  try {
    await addIPWhitelist(ipHash, note);
    console.log(`[scan/whitelist] Added: ${ipHash.slice(0, 12)}…`);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[scan/whitelist] POST error:", err?.message);
    res.status(500).json({ error: "Error adding to whitelist" });
  }
});

// ── DELETE /api/scan/whitelist/:ipHash ───────────────────────────────────────
// Remove an IP hash from the whitelist.
router.delete("/scan/whitelist/:ipHash", async (req, res) => {
  const key = (req.headers["x-admin-key"] ?? req.query.key) as string | undefined;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: "Unauthorized" });
  const { ipHash } = req.params;
  try {
    await removeIPWhitelist(ipHash);
    console.log(`[scan/whitelist] Removed: ${ipHash.slice(0, 12)}…`);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[scan/whitelist] DELETE error:", err?.message);
    res.status(500).json({ error: "Error removing from whitelist" });
  }
});

export default router;
