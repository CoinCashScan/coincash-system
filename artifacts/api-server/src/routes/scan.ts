// @ts-nocheck
// Scan analytics routes
// POST /api/scan       — record a wallet scan event
// GET  /api/scan/stats — return scan statistics (protected by key)

import { Router } from "express";
import { recordScan, getScanStats } from "../lib/db";

const router = Router();
const ADMIN_KEY = "CoinCashAdmin2026";

async function geolocate(ip: string): Promise<{ country: string; countryCode: string }> {
  if (!ip || ip === "::1" || ip.startsWith("127.") || ip.startsWith("10.") || ip.startsWith("192.168.") || ip.startsWith("172.")) {
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

// ── POST /api/scan ─────────────────────────────────────────────────────────────
router.post("/scan", async (req, res) => {
  const wallet = (req.body?.wallet ?? "").trim();
  if (!wallet) return res.status(400).json({ error: "wallet required" });

  const ip = getClientIP(req);
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

export default router;
