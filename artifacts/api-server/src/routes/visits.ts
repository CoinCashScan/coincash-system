// @ts-nocheck
// Visit tracking routes
// POST /api/visit       — register a new visitor (called by the frontend on load)
// GET  /api/visit/stats — return aggregated visit stats for the admin panel

import { Router } from "express";
import { recordVisit, getVisitStats } from "../lib/db";

const router = Router();

// ── Geolocation via ip-api.com (free, no key needed) ─────────────────────────
async function geolocate(ip: string): Promise<{ country: string; countryCode: string } | null> {
  // Skip private / loopback addresses
  if (
    !ip ||
    ip === "::1" ||
    ip.startsWith("127.") ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("172.")
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
    const first = (typeof forwarded === "string" ? forwarded : forwarded[0]).split(",")[0].trim();
    return first;
  }
  return req.socket?.remoteAddress ?? req.ip ?? "";
}

// ── POST /api/visit ───────────────────────────────────────────────────────────
router.post("/visit", async (req, res) => {
  const ip = getClientIP(req);

  const geo = await geolocate(ip);
  const country     = geo?.country     ?? "Desconocido";
  const countryCode = geo?.countryCode ?? "xx";

  await recordVisit(country, countryCode);

  res.json({ ok: true, country, countryCode });
});

// ── GET /api/visit/stats ──────────────────────────────────────────────────────
router.get("/visit/stats", async (_req, res) => {
  const stats = await getVisitStats();
  res.json(stats);
});

export default router;
