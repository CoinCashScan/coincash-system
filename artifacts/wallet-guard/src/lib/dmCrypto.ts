/**
 * End-to-end encryption for DM messages.
 * Uses AES-256-GCM with a key derived from both users' CC-IDs via PBKDF2.
 * The server only ever sees ciphertext + IV — it cannot decrypt messages.
 */

const SALT       = new TextEncoder().encode("coincash-dm-e2e-v1");
const ITERATIONS = 100_000;

/** Derive a shared AES-256-GCM key from two CC-IDs (deterministic, order-independent). */
async function deriveKey(id1: string, id2: string): Promise<CryptoKey> {
  const password = [id1, id2].sort().join(":");
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: SALT, iterations: ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function toBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

/** Encrypt a plaintext string. Returns base64-encoded ciphertext + IV. */
export async function encryptMessage(
  plaintext: string,
  myId: string,
  theirId: string,
): Promise<{ ciphertext: string; iv: string }> {
  const key = await deriveKey(myId, theirId);
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const enc = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return { ciphertext: toBase64(enc), iv: toBase64(iv) };
}

/** Decrypt a base64-encoded ciphertext. Returns plaintext string. */
export async function decryptMessage(
  ciphertext: string,
  iv: string,
  myId: string,
  theirId: string,
): Promise<string> {
  const key = await deriveKey(myId, theirId);
  const dec = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(iv) },
    key,
    fromBase64(ciphertext),
  );
  return new TextDecoder().decode(dec);
}
