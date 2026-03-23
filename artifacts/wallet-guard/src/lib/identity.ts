import { API_BASE } from "@/lib/apiConfig";

// ── Storage keys ─────────────────────────────────────────────────────────────
// coincash-cc-id  → The user's primary CC-ID (CC-XXXXXX), generated ONCE locally.
//                   Persisted in localStorage. NEVER regenerated between sessions.
// cc-sync-claim  → Pending sync code entered by a PRO user on a new browser.
// cc-device-id   → Secondary UUID for sub-device tracking (fingerprint-free fallback).

const LS_CC_ID       = "coincash-cc-id";
const LS_SYNC_CLAIM  = "cc-sync-claim";
const LS_DEVICE_UUID = "cc-device-id";

/**
 * Returns the stable device UUID for this browser.
 * Generated once with crypto.randomUUID() and persisted in localStorage.
 * Used only as secondary anti-abuse signal — NOT the primary user identifier.
 */
export function getDeviceId(): string {
  try {
    const stored = localStorage.getItem(LS_DEVICE_UUID);
    if (stored) return stored;
    const id = crypto.randomUUID();
    localStorage.setItem(LS_DEVICE_UUID, id);
    return id;
  } catch {
    return "";
  }
}

let _resolvePromise: Promise<string> | null = null;

/**
 * Resolves the user's persistent CC-ID.
 *
 * Resolution order:
 *   1. Pending sync claim (PRO recovery code entered on this browser).
 *   2. Existing CC-ID in localStorage  →  return as-is, no server call.
 *   3. Generate a new CC-XXXXXX locally, save, return.
 *
 * IMPORTANT: No fingerprint API call — avoids the multi-ID problem where
 * the same user gets a different ID on each new browser or IP change.
 * The ID is created ONCE per localStorage origin and never changes.
 */
export async function resolveIdentity(): Promise<string> {
  if (_resolvePromise) return _resolvePromise;

  _resolvePromise = (async () => {
    // ── Priority 1: Pending sync claim (PRO recovery on a new browser) ──────
    const pendingCode = localStorage.getItem(LS_SYNC_CLAIM);
    if (pendingCode) {
      try {
        const res = await fetch(`${API_BASE}/freemium/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: pendingCode }),
        });
        if (res.ok) {
          const { ccId } = await res.json();
          if (ccId && typeof ccId === "string") {
            localStorage.setItem(LS_CC_ID, ccId);
            localStorage.removeItem(LS_SYNC_CLAIM);
            return ccId;
          }
        }
      } catch {}
      // Bad code or network error — clear and continue
      localStorage.removeItem(LS_SYNC_CLAIM);
    }

    // ── Priority 2: Existing local CC-ID ────────────────────────────────────
    const existing = localStorage.getItem(LS_CC_ID);
    if (existing && existing.startsWith("CC-")) return existing;

    // ── Priority 3: Generate new CC-ID locally (ONE time per browser) ───────
    const digits = Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");
    const newId  = `CC-${digits}`;
    localStorage.setItem(LS_CC_ID, newId);
    return newId;
  })();

  return _resolvePromise;
}

/**
 * Generate a stable device fingerprint hash.
 * Based on: User-Agent + screen resolution + timezone.
 * Result is 16 hex chars (truncated SHA-256) and cached in localStorage.
 *
 * - Does NOT depend on localStorage content → survives clearing
 * - Changing browser ≠ same fingerprint (UA differs)
 * - Same browser on same device → same fingerprint across sessions
 */
const LS_FP_HASH = "cc-fp-hash";

export async function getDeviceHash(): Promise<string> {
  try {
    // Return cached fingerprint if already computed this session
    const cached = sessionStorage.getItem(LS_FP_HASH);
    if (cached) return cached;

    const raw = [
      navigator.userAgent,
      `${screen.width}x${screen.height}`,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      String(navigator.hardwareConcurrency ?? ""),
      navigator.platform ?? "",
    ].join("|");

    let hash = "";
    if (crypto?.subtle) {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
      hash = Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, 32);
    } else {
      let h = 0;
      for (let i = 0; i < raw.length; i++) {
        h = (Math.imul(31, h) + raw.charCodeAt(i)) | 0;
      }
      hash = Math.abs(h).toString(16).padStart(8, "0");
    }

    try { sessionStorage.setItem(LS_FP_HASH, hash); } catch {}
    return hash;
  } catch {
    return "";
  }
}

/**
 * Store a sync code that will be claimed on the next page load.
 * After calling this, reload the page so resolveIdentity picks it up.
 */
export function claimSyncCode(code: string): void {
  localStorage.setItem(LS_SYNC_CLAIM, code.trim().toUpperCase());
}

/**
 * Reset the secondary device UUID (cc-device-id) and return a new one.
 * This does NOT change the CC-ID or IP counters.
 * Used by the "Restablecer dispositivo" button in settings.
 */
export function resetDeviceId(): string {
  try {
    const id = crypto.randomUUID();
    localStorage.setItem(LS_DEVICE_UUID, id);
    return id;
  } catch {
    return "";
  }
}
