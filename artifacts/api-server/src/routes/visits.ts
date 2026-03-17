// @ts-nocheck
// Visit tracking routes
// POST /api/visit       — register a new visitor (called by the frontend on load)
// GET  /api/visit/stats — return aggregated visit stats for the admin panel

import { Router } from "express";

const router = Router();

// ── In-memory store ───────────────────────────────────────────────────────────
interface CountryRecord {
  name:  string;
  code:  string;   // ISO 3166-1 alpha-2 for flagcdn
  count: number;
}

const WINDOW_MS   = 24 * 60 * 60 * 1000; // 24 hours
const MAX_PER_IP  = 2;                    // max visits per IP within the window

const store: {
  total:     number;
  countries: Record<string, CountryRecord>;
  ipLog:     Map<string, number[]>;   // IP → list of visit timestamps within the last 24 h
} = {
  total:     0,
  countries: {},
  ipLog:     new Map(),
};

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
  const ip  = getClientIP(req);
  const now = Date.now();

  // Get existing timestamps for this IP, keeping only those within the 24 h window
  const timestamps = (store.ipLog.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);

  // Reject if the IP has already been counted MAX_PER_IP times in this window
  if (timestamps.length >= MAX_PER_IP) {
    res.json({ ok: true, throttled: true });
    return;
  }

  // Record this visit timestamp
  timestamps.push(now);
  store.ipLog.set(ip, timestamps);

  // Periodically evict fully-expired IP entries to avoid unbounded memory growth
  if (store.ipLog.size > 10_000) {
    for (const [k, ts] of store.ipLog) {
      if (ts.every((t) => now - t >= WINDOW_MS)) store.ipLog.delete(k);
    }
  }

  store.total += 1;

  const geo = await geolocate(ip);
  const country     = geo?.country     ?? "Desconocido";
  const countryCode = geo?.countryCode ?? "xx";

  if (!store.countries[countryCode]) {
    store.countries[countryCode] = { name: country, code: countryCode, count: 0 };
  }
  store.countries[countryCode].count += 1;

  res.json({ ok: true, country, countryCode });
});

// ── GET /api/visit/stats ──────────────────────────────────────────────────────
router.get("/visit/stats", (_req, res) => {
  const countries = Object.values(store.countries)
    .sort((a, b) => b.count - a.count);

  res.json({ total: store.total, countries });
});

export default router;
