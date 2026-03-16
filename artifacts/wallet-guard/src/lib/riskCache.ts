// ── Shared risk analysis types ────────────────────────────────────────────────

export interface RiskResult {
  score:                 number;
  level:                 "LOW" | "MODERATE" | "HIGH";
  inBlacklist:           boolean;
  interactedWithFrozen:  boolean;
  hasSuspiciousTransfer: boolean;
  walletAgeDays:         number | null;
  reasons:               string[];
  senderAddress:         string;
}

// ── Persistence (keyed by tx ID) ──────────────────────────────────────────────

const RISK_KEY  = "wg_risk_results";
const MAX_CACHE = 500; // cap entries to keep localStorage lean

type RiskStore = Record<string, RiskResult>;

function readStore(): RiskStore {
  try {
    const raw = localStorage.getItem(RISK_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeStore(store: RiskStore): void {
  try {
    // Evict oldest keys beyond MAX_CACHE (arbitrary eviction — keep last N added)
    const keys = Object.keys(store);
    if (keys.length > MAX_CACHE) {
      const evict = keys.slice(0, keys.length - MAX_CACHE);
      evict.forEach(k => delete store[k]);
    }
    localStorage.setItem(RISK_KEY, JSON.stringify(store));
  } catch {}
}

/** Persist a risk result for a given transaction ID. */
export function saveRisk(txId: string, result: RiskResult): void {
  const store = readStore();
  store[txId] = result;
  writeStore(store);
}

/** Look up a previously stored risk result for a transaction ID. */
export function loadRisk(txId: string): RiskResult | null {
  return readStore()[txId] ?? null;
}

/** Load all stored risk results as a Map<txId, RiskResult>. */
export function loadAllRisks(): Map<string, RiskResult> {
  return new Map(Object.entries(readStore()));
}

// ── Address-keyed risk cache ──────────────────────────────────────────────────
// Caches risk results by sender wallet address so the same address is never
// re-analyzed. This is separate from the tx-keyed cache: once we have a result
// for address T…XYZ, any future tx from that address reuses it immediately.

const ADDR_RISK_KEY  = "wg_risk_by_addr";
const MAX_ADDR_CACHE = 200;

type AddrStore = Record<string, RiskResult>;

function readAddrStore(): AddrStore {
  try {
    const raw = localStorage.getItem(ADDR_RISK_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function writeAddrStore(store: AddrStore): void {
  try {
    const keys = Object.keys(store);
    if (keys.length > MAX_ADDR_CACHE) {
      const evict = keys.slice(0, keys.length - MAX_ADDR_CACHE);
      evict.forEach(k => delete store[k]);
    }
    localStorage.setItem(ADDR_RISK_KEY, JSON.stringify(store));
  } catch {}
}

/** Persist a risk result keyed by the sender's wallet address. */
export function saveRiskByAddress(address: string, result: RiskResult): void {
  const store = readAddrStore();
  store[address.toLowerCase()] = result;
  writeAddrStore(store);
}

/** Look up a cached risk result by sender wallet address (null = not cached). */
export function loadRiskByAddress(address: string): RiskResult | null {
  return readAddrStore()[address.toLowerCase()] ?? null;
}

// ── Risk call (shared fetch to backend) ──────────────────────────────────────

export async function fetchRiskAnalysis(senderAddress: string): Promise<RiskResult | null> {
  try {
    const res = await fetch("/api-server/api/risk/analyze", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ senderAddress }),
      signal:  AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    return await res.json() as RiskResult;
  } catch {
    return null;
  }
}
