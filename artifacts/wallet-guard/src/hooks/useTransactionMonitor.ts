import { useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import type { SavedWallet } from "@/pages/WalletsPage";
import { showRiskAlert } from "@/components/RiskAlertToast";

// ── Config ────────────────────────────────────────────────────────────────────
const MONITOR_CONTRACT  = "TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj";
const POLL_INTERVAL_MS  = 10_000;   // 10 seconds
const SEEN_KEY          = "wg_monitor_seen";
const MAX_SEEN          = 2_000;    // max tx IDs to remember

// ── Seen-tx persistence ───────────────────────────────────────────────────────
function loadSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function saveSeen(seen: Set<string>): void {
  try {
    // Trim to last MAX_SEEN entries (keep the newest by converting to array)
    const arr = Array.from(seen);
    const trimmed = arr.length > MAX_SEEN ? arr.slice(arr.length - MAX_SEEN) : arr;
    localStorage.setItem(SEEN_KEY, JSON.stringify(trimmed));
  } catch {
    // Storage quota — silently ignore
  }
}

// ── TronGrid TRC20 transaction type ──────────────────────────────────────────
interface Trc20Transfer {
  transaction_id:  string;
  from:            string;
  to:              string;
  value:           string;
  block_timestamp: number;
  token_info?:     { symbol: string; decimals: number; name?: string };
}

// ── Risk result type (mirrors backend) ───────────────────────────────────────
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

// ── Fetch recent TRC20 transfers for a single wallet ─────────────────────────
const KEY = import.meta.env.VITE_TRON_API_KEY ?? "";

async function fetchRecentTransfers(address: string): Promise<Trc20Transfer[]> {
  try {
    const url =
      `https://api.trongrid.io/v1/accounts/${encodeURIComponent(address)}/transactions/trc20` +
      `?contract_address=${MONITOR_CONTRACT}&limit=10&only_confirmed=true&order_by=block_timestamp,desc`;
    const hdrs: Record<string, string> = { Accept: "application/json" };
    if (KEY) hdrs["TRON-PRO-API-KEY"] = KEY;
    const res = await fetch(url, { headers: hdrs, signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json.data) ? json.data : [];
  } catch {
    return [];
  }
}

// ── Call backend risk analysis ────────────────────────────────────────────────
async function analyzeRisk(senderAddress: string): Promise<RiskResult | null> {
  try {
    const res = await fetch("/api-server/api/risk/analyze", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ senderAddress }),
      signal:  AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ── Format amount from raw USDT micros ───────────────────────────────────────
function fmtAmount(raw: string, decimals = 6): string {
  const n = parseFloat(raw) / Math.pow(10, decimals);
  if (isNaN(n)) return "? USDT";
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 }) + " USDT";
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useTransactionMonitor(
  wallets: SavedWallet[],
  onScanSender?: (address: string) => void,
): void {
  const seenRef         = useRef<Set<string>>(loadSeen());
  const walletsRef      = useRef<SavedWallet[]>(wallets);
  const onScanRef       = useRef(onScanSender);
  const timerRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  // Track addresses in-flight to avoid concurrent analyses for the same sender
  const inFlightRef     = useRef<Set<string>>(new Set());

  // Keep refs in sync without restarting the interval
  useEffect(() => { onScanRef.current = onScanSender; }, [onScanSender]);
  useEffect(() => {
    walletsRef.current = wallets;
  }, [wallets]);

  const poll = useCallback(async () => {
    const current = walletsRef.current;
    if (!current.length) return;

    for (const wallet of current) {
      const transfers = await fetchRecentTransfers(wallet.address);

      for (const tx of transfers) {
        // Skip if already processed
        if (seenRef.current.has(tx.transaction_id)) continue;

        // Mark seen immediately to avoid double-processing on next tick
        seenRef.current.add(tx.transaction_id);
        saveSeen(seenRef.current);

        // Only process INCOMING transfers
        const recipient = tx.to?.toLowerCase?.() ?? "";
        const myAddr    = wallet.address.toLowerCase();
        if (recipient !== myAddr) continue;

        const sender = tx.from;
        const amount = fmtAmount(tx.value, tx.token_info?.decimals ?? 6);

        // Avoid running two analyses for the same sender simultaneously
        if (inFlightRef.current.has(sender)) continue;
        inFlightRef.current.add(sender);

        // Run risk analysis in the background (non-blocking)
        analyzeRisk(sender)
          .then(result => {
            showRiskAlert({
              walletName:    wallet.name,
              amount,
              sender,
              risk:          result,
              onScanSender:  onScanRef.current,
            });
          })
          .catch(() => {
            // Analysis failed — show a basic receive notification without risk data
            toast.info(`+${amount} recibido en ${wallet.name}`, {
              description: "Análisis de riesgo no disponible temporalmente.",
              duration:    6_000,
            });
          })
          .finally(() => {
            inFlightRef.current.delete(sender);
          });
      }

      // Small gap between wallet checks to respect TronGrid rate limits
      await new Promise<void>(r => setTimeout(r, 150));
    }
  }, []);

  useEffect(() => {
    if (!wallets.length) return;

    // Initial poll after a short delay (let the app finish loading)
    const startDelay = setTimeout(() => {
      poll();
      timerRef.current = setInterval(poll, POLL_INTERVAL_MS);
    }, 3_000);

    return () => {
      clearTimeout(startDelay);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [poll, wallets.length > 0]); // restart only if wallets go from 0→n or n→0
}
