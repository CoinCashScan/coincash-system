// @ts-nocheck
// Visit tracking routes
// POST /api/visit       — register a new visitor (called by frontend on load)
// GET  /api/visit/stats — return aggregated visit stats for the admin panel

import { Router } from "express";
import { recordVisit, getVisitStats, resetVisitStats } from "../lib/db";
import { checkVisit } from "../lib/antiBot";

const router = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

async function geolocate(ip: string): Promise<{ country: string; countryCode: string } | null> {
  if (
    !ip || ip === "::1" ||
    ip.startsWith("127.") || ip.startsWith("10.") ||
    ip.startsWith("192.168.") || ip.startsWith("172.")
  ) {
    return { country: "Local", countryCode: "xx" };
  }
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== "success") return null;
    return { country: data.country, countryCode: (data.countryCode as string).toLowerCase() };
  } catch {
    return null;
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

// ── POST /api/visit ───────────────────────────────────────────────────────────
router.post("/visit", async (req, res) => {
  const ip        = getClientIP(req);
  const userAgent = getUserAgent(req);

  // Only count unique, non-bot visits (1 per IP per 30 min)
  const shouldCount = checkVisit(ip, userAgent);
  if (!shouldCount) {
    return res.json({ ok: true, counted: false });
  }

  const geo         = await geolocate(ip);
  const country     = geo?.country     ?? "Desconocido";
  const countryCode = geo?.countryCode ?? "xx";

  await recordVisit(country, countryCode);
  res.json({ ok: true, counted: true, country, countryCode });
});

// ── GET /api/visit/stats ──────────────────────────────────────────────────────
router.get("/visit/stats", async (_req, res) => {
  const stats = await getVisitStats();
  res.json(stats);
});

// ── DELETE /api/visit/reset ───────────────────────────────────────────────────
// Admin only — deletes all visit records and returns fresh empty stats.
router.delete("/visit/reset", async (req, res) => {
  const key = (req.headers["x-admin-key"] ?? req.query.key) as string | undefined;
  if (key !== "CoinCashAdmin2026") return res.status(401).json({ error: "Unauthorized" });
  try {
    const deleted = await resetVisitStats();
    console.log(`[visits] Reset: deleted ${deleted} visit records`);
    return res.json({ ok: true, deleted });
  } catch (err: any) {
    console.error("[visits] reset error:", err?.message);
    return res.status(500).json({ error: "Reset failed" });
  }
});

export default router;
