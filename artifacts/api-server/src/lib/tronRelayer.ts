// @ts-nocheck
// TRON Relayer — energy rental + broadcast via TronWeb
// Private key never leaves client; this handles energy provision and relaying signed txs.
// Energy rental flow:
//   1. Check user's available energy via /wallet/getaccountresource
//   2a. If relayer has staked energy → delegate it (free, instant)
//   2b. Else → relayer freezes a small TRX amount on-the-fly to acquire energy, then delegates
//   3. Broadcast user's already-signed USDT transaction
import { TronWeb } from "tronweb";
import { createHash } from "node:crypto";

const TRON_GRID     = "https://api.trongrid.io";
const API_KEY       = process.env.TRONGRID_API_KEY ?? process.env.VITE_TRON_API_KEY ?? "";
const RELAY_KEY     = process.env.TRON_RELAYER_PRIVATE_KEY ?? "";
const RELAY_ADDR    = process.env.TRON_RELAYER_ADDRESS     ?? "";   // hex 41-prefix
const TREASURY_ADDR = process.env.TREASURY_ADDRESS         ?? "";   // Base58 TRON address
export const SERVICE_FEE_USDT = 1;

console.log("[tronRelayer] TronGrid API key:", API_KEY ? `✓ loaded (${API_KEY.slice(0, 8)}…)` : "✗ MISSING");

// ── TronWeb instance (used for signing + broadcasting relayer transactions) ───
const tronWeb = new TronWeb({
  fullHost:   TRON_GRID,
  headers:    { "TRON-PRO-API-KEY": API_KEY },
  privateKey: RELAY_KEY || "0".repeat(64),   // fallback keeps TronWeb happy when key is absent
});

// ── Hex error decoder — TronGrid returns errors as hex-encoded UTF-8 ──────────
function decodeHexMessage(raw: string): string {
  if (!raw) return "Transacción rechazada por la red TRON.";
  let text = raw;
  if (/^[0-9a-fA-F]{2,}$/.test(raw) && raw.length % 2 === 0) {
    try { text = Buffer.from(raw, "hex").toString("utf8").replace(/\0/g, "").trim(); } catch {}
  }
  const lo = text.toLowerCase();
  if (lo.includes("signature") || lo.includes("sign"))       return "Error firmando la transacción.";
  if (lo.includes("invalid address"))                         return "Dirección TRON inválida.";
  if (lo.includes("insufficient") || lo.includes("balance")) return "Fondos insuficientes.";
  if (lo.includes("expired") || lo.includes("tapos"))        return "Transacción expirada. Intenta de nuevo.";
  if (lo.includes("bandwidth"))                               return "Sin suficiente ancho de banda.";
  if (lo.includes("contract") || lo.includes("execution"))   return "Error en el contrato inteligente.";
  if (lo.includes("duplicate") || lo.includes("already"))    return "Transacción duplicada.";
  if (text !== raw && /^[\x20-\x7E]{3,}$/.test(text))       return text;
  return "Transacción rechazada por la red TRON.";
}

// ── Rate limiter (shared, 120ms gap) ──────────────────────────────────────────
let _next = 0;
async function rateWait(): Promise<void> {
  const now = Date.now();
  if (now < _next) await new Promise<void>(r => setTimeout(r, _next - now));
  _next = Date.now() + 120;
}

function apiHeaders(): Record<string, string> {
  return { "TRON-PRO-API-KEY": API_KEY, "Content-Type": "application/json" };
}

// TronGrid fetch with 429 retry
const TG_MAX_RETRIES = 3;
const TG_RETRY_WAIT  = 2_000;
async function tgFetch(path: string, init: RequestInit = {}): Promise<Response> {
  await rateWait();
  const url = `${TRON_GRID}${path}`;
  for (let attempt = 1; attempt <= TG_MAX_RETRIES; attempt++) {
    const res = await fetch(url, { ...init, headers: apiHeaders() });
    if (res.status !== 429) return res;
    console.warn(`[tronRelayer] TronGrid 429 on ${path} (attempt ${attempt}/${TG_MAX_RETRIES}) — waiting ${TG_RETRY_WAIT}ms`);
    if (attempt < TG_MAX_RETRIES) await new Promise<void>(r => setTimeout(r, TG_RETRY_WAIT));
  }
  throw new Error(`TronGrid rate-limited (429) on ${path} after ${TG_MAX_RETRIES} attempts`);
}

// ── Base58 decode (TRON address → 21-byte hex) ────────────────────────────────
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function tronAddrToHex(b58: string): string {
  let n = 0n;
  for (const c of b58) {
    const i = B58.indexOf(c);
    if (i < 0) throw new Error("Invalid base58 character");
    n = n * 58n + BigInt(i);
  }
  return n.toString(16).padStart(50, "0").slice(0, 42);
}

// ── Sign a transaction with the relayer key via TronWeb, then broadcast ───────
async function signAndBroadcast(tx: any): Promise<string> {
  const signedTx = await tronWeb.trx.sign(tx);
  const result   = await tronWeb.trx.sendRawTransaction(signedTx);
  if (!result.result) {
    const rawMsg = result.message ?? "";
    console.error("[relay] broadcast rejected:", rawMsg);
    throw new Error(decodeHexMessage(rawMsg));
  }
  return signedTx.txID as string;
}

// ── Broadcast an already-signed transaction (user-signed, no re-sign) ─────────
async function broadcastSigned(signedTx: any): Promise<{ result: boolean; txID: string; message?: string }> {
  const result = await tronWeb.trx.sendRawTransaction(signedTx);
  return {
    result: !!result.result,
    txID:   signedTx.txID,
    message: result.message,
  };
}

// ── Check user's available energy ─────────────────────────────────────────────
async function getUserEnergy(userHex: string): Promise<number> {
  try {
    const res = await tgFetch("/wallet/getaccountresource", {
      method: "POST",
      body: JSON.stringify({ address: userHex }),
    });
    if (!res.ok) return 0;
    const d = await res.json() as any;
    return Math.max(0, (d.EnergyLimit ?? 0) - (d.EnergyUsed ?? 0));
  } catch {
    return 0;
  }
}

// ── Energy delegation: relayer → target address ───────────────────────────────
async function delegateEnergy(toHex: string): Promise<boolean> {
  if (!RELAY_KEY || !RELAY_ADDR) return false;

  // ── Attempt 1: delegate from existing staked energy ──
  try {
    const res = await tgFetch("/wallet/delegateresource", {
      method: "POST",
      body: JSON.stringify({
        owner_address:    RELAY_ADDR,
        receiver_address: toHex,
        balance:          100_000_000,
        resource:         "ENERGY",
        lock:             false,
        visible:          false,
      }),
    });
    if (res.ok) {
      const delegateTx = await res.json() as any;
      if (!delegateTx.Error && delegateTx.txID) {
        const txId = await signAndBroadcast(delegateTx);
        console.log("[relay] Energy delegated from stake, txID:", txId);
        await new Promise(r => setTimeout(r, 600));
        return true;
      }
    }
  } catch (err: any) {
    console.warn("[relay] Stake delegation error:", err?.message);
  }

  // ── Attempt 2: freeze TRX to acquire energy, then delegate ──
  try {
    const TRX_TO_FREEZE_SUN = 32_000_000;

    const freezeRes = await tgFetch("/wallet/freezebalancev2", {
      method: "POST",
      body: JSON.stringify({
        owner_address:  RELAY_ADDR,
        frozen_balance: TRX_TO_FREEZE_SUN,
        resource:       "ENERGY",
        visible:        false,
      }),
    });
    if (!freezeRes.ok) { console.warn("[relay] Freeze HTTP error:", freezeRes.status); return false; }
    const freezeTx = await freezeRes.json() as any;
    if (freezeTx.Error || !freezeTx.txID) { console.warn("[relay] Freeze tx error:", freezeTx.Error); return false; }

    const freezeTxId = await signAndBroadcast(freezeTx);
    console.log("[relay] TRX frozen for energy, txID:", freezeTxId);
    await new Promise(r => setTimeout(r, 3_500));

    const delRes = await tgFetch("/wallet/delegateresource", {
      method: "POST",
      body: JSON.stringify({
        owner_address:    RELAY_ADDR,
        receiver_address: toHex,
        balance:          TRX_TO_FREEZE_SUN,
        resource:         "ENERGY",
        lock:             false,
        visible:          false,
      }),
    });
    if (!delRes.ok) return false;
    const delTx = await delRes.json() as any;
    if (delTx.Error || !delTx.txID) return false;

    const delTxId = await signAndBroadcast(delTx);
    console.log("[relay] Energy delegated dynamically, txID:", delTxId);
    await new Promise(r => setTimeout(r, 600));
    return true;
  } catch (err: any) {
    console.warn("[relay] Dynamic energy rental error:", err?.message);
    return false;
  }
}

// ── Main relay function ───────────────────────────────────────────────────────
export interface RelayResult {
  txId:      string;
  feeTxId?:  string;
  sponsored: boolean;
  feeMode:   "free" | "rental" | "burn";
}

export async function relayUSDTTransfer(
  signedTx:    any,
  userAddress: string,
  feeTx?:      any | null,
): Promise<RelayResult> {
  const ENERGY_NEEDED = 65_000;
  const userHex = tronAddrToHex(userAddress);

  // 1. Broadcast the service fee transaction first (1 USDT → CoinCash treasury)
  let feeTxId: string | undefined;
  if (feeTx && feeTx.txID && feeTx.raw_data && Array.isArray(feeTx.signature)) {
    try {
      console.log("[relay] Broadcasting service fee tx…");
      const feeResult = await broadcastSigned(feeTx);
      if (feeResult.result) {
        feeTxId = feeTx.txID;
        console.log("[relay] Service fee collected, txID:", feeTxId);
      } else {
        console.warn("[relay] Service fee tx rejected:", feeResult.message);
      }
    } catch (err: any) {
      console.warn("[relay] Service fee broadcast error:", err?.message);
    }
  }

  // 2. Check whether the user already has enough energy
  const availableEnergy = await getUserEnergy(userHex);
  console.log(`[relay] User energy: ${availableEnergy} / ${ENERGY_NEEDED} needed`);

  let sponsored = false;
  let feeMode: RelayResult["feeMode"] = "burn";

  if (availableEnergy >= ENERGY_NEEDED) {
    sponsored = true;
    feeMode   = "free";
    console.log("[relay] User has sufficient energy — skipping delegation.");
  } else {
    console.log("[relay] Insufficient energy — attempting energy provision…");
    sponsored = await delegateEnergy(userHex);
    feeMode   = sponsored ? "rental" : "burn";
  }

  // 3. Broadcast the user's main USDT transfer
  const result = await broadcastSigned(signedTx);

  if (!result.result) {
    const rawMsg = result.message ?? "";
    console.error("[relay] broadcast rejected:", rawMsg);
    throw new Error(decodeHexMessage(rawMsg));
  }

  console.log(`[relay] Main tx OK — txID: ${signedTx.txID}, feeMode: ${feeMode}`);
  return { txId: signedTx.txID, feeTxId, sponsored, feeMode };
}

// ── Helpers for relay metadata ────────────────────────────────────────────────
export function isRelayerConfigured(): boolean {
  return !!(RELAY_KEY && RELAY_ADDR);
}

export function getTreasuryAddress(): string {
  return TREASURY_ADDR;
}

export function getServiceFeeUSDT(): number {
  return SERVICE_FEE_USDT;
}
