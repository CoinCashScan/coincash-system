// @ts-nocheck
// Scan analytics routes
// POST /api/scan            — record a wallet scan event (with anti-bot protection)
// GET  /api/scan/stats      — return scan statistics (protected by admin key)
// GET  /api/scan/block-log  — return recent block events (protected by admin key)

import { Router } from "express";
import { recordScan, getScanStats } from "../lib/db";
import { checkScanRequest, getBlockLog } from "../lib/antiBot";

const router = Router();
const ADMIN_KEY = "CoinCashAdmin2026";

// ── Blocked-reason messages (returned to client) ───────────────────────────────
const BLOCK_MESSAGES: Record<string, string> = {
  bot_ua:          "Solicitud bloqueada: cliente no permitido.",
  ip_rate_limited: "Demasiadas solicitudes desde tu IP. Espera unos minutos.",
  too_fast:        "Espera al menos 3 segundos entre escaneos.",
  wallet_repeat:   "Esa wallet fue analizada recientemente. Intenta más tarde.",
};

// ── Helpers ─────────────────────────────────────────────────────────────────────

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

// ── POST /api/scan ─────────────────────────────────────────────────────────────
router.post("/scan", async (req, res) => {
  const wallet = (req.body?.wallet ?? "").trim();
  if (!wallet) return res.status(400).json({ error: "wallet required" });

  const ip        = getClientIP(req);
  const userAgent = getUserAgent(req);
  const userId    = (req.body?.ccId ?? "").trim();

  // Anti-bot check — only count and record valid scans
  const blocked = checkScanRequest(ip, userAgent, wallet, userId);
  if (blocked) {
    const msg = BLOCK_MESSAGES[blocked] ?? "Solicitud bloqueada.";
    // Return 200 for repeat/delay so frontend doesn't error; 429 for hard blocks
    const status = blocked === "ip_rate_limited" || blocked === "bot_ua" ? 429 : 200;
    return res.status(status).json({ ok: false, blocked, message: msg });
  }

  const geo = await geolocate(ip);
  await recordScan(wallet, ip, geo.country, geo.countryCode).catch(() => {});
  res.json({ ok: true });
});

// ── GET /api/scan/stats ────────────────────────────────────────────────────────
router.get("/scan/stats", async (req, res) => {
  const key = req.query.key as string | undefined;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: "Unauthorized" });
  const stats = await getScanStats();
  res.json(stats);
});

// ── GET /api/scan/block-log ────────────────────────────────────────────────────
// Returns the last 100 block events. Admin only.
router.get("/scan/block-log", (req, res) => {
  const key = req.query.key as string | undefined;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: "Unauthorized" });
  res.json({ events: getBlockLog(100) });
});

export default router;
