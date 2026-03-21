import {
  createContext, useContext, useState, useEffect, useRef, useCallback,
  type ReactNode,
} from "react";
import { io, type Socket } from "socket.io-client";
import { SOCKET_URL, SOCKET_PATH, API_BASE } from "@/lib/apiConfig";
import { resolveIdentity, getDeviceId } from "@/lib/identity";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PlanName     = "free" | "pro";
export type PaymentStatus = "none" | "pending" | "confirmed";

export interface FreemiumStatus {
  plan:       PlanName;
  scansToday: number;
  limit:      number;
  canScan:    boolean;
  remaining:  number | null;
  blocked?:   "evasion" | "limit_reached" | string;
  ipHash?:    string;
}

interface FreemiumContextValue {
  /** Resolved CC-ID for this device (empty string while resolving) */
  ccId:           string;
  /** Current freemium data (scans, plan, etc.) — always from API */
  freemium:       FreemiumStatus;
  /** True once the first API response has landed */
  freemiumLoaded: boolean;
  /** Tracks payment state across all tabs/pages */
  paymentStatus:  PaymentStatus;
  /** Re-fetch freemium status from the API */
  refreshFreemium: () => Promise<void>;
  /** Call when user presses "Ya pagué". Sends upgrade request + sets paymentStatus="pending" */
  requestPayment:  (email: string) => Promise<void>;
  /** Update freemium state after a scan (called by WalletAnalyzer) */
  applyFreemiumUpdate: (updated: FreemiumStatus) => void;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

const FREE_SCAN_LIMIT = 5;

const DEFAULT_FREEMIUM: FreemiumStatus = {
  plan: "free", scansToday: 0, limit: FREE_SCAN_LIMIT, canScan: true, remaining: FREE_SCAN_LIMIT,
};

const FreemiumContext = createContext<FreemiumContextValue | null>(null);

// ── API helpers ───────────────────────────────────────────────────────────────

async function fetchFreemiumStatus(ccId: string): Promise<FreemiumStatus> {
  try {
    const deviceId = getDeviceId();
    const params   = new URLSearchParams({ ccId, ...(deviceId ? { deviceId } : {}) });
    const res      = await fetch(`${API_BASE}/freemium/status?${params}`);
    if (!res.ok) return DEFAULT_FREEMIUM;
    return await res.json();
  } catch {
    return DEFAULT_FREEMIUM;
  }
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function FreemiumProvider({ children }: { children: ReactNode }) {
  const [ccId,           setCcId]           = useState<string>("");
  const [freemium,       setFreemium]       = useState<FreemiumStatus>(DEFAULT_FREEMIUM);
  const [freemiumLoaded, setFreemiumLoaded] = useState(false);
  const [paymentStatus,  setPaymentStatus]  = useState<PaymentStatus>("none");

  const pollRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // ── Boot: resolve identity → fetch plan → start poll ─────────────────────
  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const id = await resolveIdentity();
      if (cancelled) return;

      setCcId(id);

      const status = await fetchFreemiumStatus(id);
      if (cancelled) return;

      setFreemium(status);
      setFreemiumLoaded(true);

      pollRef.current = setInterval(async () => {
        if (cancelled) return;
        const s = await fetchFreemiumStatus(id);
        setFreemium((prev) => {
          if (prev.plan !== "pro" && s.plan === "pro") {
            setPaymentStatus("confirmed");
          }
          return s;
        });
      }, 30_000);
    }

    boot().catch(() => setFreemiumLoaded(true));

    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // ── Socket: single connection, shared across the whole app ────────────────
  useEffect(() => {
    if (!ccId) return;

    const socket = io(SOCKET_URL, {
      path: SOCKET_PATH,
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("register", ccId);
    });

    socket.on("plan-updated", (data: { ccId: string; plan: PlanName }) => {
      if (data.ccId !== ccId) return;

      setFreemium((prev) => ({ ...prev, plan: data.plan }));

      if (data.plan === "pro") {
        setPaymentStatus("confirmed");
      } else {
        // Admin reverted — full reset so "Ya pagué" button reappears
        setPaymentStatus("none");
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [ccId]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const refreshFreemium = useCallback(async () => {
    if (!ccId) return;
    const status = await fetchFreemiumStatus(ccId);
    setFreemium(status);
  }, [ccId]);

  const requestPayment = useCallback(async (email: string) => {
    if (!ccId) return;
    try {
      await fetch(`${API_BASE}/freemium/request-upgrade`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ ccId, email }),
      });
      setPaymentStatus("pending");
    } catch {
      // silently ignore — UI stays in "none" state
    }
  }, [ccId]);

  const applyFreemiumUpdate = useCallback((updated: FreemiumStatus) => {
    setFreemium(updated);
  }, []);

  return (
    <FreemiumContext.Provider value={{
      ccId, freemium, freemiumLoaded, paymentStatus,
      refreshFreemium, requestPayment, applyFreemiumUpdate,
    }}>
      {children}
    </FreemiumContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useFreemium(): FreemiumContextValue {
  const ctx = useContext(FreemiumContext);
  if (!ctx) throw new Error("useFreemium must be used inside <FreemiumProvider>");
  return ctx;
}
