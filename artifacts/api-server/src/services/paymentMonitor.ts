// @ts-nocheck
/**
 * paymentMonitor — background USDT payment watcher.
 *
 * Polls TronGrid every POLL_INTERVAL_MS for new TRC20 USDT transfers
 * to the CoinCash wallet. When a valid transfer is found:
 *   1. Matches it to the oldest pending user whose plan amount fits.
 *   2. Activates their plan (basico=100 scans | pro=250 scans).
 *   3. Emits a real-time "plan-updated" Socket.io event to their room.
 *   4. Marks the tx_id as used to prevent double-spend.
 *
 * Works in parallel with the on-demand /freemium/verify-payment endpoint.
 * Both share the same `payment_txids` dedup table.
 */

import type { Server as SocketIO } from "socket.io";
import {
  isTxUsed,
  markTxUsed,
  setPaidPlan,
  getPendingUserForAmount,
} from "../lib/db";

const WALLET           = "TM2cRRegda1gQAQY9hGbg6DMscN7okNVA1";
const USDT_CONTRACT    = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"; // mainnet USDT TRC20
const POLL_INTERVAL_MS = 10_000;   // 10 seconds
const TX_LIMIT         = 50;

// TronGrid public endpoint (same as used by /verify-payment route)
const TRONGRID_URL =
  `https://api.trongrid.io/v1/accounts/${WALLET}/transactions/trc20` +
  `?limit=${TX_LIMIT}&contract_address=${USDT_CONTRACT}&only_to=true`;

// In-memory dedup cache for the last N seen tx_ids
const recentlySeen = new Set<string>();

interface TronGridTx {
  transaction_id:  string;
  to:              string;
  value:           string;   // amount in token's smallest unit (6 dec for USDT)
  block_timestamp: number;   // Unix ms
  token_info?: { symbol?: string; decimals?: number };
}

async function fetchTransfers(): Promise<TronGridTx[]> {
  const res = await fetch(TRONGRID_URL, {
    headers: { "Accept": "application/json" },
    signal:  AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`TronGrid HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data?.data) ? data.data : [];
}

async function processTransfers(
  transfers: TronGridTx[],
  io: SocketIO,
): Promise<void> {
  for (const tx of transfers) {
    const txId = tx.transaction_id ?? "";
    if (!txId) continue;

    // Only transfers TO our wallet
    if ((tx.to ?? "").toLowerCase() !== WALLET.toLowerCase()) continue;

    // Only USDT
    const symbol = tx.token_info?.symbol ?? "";
    if (symbol !== "USDT") continue;

    // Skip already processed (memory cache first, then DB)
    if (recentlySeen.has(txId)) continue;
    if (await isTxUsed(txId)) {
      recentlySeen.add(txId);
      continue;
    }

    // Parse amount — USDT has 6 decimal places
    const amountUsdt = parseInt(tx.value ?? "0", 10) / 1_000_000;
    const txTimeMs   = tx.block_timestamp ?? Date.now();

    // Only accept amounts in valid plan ranges
    const isBasico = amountUsdt >= 9.5  && amountUsdt <= 10.5;
    const isPro    = amountUsdt >= 19.5 && amountUsdt <= 20.5;
    if (!isBasico && !isPro) continue;

    console.log(
      `[paymentMonitor] 🔍 New USDT tx: ${txId}` +
      ` | ${amountUsdt.toFixed(2)} USDT | ${new Date(txTimeMs).toISOString()}`
    );

    // Find the best matching pending user
    const user = await getPendingUserForAmount(amountUsdt, txTimeMs);
    if (!user) {
      console.log(
        `[paymentMonitor] ⚠️  No pending user for ${amountUsdt} USDT ` +
        `(txId=${txId}) — will retry next poll if someone registers`
      );
      // Do NOT mark recentlySeen — a user may click "Ya pagué" within the next poll
      continue;
    }

    const { ccId, upgradePlan, upgradeScans } = user;

    // Mark tx as used FIRST (atomic dedup guard)
    await markTxUsed(txId, ccId, upgradePlan, amountUsdt);
    recentlySeen.add(txId);

    // Activate the plan in DB
    await setPaidPlan(ccId, upgradePlan, upgradeScans);

    // Notify user in real-time via Socket.io
    io.to(ccId).emit("plan-updated", {
      ccId, plan: upgradePlan, paidScansRemaining: upgradeScans,
    });

    console.log(
      `[paymentMonitor] ✅ Activated ${upgradePlan} (${upgradeScans} scans)` +
      ` for ${ccId} | txId=${txId} | ${amountUsdt.toFixed(2)} USDT`
    );
  }
}

let pollTimer: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

async function poll(io: SocketIO): Promise<void> {
  if (isRunning) return;   // skip if previous poll is still running
  isRunning = true;
  try {
    const transfers = await fetchTransfers();
    await processTransfers(transfers, io);
  } catch (err: any) {
    // Non-fatal: log and continue — TronGrid can occasionally be slow/unavailable
    console.warn(`[paymentMonitor] Poll error (non-fatal): ${err?.message}`);
  } finally {
    isRunning = false;
  }
}

/**
 * Start the background payment monitor.
 * Call once after the HTTP server is listening.
 * @param io  The Socket.io server instance used to notify users in real-time.
 */
export function startPaymentMonitor(io: SocketIO): void {
  if (pollTimer) return; // already started

  console.log(
    `[paymentMonitor] 🚀 Started — polling every ${POLL_INTERVAL_MS / 1000}s` +
    ` for USDT payments to ${WALLET}`
  );

  // Run immediately on startup
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
