// @ts-nocheck — noble ESM packages have bundler-resolution type quirks; runtime is fine.
import { getPublicKey, utils as secpUtils } from "@noble/secp256k1";

/** SHA-256 via browser Web Crypto API */
async function sha256Bytes(data: Uint8Array): Promise<Uint8Array> {
  const buf = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(buf);
}

// ── Minimal inline Keccak-256 (TRON/Ethereum standard) ───────────────────────
// Adapted from the keccak reference — no external dependency needed.

const RC: bigint[] = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];

const ROTC = [
  [1, 0], [62, 1], [28, 2], [27, 3], [36, 4],
  [44, 5], [20, 6], [6, 7], [55, 8], [43, 9],
  [25, 10], [39, 11], [15, 12], [21, 13], [8, 14],
  [18, 15], [2, 16], [61, 17], [56, 18], [14, 19],
  [27, 20], [14, 21], [2, 22], [62, 23], [46, 24],
];

function rol64(val: bigint, shift: number): bigint {
  shift &= 63;
  return ((val << BigInt(shift)) | (val >> BigInt(64 - shift))) & 0xFFFFFFFFFFFFFFFFn;
}

function keccakF(s: bigint[]): void {
  for (let r = 0; r < 24; r++) {
    const c = [0, 1, 2, 3, 4].map(x => s[x] ^ s[x + 5] ^ s[x + 10] ^ s[x + 15] ^ s[x + 20]);
    const d = c.map((cv, x) => cv ^ rol64(c[(x + 1) % 5], 1));
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) s[x + y * 5] ^= d[x];
    const b: bigint[] = new Array(25).fill(0n);
    for (const [rot, idx] of ROTC) b[((2 * (idx % 5) + 3 * Math.floor(idx / 5)) % 5) + Math.floor(idx / 5) * 5] = rol64(s[idx], rot);
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) s[x + y * 5] = b[x + y * 5] ^ (~b[(x + 1) % 5 + y * 5] & b[(x + 2) % 5 + y * 5]);
    s[0] ^= RC[r];
  }
}

function keccak256(data: Uint8Array): Uint8Array {
  const rate = 136; // 1088 bits
  const padded = new Uint8Array(Math.ceil((data.length + 1) / rate) * rate);
  padded.set(data);
  padded[data.length] = 0x01;
  padded[padded.length - 1] |= 0x80;

  const state: bigint[] = new Array(25).fill(0n);
  for (let i = 0; i < padded.length; i += rate) {
    for (let j = 0; j < rate / 8; j++) {
      let lane = 0n;
      for (let b = 0; b < 8; b++) lane |= BigInt(padded[i + j * 8 + b]) << BigInt(8 * b);
      state[j] ^= lane;
    }
    keccakF(state);
  }
  const out = new Uint8Array(32);
  for (let j = 0; j < 4; j++) {
    const lane = state[j];
    for (let b = 0; b < 8; b++) out[j * 8 + b] = Number((lane >> BigInt(8 * b)) & 0xFFn);
  }
  return out;
}

// ── Base58 encoding ───────────────────────────────────────────────────────────
const B58_ALPHA = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Encode(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let res = "";
  while (n > 0n) { const r = Number(n % 58n); res = B58_ALPHA[r] + res; n /= 58n; }
  for (const b of bytes) { if (b !== 0) break; res = "1" + res; }
  return res;
}

// ── TRON wallet generation ────────────────────────────────────────────────────
export interface TronWallet {
  address: string;
  privateKey: string;
}

export async function generateTronWallet(): Promise<TronWallet> {
  // 1. Random private key (32 bytes, valid secp256k1 scalar)
  const privKey = secpUtils.randomPrivateKey();

  // 2. Uncompressed public key (65 bytes: 0x04 || x || y)
  const pubKey = getPublicKey(privKey, false);

  // 3. Keccak256 of the 64-byte public key body (drop 0x04 prefix)
  const pubBody = pubKey.slice(1); // 64 bytes
  const hash = keccak256(pubBody);

  // 4. Take last 20 bytes as the Ethereum-style address bytes
  const addrBytes = hash.slice(12); // 20 bytes

  // 5. Prepend TRON mainnet prefix 0x41
  const raw = new Uint8Array(21);
  raw[0] = 0x41;
  raw.set(addrBytes, 1);

  // 6. Double-SHA256 checksum (first 4 bytes)
  const checksum = (await sha256Bytes(await sha256Bytes(raw))).slice(0, 4);

  // 7. Concatenate and base58-encode
  const full = new Uint8Array(25);
  full.set(raw);
  full.set(checksum, 21);

  return {
    address: base58Encode(full),
    privateKey: Array.from(privKey).map(b => b.toString(16).padStart(2, "0")).join(""),
  };
}
