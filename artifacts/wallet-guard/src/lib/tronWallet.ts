// @ts-nocheck — noble/scure ESM packages have bundler-resolution quirks; runtime is correct.
import { getPublicKey, utils as secpUtils } from "@noble/secp256k1";
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { HDKey } from "@scure/bip32";

// ── Web Crypto helpers ────────────────────────────────────────────────────────
async function sha256Bytes(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data));
}

// ── Keccak-256 (inline, no external dep) ─────────────────────────────────────
const RC = [
  0x0000000000000001n,0x0000000000008082n,0x800000000000808an,0x8000000080008000n,
  0x000000000000808bn,0x0000000080000001n,0x8000000080008081n,0x8000000000008009n,
  0x000000000000008an,0x0000000000000088n,0x0000000080008009n,0x000000008000000an,
  0x000000008000808bn,0x800000000000008bn,0x8000000000008089n,0x8000000000008003n,
  0x8000000000008002n,0x8000000000000080n,0x000000000000800an,0x800000008000000an,
  0x8000000080008081n,0x8000000000008080n,0x0000000080000001n,0x8000000080008008n,
];
const ROTC = [
  [1,0],[62,1],[28,2],[27,3],[36,4],[44,5],[20,6],[6,7],[55,8],[43,9],
  [25,10],[39,11],[15,12],[21,13],[8,14],[18,15],[2,16],[61,17],[56,18],[14,19],
  [27,20],[14,21],[2,22],[62,23],[46,24],
];
function rol64(v: bigint, s: number): bigint { s &= 63; return ((v<<BigInt(s))|(v>>BigInt(64-s)))&0xFFFFFFFFFFFFFFFFn; }
function keccakF(s: bigint[]): void {
  for (let r=0;r<24;r++){
    const c=[0,1,2,3,4].map(x=>s[x]^s[x+5]^s[x+10]^s[x+15]^s[x+20]);
    const d=c.map((v,x)=>v^rol64(c[(x+1)%5],1));
    for(let x=0;x<5;x++) for(let y=0;y<5;y++) s[x+y*5]^=d[x];
    const b=new Array(25).fill(0n);
    for(const [rot,idx] of ROTC) b[((2*(idx%5)+3*Math.floor(idx/5))%5)+Math.floor(idx/5)*5]=rol64(s[idx],rot);
    for(let x=0;x<5;x++) for(let y=0;y<5;y++) s[x+y*5]=b[x+y*5]^(~b[(x+1)%5+y*5]&b[(x+2)%5+y*5]);
    s[0]^=RC[r];
  }
}
function keccak256(data: Uint8Array): Uint8Array {
  const rate=136;
  const padded=new Uint8Array(Math.ceil((data.length+1)/rate)*rate);
  padded.set(data); padded[data.length]=0x01; padded[padded.length-1]|=0x80;
  const state=new Array(25).fill(0n);
  for(let i=0;i<padded.length;i+=rate){
    for(let j=0;j<rate/8;j++){
      let lane=0n;
      for(let b=0;b<8;b++) lane|=BigInt(padded[i+j*8+b])<<BigInt(8*b);
      state[j]^=lane;
    }
    keccakF(state);
  }
  const out=new Uint8Array(32);
  for(let j=0;j<4;j++){const lane=state[j]; for(let b=0;b<8;b++) out[j*8+b]=Number((lane>>BigInt(8*b))&0xFFn);}
  return out;
}

// ── Base58 (inline) ───────────────────────────────────────────────────────────
const B58="123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58Encode(bytes: Uint8Array): string {
  let n=0n; for(const b of bytes) n=n*256n+BigInt(b);
  let r="";
  while(n>0n){const m=Number(n%58n);r=B58[m]+r;n/=58n;}
  for(const b of bytes){if(b!==0)break;r="1"+r;}
  return r;
}
function base58Decode(s: string): Uint8Array {
  let n=0n;
  for(const c of s){const i=B58.indexOf(c);if(i<0)throw new Error("Invalid base58");n=n*58n+BigInt(i);}
  const hex=n.toString(16).padStart(50,"0");
  const bytes=new Uint8Array(25);
  for(let i=0;i<25;i++) bytes[i]=parseInt(hex.slice(i*2,i*2+2),16);
  return bytes;
}

// ── Address conversion ────────────────────────────────────────────────────────
async function privKeyToTronAddress(privKey: Uint8Array): Promise<string> {
  const pubKey = getPublicKey(privKey, false); // 65 bytes
  const hash = keccak256(pubKey.slice(1));     // 32 bytes
  const addrBytes = hash.slice(12);            // 20 bytes
  const raw = new Uint8Array(21);
  raw[0] = 0x41; raw.set(addrBytes, 1);
  const checksum = (await sha256Bytes(await sha256Bytes(raw))).slice(0, 4);
  const full = new Uint8Array(25);
  full.set(raw); full.set(checksum, 21);
  return base58Encode(full);
}

// ── Validate TRON base58 address with checksum ────────────────────────────────
export async function validateTronAddress(addr: string): Promise<boolean> {
  if (!/^T[A-Za-z0-9]{33}$/.test(addr)) return false;
  try {
    const bytes = base58Decode(addr);
    const raw = bytes.slice(0, 21);
    const checksum = bytes.slice(21);
    const expected = (await sha256Bytes(await sha256Bytes(raw))).slice(0, 4);
    return checksum.every((b, i) => b === expected[i]);
  } catch { return false; }
}

// ── hex helpers ───────────────────────────────────────────────────────────────
export function hexToBytes(hex: string): Uint8Array {
  const h = hex.replace(/^0x/, "");
  if (h.length !== 64) throw new Error("Private key must be 32 bytes (64 hex chars)");
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(h.slice(i*2, i*2+2), 16);
  return out;
}
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ── TRON Wallet types ─────────────────────────────────────────────────────────
export interface TronWallet {
  address: string;
  privateKey: string;
  mnemonic?: string;
}

// ── Generate new wallet (BIP44 m/44'/195'/0'/0/0) ────────────────────────────
export async function generateTronWallet(): Promise<TronWallet> {
  const mnemonic = generateMnemonic(wordlist, 128); // 12 words
  const seed = mnemonicToSeedSync(mnemonic);
  const root = HDKey.fromMasterSeed(seed);
  const child = root.derive("m/44'/195'/0'/0/0");
  if (!child.privateKey) throw new Error("Key derivation failed");
  const address = await privKeyToTronAddress(child.privateKey);
  return { address, privateKey: bytesToHex(child.privateKey), mnemonic };
}

// ── Import from mnemonic phrase ───────────────────────────────────────────────
export async function importFromMnemonic(phrase: string): Promise<TronWallet> {
  const normalized = phrase.trim().toLowerCase().replace(/\s+/g, " ");
  if (!validateMnemonic(normalized, wordlist)) {
    throw new Error("Frase de recuperación inválida. Verifica las palabras.");
  }
  const seed = mnemonicToSeedSync(normalized);
  const root = HDKey.fromMasterSeed(seed);
  const child = root.derive("m/44'/195'/0'/0/0");
  if (!child.privateKey) throw new Error("Key derivation failed");
  const address = await privKeyToTronAddress(child.privateKey);
  return { address, privateKey: bytesToHex(child.privateKey), mnemonic: normalized };
}

// ── Import from raw private key (hex) ────────────────────────────────────────
export async function importFromPrivateKey(privKeyHex: string): Promise<TronWallet> {
  const privKey = hexToBytes(privKeyHex.trim());
  // Validate it's a valid secp256k1 scalar (> 0 and < curve order)
  const n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
  let val = 0n;
  for (const b of privKey) val = val * 256n + BigInt(b);
  if (val === 0n || val >= n) throw new Error("Clave privada inválida.");
  const address = await privKeyToTronAddress(privKey);
  return { address, privateKey: bytesToHex(privKey) };
}

// ── Import from Keystore JSON (TRON/Ethereum v3, pbkdf2) ─────────────────────
export async function importFromKeystore(json: string, password: string): Promise<TronWallet> {
  let ks: any;
  try { ks = JSON.parse(json); } catch { throw new Error("JSON inválido."); }
  if (ks.version !== 3 || !ks.crypto) throw new Error("Formato de Keystore no soportado.");
  const { ciphertext, cipherparams, cipher, kdf, kdfparams, mac } = ks.crypto;
  if (kdf !== "pbkdf2") throw new Error("Solo se soporta kdf=pbkdf2.");
  if (cipher !== "aes-128-ctr") throw new Error("Solo se soporta aes-128-ctr.");

  const saltBytes = hexToBytes(kdfparams.salt.padStart(64, "0").slice(-64));
  const pwBytes = new TextEncoder().encode(password);

  // Derive key via PBKDF2-SHA256
  const baseKey = await crypto.subtle.importKey("raw", pwBytes, "PBKDF2", false, ["deriveBits"]);
  const derivedBits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: saltBytes.slice(0, 32), iterations: kdfparams.c || 8192 },
    baseKey, 256
  );
  const derivedKey = new Uint8Array(derivedBits); // 32 bytes

  // Verify MAC: keccak256(derivedKey[16:32] || ciphertext)
  const ctBytes = hexToBytes(ciphertext.padStart(64, "0").slice(-64));
  const macInput = new Uint8Array([...derivedKey.slice(16), ...ctBytes]);
  const calcMac = bytesToHex(keccak256(macInput));
  if (calcMac.toLowerCase() !== mac.toLowerCase()) throw new Error("Contraseña incorrecta o Keystore corrupto.");

  // AES-128-CTR decrypt
  const ivBytes = hexToBytes((cipherparams.iv as string).padStart(32, "0").slice(-32));
  const aesKey = await crypto.subtle.importKey(
    "raw", derivedKey.slice(0, 16), { name: "AES-CTR" }, false, ["decrypt"]
  );
  const privKeyBytes = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-CTR", counter: ivBytes, length: 64 }, aesKey, ctBytes)
  );
  return importFromPrivateKey(bytesToHex(privKeyBytes));
}
