import { Router } from "express";
import { db } from "@workspace/db";
import { blacklistedAddresses } from "@workspace/db/schema";
import { or, eq } from "drizzle-orm";

const router = Router();

const USDT_CONTRACT  = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const USDT_CONTRACT2 = "TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj";
const API_KEY        = process.env.VITE_TRON_API_KEY;

// ── Address conversion helpers ────────────────────────────────────────────────

const BASE58_CHARS = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/**
 * TRON Base58Check (T...) → 41-prefixed 21-byte hex (no 0x).
 * Returns empty string if parsing fails.
 */
function tronToHex41(addr: string): string {
  try {
    let n = 0n;
    for (const c of addr) {
      const i = BASE58_CHARS.indexOf(c);
      if (i < 0) return "";
      n = n * 58n + BigInt(i);
    }
    return n.toString(16).padStart(42, "0").slice(0, 42); // 21 bytes
  } catch {
    return "";
  }
}

/**
 * Convert any address format to the 0x-prefixed 20-byte hex the DB stores.
 * Accepts: T... (TRON base58) or 0x... / 41... (Ethereum hex)
 */
function toEthHex(addr: string): string {
  if (!addr) return "";
  if (addr.startsWith("T")) {
    const hex41 = tronToHex41(addr);
    return hex41 ? "0x" + hex41.slice(2) : "";
  }
  if (addr.startsWith("0x")) return addr.toLowerCase();
  if (addr.startsWith("41") && addr.length === 42) return "0x" + addr.slice(2).toLowerCase();
  return addr.toLowerCase();
}

// ── TronGrid fetch ────────────────────────────────────────────────────────────

function tronHeaders(): HeadersInit {
  const h: Record<string, string> = { Accept: "application/json" };
  if (API_KEY) h["TRON-PRO-API-KEY"] = API_KEY;
  return h;
}

interface Trc20Tx {
  transaction_id: string;
  from:            string;
  to:              string;
  value:           string;
  block_timestamp: number;
  token_info?:     { symbol: string; decimals: number };
}

async function fetchTrc20History(address: string): Promise<Trc20Tx[]> {
  try {
    // Check both USDT contracts
    const urls = [
      `https://api.trongrid.io/v1/accounts/${encodeURIComponent(address)}/transactions/trc20` +
        `?contract_address=${USDT_CONTRACT}&limit=20&only_confirmed=true&order_by=block_timestamp,desc`,
      `https://api.trongrid.io/v1/accounts/${encodeURIComponent(address)}/transactions/trc20` +
        `?contract_address=${USDT_CONTRACT2}&limit=20&only_confirmed=true&order_by=block_timestamp,desc`,
    ];
    const results = await Promise.allSettled(
      urls.map(u => fetch(u, { headers: tronHeaders(), signal: AbortSignal.timeout(8_000) }))
    );
    const txs: Trc20Tx[] = [];
    for (const r of results) {
      if (r.status !== "fulfilled" || !r.value.ok) continue;
      const json = await r.value.json();
      if (Array.isArray(json.data)) txs.push(...json.data);
    }
    return txs.slice(0, 40); // cap at 40 combined
  } catch {
    return [];
  }
}

async function fetchWalletCreateTime(address: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://api.trongrid.io/v1/accounts/${encodeURIComponent(address)}`,
      { headers: tronHeaders(), signal: AbortSignal.timeout(6_000) }
    );
    if (!res.ok) return null;
    const json = await res.json();
    return json.data?.[0]?.create_time ?? null;
  } catch {
    return null;
  }
}

// ── DB blacklist checker ──────────────────────────────────────────────────────

async function isBlacklisted(ethHex: string): Promise<boolean> {
  if (!ethHex) return false;
  try {
    const rows = await db
      .select({ address: blacklistedAddresses.address })
      .from(blacklistedAddresses)
      .where(eq(blacklistedAddresses.address, ethHex))
      .limit(1);
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function anyCounterpartBlacklisted(addresses: string[]): Promise<boolean> {
  if (!addresses.length) return false;
  try {
    const hexes = [...new Set(addresses.map(toEthHex).filter(Boolean))];
    if (!hexes.length) return false;
    // Build OR conditions
    const conditions = hexes.map(h => eq(blacklistedAddresses.address, h));
    const rows = await db
      .select({ address: blacklistedAddresses.address })
      .from(blacklistedAddresses)
      .where(or(...conditions))
      .limit(1);
    return rows.length > 0;
  } catch {
    return false;
  }
}

// ── Risk calculation ──────────────────────────────────────────────────────────

export interface RiskResult {
  score:                    number;
  level:                    "LOW" | "MODERATE" | "HIGH";
  inBlacklist:              boolean;
  interactedWithFrozen:     boolean;
  hasSuspiciousTransfer:    boolean;
  walletAgeDays:            number | null;
  reasons:                  string[];
  senderAddress:            string;
}

async function analyzeRisk(senderAddress: string): Promise<RiskResult> {
  const ethHex = toEthHex(senderAddress);
  let score = 0;
  const reasons: string[] = [];

  // 1. Blacklist check (score = 100 immediately)
  const inBlacklist = await isBlacklisted(ethHex);
  if (inBlacklist) {
    return {
      score: 100,
      level: "HIGH",
      inBlacklist: true,
      interactedWithFrozen: false,
      hasSuspiciousTransfer: false,
      walletAgeDays: null,
      reasons: ["Dirección encontrada en lista negra de USDT TRC20"],
      senderAddress,
    };
  }

  // 2. Fetch tx history and wallet age in parallel
  const [txHistory, createTime] = await Promise.all([
    fetchTrc20History(senderAddress),
    fetchWalletCreateTime(senderAddress),
  ]);

  // 3. Check counterparts against blacklist
  const counterparts = txHistory.flatMap(tx => [tx.from, tx.to]).filter(Boolean);
  const interactedWithFrozen = await anyCounterpartBlacklisted(counterparts);
  if (interactedWithFrozen) {
    score += 40;
    reasons.push("Interactuó con wallets congeladas o en lista negra");
  }

  // 4. Suspicious large transfers (> 100k USDT)
  const SUSPICIOUS_AMOUNT = 100_000 * 1_000_000; // 100k USDT in micros
  const hasSuspiciousTransfer = txHistory.some(tx => {
    const raw = parseInt(tx.value, 10);
    return !isNaN(raw) && raw >= SUSPICIOUS_AMOUNT;
  });
  if (hasSuspiciousTransfer) {
    score += 20;
    reasons.push("Transferencias grandes sospechosas detectadas (>100,000 USDT)");
  }

  // 5. Wallet age
  let walletAgeDays: number | null = null;
  if (createTime) {
    walletAgeDays = Math.floor((Date.now() - createTime) / (86_400_000));
    if (walletAgeDays < 7) {
      score += 10;
      reasons.push(`Wallet creada hace solo ${walletAgeDays} día${walletAgeDays === 1 ? "" : "s"}`);
    }
  }

  // 6. Cap and level
  score = Math.min(100, score);
  const level: RiskResult["level"] =
    score <= 30  ? "LOW"      :
    score <= 60  ? "MODERATE" :
                   "HIGH";

  if (reasons.length === 0) reasons.push("Sin factores de riesgo detectados");

  return {
    score,
    level,
    inBlacklist: false,
    interactedWithFrozen,
    hasSuspiciousTransfer,
    walletAgeDays,
    reasons,
    senderAddress,
  };
}

// ── Route: POST /api/risk/analyze ─────────────────────────────────────────────
router.post("/risk/analyze", async (req, res) => {
  const { senderAddress } = req.body ?? {};
  if (!senderAddress || typeof senderAddress !== "string") {
    res.status(400).json({ error: "senderAddress es requerido." });
    return;
  }

  try {
    const result = await analyzeRisk(senderAddress.trim());
    res.json(result);
  } catch (err: any) {
    console.error("[risk/analyze] Error:", err?.message);
    res.status(500).json({ error: "No se pudo analizar la dirección." });
  }
});

export default router;
