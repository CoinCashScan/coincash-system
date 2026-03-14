// ── Security module: PIN, AES-GCM vault, WebAuthn biometrics ─────────────────

const PIN_VAULT_KEY  = "wg_pin_vault";
const KEYS_VAULT_KEY = "wg_secure_keys";
const BIO_CRED_KEY   = "wg_bio_cred_id";
const SENTINEL       = "WALLET_GUARD_OK";

interface PinVault { salt: string; iv: string; ciphertext: string }
interface KeyEntry  { iv: string; ciphertext: string; salt: string }

// ── Helpers ───────────────────────────────────────────────────────────────────
function hexEncode(buf: ArrayBuffer | Uint8Array): string {
  return Array.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0")).join("");
}
function hexDecode(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i*2, i*2+2), 16);
  return out;
}

async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: salt.buffer as ArrayBuffer, iterations: 200_000 },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
  );
}

async function aesEncrypt(key: CryptoKey, plaintext: string): Promise<{ iv: string; ciphertext: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv.buffer as ArrayBuffer }, key, new TextEncoder().encode(plaintext));
  return { iv: hexEncode(iv), ciphertext: hexEncode(ct) };
}

async function aesDecrypt(key: CryptoKey, iv: string, ciphertext: string): Promise<string> {
  const ivBytes = hexDecode(iv);
  const ctBytes = hexDecode(ciphertext);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBytes.buffer as ArrayBuffer }, key, ctBytes.buffer as ArrayBuffer
  );
  return new TextDecoder().decode(pt);
}

// ── PIN ───────────────────────────────────────────────────────────────────────
export function isPinEnabled(): boolean {
  return !!localStorage.getItem(PIN_VAULT_KEY);
}

export async function setupPin(pin: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const key = await deriveKey(pin, salt);
  const { iv, ciphertext } = await aesEncrypt(key, SENTINEL);
  const vault: PinVault = { salt: hexEncode(salt), iv, ciphertext };
  localStorage.setItem(PIN_VAULT_KEY, JSON.stringify(vault));
}

export async function verifyPin(pin: string): Promise<boolean> {
  const raw = localStorage.getItem(PIN_VAULT_KEY);
  if (!raw) return false;
  try {
    const { salt, iv, ciphertext }: PinVault = JSON.parse(raw);
    const key = await deriveKey(pin, hexDecode(salt));
    const result = await aesDecrypt(key, iv, ciphertext);
    return result === SENTINEL;
  } catch { return false; }
}

export function removePin(): void {
  localStorage.removeItem(PIN_VAULT_KEY);
}

// ── Private key encryption ─────────────────────────────────────────────────────
// When PIN is enabled, private keys are encrypted with that PIN.
// When no PIN is set, they're encrypted with a device-local random key (stored as a "zero-pin" vault).

const DEVICE_KEY_KEY = "wg_device_key";

async function getDeviceKey(): Promise<CryptoKey> {
  let hex = localStorage.getItem(DEVICE_KEY_KEY);
  if (!hex) {
    const raw = crypto.getRandomValues(new Uint8Array(32));
    hex = hexEncode(raw);
    localStorage.setItem(DEVICE_KEY_KEY, hex);
  }
  const keyBytes = hexDecode(hex);
  return crypto.subtle.importKey("raw", keyBytes.buffer as ArrayBuffer, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptPrivateKey(walletId: string, privKeyHex: string, pin?: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  let key: CryptoKey;
  if (pin) {
    key = await deriveKey(pin, salt);
  } else {
    key = await getDeviceKey();
  }
  const { iv, ciphertext } = await aesEncrypt(key, privKeyHex);
  const vault = JSON.parse(localStorage.getItem(KEYS_VAULT_KEY) || "{}");
  vault[walletId] = { iv, ciphertext, salt: hexEncode(salt), pinProtected: !!pin };
  localStorage.setItem(KEYS_VAULT_KEY, JSON.stringify(vault));
}

export async function decryptPrivateKey(walletId: string, pin?: string): Promise<string> {
  const vault = JSON.parse(localStorage.getItem(KEYS_VAULT_KEY) || "{}");
  const entry: KeyEntry & { pinProtected?: boolean } = vault[walletId];
  if (!entry) throw new Error("No encrypted key found for this wallet.");
  let key: CryptoKey;
  if (entry.pinProtected && pin) {
    key = await deriveKey(pin, hexDecode(entry.salt));
  } else {
    key = await getDeviceKey();
  }
  return aesDecrypt(key, entry.iv, entry.ciphertext);
}

export function hasEncryptedKey(walletId: string): boolean {
  const vault = JSON.parse(localStorage.getItem(KEYS_VAULT_KEY) || "{}");
  return !!vault[walletId];
}

export function deleteEncryptedKey(walletId: string): void {
  const vault = JSON.parse(localStorage.getItem(KEYS_VAULT_KEY) || "{}");
  delete vault[walletId];
  localStorage.setItem(KEYS_VAULT_KEY, JSON.stringify(vault));
}

// ── WebAuthn biometrics ────────────────────────────────────────────────────────
export async function isBiometricAvailable(): Promise<boolean> {
  try {
    if (!window.PublicKeyCredential) return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch { return false; }
}

export async function registerBiometric(): Promise<boolean> {
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userId = crypto.getRandomValues(new Uint8Array(16));
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: "CoinCash WalletGuard", id: window.location.hostname },
        user: { id: userId, name: "walletguard", displayName: "WalletGuard User" },
        pubKeyCredParams: [{ alg: -7, type: "public-key" }, { alg: -257, type: "public-key" }],
        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
        timeout: 60000,
      }
    }) as PublicKeyCredential | null;
    if (!cred) return false;
    localStorage.setItem(BIO_CRED_KEY, hexEncode(new Uint8Array(cred.rawId)));
    return true;
  } catch { return false; }
}

export async function authenticateBiometric(): Promise<boolean> {
  try {
    const credIdHex = localStorage.getItem(BIO_CRED_KEY);
    if (!credIdHex) return false;
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const credId = hexDecode(credIdHex);
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: challenge.buffer as ArrayBuffer,
        allowCredentials: [{ id: credId.buffer as ArrayBuffer, type: "public-key" }],
        userVerification: "required",
        timeout: 60000,
        rpId: window.location.hostname,
      }
    });
    return !!assertion;
  } catch { return false; }
}

export function isBiometricRegistered(): boolean {
  return !!localStorage.getItem(BIO_CRED_KEY);
}

export function removeBiometric(): void {
  localStorage.removeItem(BIO_CRED_KEY);
}
