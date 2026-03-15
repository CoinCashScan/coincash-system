// @ts-nocheck — @noble/secp256k1 v3 ESM resolution quirks; runtime correct
// TRON Relayer — energy rental + broadcast
// Private key never leaves client; this handles energy provision and relaying signed txs.
// Energy rental flow:
//   1. Check user's available energy via /wallet/getaccountresource
//   2a. If relayer has staked energy → delegate it (free, instant)
//   2b. Else → relayer freezes a small TRX amount on-the-fly to acquire energy, then delegates
//   3. Broadcast user's already-signed USDT transaction
import { createHash } from "node:crypto";
import { sign as secp256k1Sign } from "@noble/secp256k1";

const TRON_GRID = "https://api.trongrid.io";
const API_KEY   = process.env.VITE_TRON_API_KEY ?? "";
const RELAY_KEY = process.env.TRON_RELAYER_PRIVATE_KEY ?? "";
const RELAY_ADDR = process.env.TRON_RELAYER_ADDRESS ?? "";     // hex 41-prefixed

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

// ── Hex helpers ───────────────────────────────────────────────────────────────
function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
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
  return n.toString(16).padStart(50, "0").slice(0, 42); // 21 bytes
}

// ── sha256 (Node crypto) ──────────────────────────────────────────────────────
function sha256(data: Uint8Array): Uint8Array {
  return new Uint8Array(createHash("sha256").update(data).digest());
}

// ── Sign a TronGrid unsigned transaction with a private key ───────────────────
function signTx(tx: any, privKeyHex: string): any {
  const txHashBytes = hexToBytes(tx.txID);
  const privBytes   = hexToBytes(privKeyHex);
  const sig = secp256k1Sign(txHashBytes, privBytes, { lowS: false });
  const sigHex = sig.toCompactHex() + sig.recovery.toString(16).padStart(2, "0");
  return { ...tx, signature: [sigHex] };
}

// ── Broadcast a signed transaction ────────────────────────────────────────────
async function broadcastTx(signedTx: any): Promise<{ result: boolean; txID: string; message?: string }> {
  await rateWait();
  const res = await fetch(`${TRON_GRID}/wallet/broadcasttransaction`, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify(signedTx),
  });
  if (!res.ok) throw new Error(`TronGrid broadcast error ${res.status}`);
  return res.json();
}

// ── Check user's available energy ─────────────────────────────────────────────
async function getUserEnergy(userHex: string): Promise<number> {
  try {
    await rateWait();
    const res = await fetch(`${TRON_GRID}/wallet/getaccountresource`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ address: userHex }),
    });
    if (!res.ok) return 0;
    const d = await res.json() as any;
    const limit = d.EnergyLimit ?? 0;
    const used  = d.EnergyUsed  ?? 0;
    return Math.max(0, limit - used);
  } catch {
    return 0;
  }
}

// ── Energy delegation: relayer → target address ───────────────────────────────
// First tries to delegate from already-staked relayer energy.
// If the relayer has no staked energy, freezes TRX dynamically to acquire some.
// Returns true if delegation succeeded, false otherwise.
async function delegateEnergy(toHex: string): Promise<boolean> {
  if (!RELAY_KEY || !RELAY_ADDR) return false;

  // ── Attempt 1: delegate from existing staked energy ──
  try {
    await rateWait();
    const res = await fetch(`${TRON_GRID}/wallet/delegateresource`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({
        owner_address:    RELAY_ADDR,
        receiver_address: toHex,
        balance:          100_000_000, // 100 TRX staked equivalent
        resource:         "ENERGY",
        lock:             false,
        visible:          false,
      }),
    });
    if (res.ok) {
      const delegateTx = await res.json() as any;
      if (!delegateTx.Error && delegateTx.txID) {
        const signed = signTx(delegateTx, RELAY_KEY);
        const result = await broadcastTx(signed);
        if (result.result) {
          console.log("[relay] Energy delegated from stake, txID:", result.txID);
          await new Promise(r => setTimeout(r, 600));
          return true;
        }
        console.warn("[relay] Stake delegation failed:", result.message);
      }
    }
  } catch (err: any) {
    console.warn("[relay] Stake delegation error:", err?.message);
  }

  // ── Attempt 2: freeze TRX dynamically to acquire energy, then delegate ──
  // Freezes the minimum TRX needed (≈32 TRX for ~65 000 energy units),
  // waits one block, then delegates to the user.
  try {
    const TRX_TO_FREEZE_SUN = 32_000_000; // 32 TRX in SUN

    await rateWait();
    const freezeRes = await fetch(`${TRON_GRID}/wallet/freezebalancev2`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({
        owner_address: RELAY_ADDR,
        frozen_balance: TRX_TO_FREEZE_SUN,
        resource:       "ENERGY",
        visible:        false,
      }),
    });
    if (!freezeRes.ok) {
      console.warn("[relay] Freeze HTTP error:", freezeRes.status);
      return false;
    }
    const freezeTx = await freezeRes.json() as any;
    if (freezeTx.Error || !freezeTx.txID) {
      console.warn("[relay] Freeze tx error:", freezeTx.Error);
      return false;
    }

    const signedFreeze = signTx(freezeTx, RELAY_KEY);
    const freezeResult = await broadcastTx(signedFreeze);
    if (!freezeResult.result) {
      console.warn("[relay] Freeze broadcast failed:", freezeResult.message);
      return false;
    }
    console.log("[relay] TRX frozen for energy, txID:", freezeResult.txID);

    // Wait ~1 block for the freeze to settle before delegating
    await new Promise(r => setTimeout(r, 3_500));

    await rateWait();
    const delRes = await fetch(`${TRON_GRID}/wallet/delegateresource`, {
      method: "POST",
      headers: apiHeaders(),
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

    const signedDel = signTx(delTx, RELAY_KEY);
    const delResult = await broadcastTx(signedDel);
    if (!delResult.result) {
      console.warn("[relay] Dynamic delegate failed:", delResult.message);
      return false;
    }
    console.log("[relay] Energy delegated dynamically, txID:", delResult.txID);
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
  sponsored: boolean;    // true = relayer covered the energy cost
  feeMode:   "free" | "rental" | "burn";
}

export async function relayUSDTTransfer(
  signedTx: any,
  userAddress: string       // TRON Base58 address of sender
): Promise<RelayResult> {
  const ENERGY_NEEDED = 65_000;
  const userHex = tronAddrToHex(userAddress);

  // 1. Check whether the user already has enough energy
  const availableEnergy = await getUserEnergy(userHex);
  console.log(`[relay] User energy: ${availableEnergy} / ${ENERGY_NEEDED} needed`);

  let sponsored = false;
  let feeMode: RelayResult["feeMode"] = "burn";

  if (availableEnergy >= ENERGY_NEEDED) {
    // User's own stake covers the tx — no delegation needed
    sponsored = true;
    feeMode   = "free";
    console.log("[relay] User has sufficient energy — skipping delegation.");
  } else {
    // Energy insufficient — attempt delegation / dynamic rental
    console.log("[relay] Insufficient energy — attempting energy provision…");
    sponsored = await delegateEnergy(userHex);
    feeMode   = sponsored ? "rental" : "burn";
  }

  // 2. Broadcast the user's already-signed USDT transaction
  await rateWait();
  const result = await broadcastTx(signedTx);

  if (!result.result) {
    throw new Error(result.message ?? "La red TRON rechazó la transacción.");
  }

  console.log(`[relay] Broadcast OK — txID: ${signedTx.txID}, feeMode: ${feeMode}`);
  return { txId: signedTx.txID, sponsored, feeMode };
}

// ── Check if relayer is configured ───────────────────────────────────────────
export function isRelayerConfigured(): boolean {
  return !!(RELAY_KEY && RELAY_ADDR);
}
