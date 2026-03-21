// @ts-nocheck
/**
 * paymentMonitor — background USDT payment watcher.
 *
 * Polls TronScan every POLL_INTERVAL_MS for new TRC20 USDT transfers
 * to the CoinCash wallet. When a valid transfer is found:
 *   1. Matches it to the oldest pending user whose plan amount fits.
 *   2. Activates their plan (basico=100 scans | pro=250 scans).
 *   3. Emits a real-time "plan-updated" Socket.io event to their room.
 *   4. Marks the tx_id as used to prevent double-spend.
 *
 * Also uses the existing on-demand /freemium/verify-payment (TronGrid)
 * as a fallback — the two sources complement each other.
 */

import type { Server as SocketIO } from "socket.io";
import {
  isTxUsed,
  markTxUsed,
  setPaidPlan,
  getPendingUserForAmount,
} from "../lib/db";

const WALLET          = "TM2cRRegda1gQAQY9hGbg6DMscN7okNVA1";
const POLL_INTERVAL_MS = 10_000;   // 10 seconds
const TX_LIMIT        = 30;        // last N txs per poll

// TronScan endpoint — returns token_transfers[]
const TRONSCAN_URL =
  `https://apilist.tronscan.org/api/token_trc20/transfers` +
  `?toAddress=${WALLET}&limit=${TX_LIMIT}&start=0`;

// Keeps the last seen tx_ids in memory to avoid redundant DB lookups on repeated polls
const recentlySeen = new Set<string>();

interface TronScanTransfer {
  transaction_id:  string;
  tokenAbbr:       string;
  tokenName?:      string;
  quant:           string;      // amount in token's smallest unit (6 decimals for USDT)
  block_timestamp: number;      // Unix ms
  fromAddress?:    string;
}

async function fetchTransfers(): Promise<TronScanTransfer[]> {
  const res = await fetch(TRONSCAN_URL, {
    headers: { "Accept": "application/json", "User-Agent": "CoinCashMonitor/1.0" },
    signal:  AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`TronScan HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data?.token_transfers) ? data.token_transfers : [];
}

async function processTransfers(
  transfers: TronScanTransfer[],
  io: SocketIO,
): Promise<void> {
  for (const tx of transfers) {
    const txId = tx.transaction_id ?? "";
    if (!txId) continue;

    // Only USDT
    if (tx.tokenAbbr !== "USDT") continue;

    // Skip already processed (memory cache first, then DB)
    if (recentlySeen.has(txId)) continue;
    if (await isTxUsed(txId)) {
      recentlySeen.add(txId);
      continue;
    }

    // Parse amount — USDT has 6 decimal places
    const amountUsdt = parseFloat(tx.quant) / 1_000_000;
    const txTimeMs   = tx.block_timestamp ?? Date.now();

    // Only accept amounts in the valid plan ranges
    const isBasico = amountUsdt >= 9.5  && amountUsdt <= 10.5;
    const isPro    = amountUsdt >= 19.5 && amountUsdt <= 20.5;
    if (!isBasico && !isPro) continue;

    console.log(`[paymentMonitor] 🔍 New USDT tx: ${txId} | ${amountUsdt} USDT | ${new Date(txTimeMs).toISOString()}`);

    // Find the best matching pending user
    const user = await getPendingUserForAmount(amountUsdt, txTimeMs);
    if (!user) {
      console.log(`[paymentMonitor] ⚠️  No pending user matched for ${amountUsdt} USDT (txId=${txId})`);
      // Still mark as seen to avoid re-processing, but NOT in DB (keep it available in case user registers later)
      recentlySeen.add(txId);
      continue;
    }

    const { ccId, upgradePlan, upgradeScans } = user;

    // Atomically mark tx as used FIRST (prevents race conditions with verify-payment endpoint)
    await markTxUsed(txId, ccId, upgradePlan, amountUsdt);

    // Activate the plan
    await setPaidPlan(ccId, upgradePlan, upgradeScans);

    // Notify via Socket.io
    io.to(ccId).emit("plan-updated", {
      ccId, plan: upgradePlan, paidScansRemaining: upgradeScans,
    });

    console.log(`[paymentMonitor] ✅ Activated ${upgradePlan} (${upgradeScans} scans) for ${ccId} | txId=${txId} | ${amountUsdt} USDT`);

    recentlySeen.add(txId);
  }
}

let pollTimer: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

async function poll(io: SocketIO): Promise<void> {
  if (isRunning) return;   // prevent overlapping runs
  isRunning = true;
  try {
    const transfers = await fetchTransfers();
    await processTransfers(transfers, io);
  } catch (err: any) {
    // Non-fatal: log and continue. TronScan can be unreliable.
    console.warn(`[paymentMonitor] Poll error (non-fatal): ${err?.message}`);
  } finally {
    isRunning = false;
  }
}

/**
 * Start the background payment monitor.
 * Call once after the HTTP server is listening.
 * @param io  The Socket.io server instance (used to notify users in real-time).
 */
export function startPaymentMonitor(io: SocketIO): void {
  if (pollTimer) return; // already started

  console.log(`[paymentMonitor] 🚀 Started — polling every ${POLL_INTERVAL_MS / 1000}s for USDT payments to ${WALLET}`);

  // First poll immediately
  poll(io);

  pollTimer = setInterval(() => poll(io), POLL_INTERVAL_MS);
}

export function stopPaymentMonitor(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    console.log("[paymentMonitor] Stopped.");
  }
}
