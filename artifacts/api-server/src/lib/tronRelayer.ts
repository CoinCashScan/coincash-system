// TRON Relayer — server-side energy delegation + broadcast
// Private key never leaves client; this only handles delegation and relaying signed txs.
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

// ── Energy delegation: relayer → target address ───────────────────────────────
// Delegates 100 TRX worth of already-staked energy from the relayer to `toHex`.
// Returns true if delegation succeeded, false if relayer has no staked energy.
async function delegateEnergy(toHex: string): Promise<boolean> {
  if (!RELAY_KEY || !RELAY_ADDR) return false; // not configured

  try {
    await rateWait();
    const res = await fetch(`${TRON_GRID}/wallet/delegateresource`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({
        owner_address: RELAY_ADDR,
        receiver_address: toHex,
        balance: 100_000_000, // 100 TRX staked equivalent
        resource: "ENERGY",
        lock: false,
        visible: false,
      }),
    });

    if (!res.ok) return false;
    const delegateTx = await res.json();
    if (delegateTx.Error || !delegateTx.txID) return false;

    // Sign and broadcast the delegation tx using relayer private key
    const signedDelegate = signTx(delegateTx, RELAY_KEY);
    const result = await broadcastTx(signedDelegate);
    if (!result.result) {
      console.warn("[relay] Energy delegation failed:", result.message);
      return false;
    }

    console.log("[relay] Energy delegated successfully, txID:", result.txID);
    // Brief wait for delegation to propagate (1 block ~3s, but delegation is often immediate)
    await new Promise(r => setTimeout(r, 500));
    return true;
  } catch (err: any) {
    console.warn("[relay] Energy delegation error:", err?.message);
    return false;
  }
}

// ── Main relay function ───────────────────────────────────────────────────────
export interface RelayResult {
  txId: string;
  sponsored: boolean;  // true = relayer covered the energy cost
}

export async function relayUSDTTransfer(
  signedTx: any,
  userAddress: string       // TRON Base58 address of sender
): Promise<RelayResult> {
  // 1. Attempt energy delegation so user pays 0 TRX
  const userHex = tronAddrToHex(userAddress);
  const sponsored = await delegateEnergy(userHex);

  // 2. Broadcast the user's already-signed USDT transaction
  await rateWait();
  const result = await broadcastTx(signedTx);

  if (!result.result) {
    throw new Error(result.message ?? "La red TRON rechazó la transacción.");
  }

  return { txId: signedTx.txID, sponsored };
}

// ── Check if relayer is configured ───────────────────────────────────────────
export function isRelayerConfigured(): boolean {
  return !!(RELAY_KEY && RELAY_ADDR);
}
