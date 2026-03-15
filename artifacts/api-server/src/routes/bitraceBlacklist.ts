import { Router } from "express";

const router = Router();

// ── Bitrace API constants ──────────────────────────────────────────────────────
const DETRUST_BASE = "https://detrust.bitrace.io";
const TOKEN_URL    = `${DETRUST_BASE}/v1/detr/token/guest`;
const LIST_URL     = `${DETRUST_BASE}/v1/detr/stableTokenFreezePage`;
const ORIGIN       = "https://blacklist.bitrace.io";
const UA           = "Mozilla/5.0 (compatible; CoinCashWalletGuard/1.0)";
const PAGE_SIZE    = 100;

// ── Cache config ──────────────────────────────────────────────────────────────
const CACHE_TTL_MS = 60_000;          // 60-second data cache
const TOKEN_TTL_MS = 9 * 60 * 1000;  // re-use guest token for 9 min (expires at 10)

// ── Output type ───────────────────────────────────────────────────────────────
export interface BitraceEntry {
  address: string;
  chain:   string;
  risk:    string;
  balance: string;
  date:    string;
}

// ── In-memory state ───────────────────────────────────────────────────────────
let _cache:      BitraceEntry[] | null = null;
let _cacheAt     = 0;
let _token:      string | null         = null;
let _tokenAt     = 0;
let _refreshing  = false;

// ── Guest token — automatically refreshed before expiry ───────────────────────
async function getGuestToken(): Promise<string> {
  const now = Date.now();
  if (_token && now - _tokenAt < TOKEN_TTL_MS) return _token;

  const res = await fetch(TOKEN_URL, {
    headers: { Referer: ORIGIN, Origin: ORIGIN, "User-Agent": UA },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`[bitrace-bl] Token fetch HTTP ${res.status}`);

  const data = await res.json();
  if (!data.access_token) throw new Error("[bitrace-bl] No access_token in guest response");

  _token  = data.access_token as string;
  _tokenAt = now;
  console.log("[bitrace-bl] Guest token refreshed (expires_in:", data.expires_in, "s)");
  return _token;
}

// ── Fetch one page from the Bitrace freeze list ────────────────────────────────
// riskType 3 = frozen/blacklisted. network filter left open so we can get both
// TRON and ETH results, then filter to TRON server-side.
async function fetchPage(token: string, pageNum: number): Promise<{ total: number; items: any[] }> {
  const res = await fetch(LIST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      Referer: ORIGIN,
      Origin: ORIGIN,
      "User-Agent": UA,
    },
    body: JSON.stringify({ pageNum, pageSize: PAGE_SIZE, riskType: 3 }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) throw new Error(`[bitrace-bl] List API HTTP ${res.status}`);

  const data = await res.json();
  if (data.statusCode !== 200) {
    throw new Error(`[bitrace-bl] API error: ${data.message ?? JSON.stringify(data)}`);
  }

  return {
    total: data.object?.totalCount ?? 0,
    items: data.object?.datas ?? [],
  };
}

// ── Map raw item → BitraceEntry ───────────────────────────────────────────────
function mapEntry(item: any): BitraceEntry {
  return {
    address: item.address ?? "",
    chain:   "TRC20",
    risk:    item.risk ?? "Risky",
    balance: item.freezeAmount != null
      ? String(Math.round(item.freezeAmount))
      : "0",
    date: item.freezeTime
      ? new Date(item.freezeTime).toISOString().slice(0, 10)
      : "",
  };
}

// ── Main refresh — fetches all available pages, filters to TRON ───────────────
async function refreshCache(): Promise<void> {
  if (_refreshing) return;
  _refreshing = true;

  try {
    console.log("[bitrace-bl] Refreshing…");
    const token = await getGuestToken();

    // First page also tells us the total count
    const first = await fetchPage(token, 1);
    const totalPages = Math.ceil(first.total / PAGE_SIZE);

    let allItems = [...first.items];

    // Fetch remaining pages in parallel (guest cap is 100 so usually just 1 page)
    if (totalPages > 1) {
      const extras = await Promise.allSettled(
        Array.from({ length: totalPages - 1 }, (_, i) => fetchPage(token, i + 2)),
      );
      for (const r of extras) {
        if (r.status === "fulfilled") allItems = allItems.concat(r.value.items);
      }
    }

    // Filter to TRON only and map to output shape
    const entries: BitraceEntry[] = allItems
      .filter(item => item.chain === "TRON" && item.address)
      .map(mapEntry);

    _cache   = entries;
    _cacheAt = Date.now();
    console.log(`[bitrace-bl] Cached ${entries.length} TRC20 entries (${allItems.length} total from API)`);
  } catch (err: any) {
    console.error("[bitrace-bl] Refresh failed:", err?.message);
  } finally {
    _refreshing = false;
  }
}

// ── Boot: first load + 60-second background refresh ──────────────────────────
refreshCache();
setInterval(() => { refreshCache().catch(console.error); }, CACHE_TTL_MS);

// ── GET /api/bitrace-blacklist ────────────────────────────────────────────────
router.get("/bitrace-blacklist", async (_req, res) => {
  const age = _cacheAt ? Math.floor((Date.now() - _cacheAt) / 1000) : null;

  // Serve from cache if it's still warm (within 2× TTL)
  if (_cache !== null && age !== null && age < CACHE_TTL_MS * 2 / 1000) {
    return res.json({
      data:     _cache,
      total:    _cache.length,
      cached:   true,
      cacheAge: age,
    });
  }

  // Cache is cold or very stale — wait for a fresh pull
  try {
    await refreshCache();
    return res.json({
      data:     _cache ?? [],
      total:    (_cache ?? []).length,
      cached:   false,
      cacheAge: 0,
    });
  } catch {
    return res.status(503).json({ error: "Bitrace service temporalmente no disponible." });
  }
});

export default router;
