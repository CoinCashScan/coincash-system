import {
  createContext, useContext, useState, useEffect, useRef, useCallback,
  type ReactNode,
} from "react";
import { io, type Socket } from "socket.io-client";
import { SOCKET_URL, SOCKET_PATH, API_BASE } from "@/lib/apiConfig";
import { resolveIdentity, getDeviceId } from "@/lib/identity";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PlanName      = "free" | "basico" | "pro";
export type PaymentStatus = "none" | "pending" | "confirmed";

export interface FreemiumStatus {
  plan:               PlanName;
  scansToday:         number;
  limit:              number;
  canScan:            boolean;
  remaining:          number | null;
  paidScansRemaining: number | null;
  blocked?:           "evasion" | "limit_reached" | string;
  ipHash?:            string;
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
  /** Call when user presses "Ya pagué". Sends upgrade request + triggers blockchain verification */
  requestPayment: (
    email:  string,
    plan:   "basico" | "pro",
    amount: number,
    scans:  number,
  ) => Promise<void>;
  /** Update freemium state after a scan (called by WalletAnalyzer) */
  applyFreemiumUpdate: (updated: FreemiumStatus) => void;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

const FREE_SCAN_LIMIT = 5;

const DEFAULT_FREEMIUM: FreemiumStatus = {
  plan: "free", scansToday: 0, limit: FREE_SCAN_LIMIT,
  canScan: true, remaining: FREE_SCAN_LIMIT, paidScansRemaining: null,
};

const FreemiumContext = createContext<FreemiumContextValue | null>(null);

// ── API helpers ───────────────────────────────────────────────────────────────

async function fetchFreemiumStatus(ccId: string): Promise<FreemiumStatus> {
  try {
    const deviceId = getDeviceId();
    const params   = new URLSearchParams({ ccId, ...(deviceId ? { deviceId } : {}) });
    const res      = await fetch(`${API_BASE}/freemium/status?${params}`);
    if (!res.ok) return DEFAULT_FREEMIUM;
    const data = await res.json();
    return { ...DEFAULT_FREEMIUM, ...data };
  } catch {
    return DEFAULT_FREEMIUM;
  }
}

/**
 * Call the backend verify-payment endpoint.
 * Returns the result payload or null on network error.
 */
async function callVerifyPayment(ccId: string): Promise<{
  status: "confirmed" | "pending" | "error";
  plan?: PlanName;
  paidScansRemaining?: number;
  txId?: string;
} | null> {
  try {
    const res  = await fetch(`${API_BASE}/freemium/verify-payment`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ ccId }),
    });
    return await res.json();
  } catch {
    return null;
  }
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function FreemiumProvider({ children }: { children: ReactNode }) {
  const [ccId,           setCcId]           = useState<string>("");
  const [freemium,       setFreemium]       = useState<FreemiumStatus>(DEFAULT_FREEMIUM);
  const [freemiumLoaded, setFreemiumLoaded] = useState(false);
  const [paymentStatus,  setPaymentStatus]  = useState<PaymentStatus>("none");

  const pollRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const verifyPollRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const socketRef      = useRef<Socket | null>(null);
  const ccIdRef        = useRef<string>("");

  // Keep ccIdRef in sync so callbacks never close over stale ccId
  useEffect(() => { ccIdRef.current = ccId; }, [ccId]);

  // ── Boot: resolve identity → fetch plan → start poll ─────────────────────
  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const id = await resolveIdentity();
      if (cancelled) return;

      setCcId(id);
      ccIdRef.current = id;

      const status = await fetchFreemiumStatus(id);
      if (cancelled) return;

      setFreemium(status);
      setFreemiumLoaded(true);

      // If user was already on a paid plan on boot, mark confirmed
      if (status.plan === "basico" || status.plan === "pro") {
        setPaymentStatus("confirmed");
      }

      // 30s background poll to keep plan/scans in sync
      pollRef.current = setInterval(async () => {
        if (cancelled) return;
        const s = await fetchFreemiumStatus(id);
        setFreemium((prev) => {
          const wasFree = prev.plan === "free";
          const nowPaid = s.plan === "basico" || s.plan === "pro";
          if (wasFree && nowPaid) setPaymentStatus("confirmed");
          return { ...DEFAULT_FREEMIUM, ...s };
        });
      }, 30_000);
    }

    boot().catch(() => setFreemiumLoaded(true));

    return () => {
      cancelled = true;
      if (pollRef.current)       clearInterval(pollRef.current);
      if (verifyPollRef.current) clearInterval(verifyPollRef.current);
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

    socket.on("plan-updated", (data: {
      ccId: string; plan: PlanName; paidScansRemaining?: number;
    }) => {
      if (data.ccId !== ccId) return;

      setFreemium((prev) => ({
        ...prev,
        plan: data.plan,
        // Update scan budget if provided by event
        paidScansRemaining: data.paidScansRemaining ?? prev.paidScansRemaining,
        remaining: data.paidScansRemaining ?? prev.remaining,
        canScan: data.plan !== "free"
          ? (data.paidScansRemaining === undefined ? true : (data.paidScansRemaining ?? 0) > 0)
          : prev.canScan,
      }));

      if (data.plan === "basico" || data.plan === "pro") {
        setPaymentStatus("confirmed");
        // Stop blockchain polling once confirmed via socket
        if (verifyPollRef.current) {
          clearInterval(verifyPollRef.current);
          verifyPollRef.current = null;
        }
      } else {
        // Admin reverted — full reset so "Ya pagué" button reappears
        setPaymentStatus("none");
        setFreemium((prev) => ({
          ...prev, plan: "free",
          paidScansRemaining: null,
          canScan: prev.scansToday < FREE_SCAN_LIMIT,
          remaining: Math.max(0, FREE_SCAN_LIMIT - prev.scansToday),
        }));
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
    setFreemium((prev) => ({ ...prev, ...status }));
  }, [ccId]);

  /**
   * Start polling blockchain every 20 s until payment confirmed or 10 min elapsed.
   * Stops automatically on success or timeout.
   */
  function startVerifyPolling(id: string) {
    if (verifyPollRef.current) clearInterval(verifyPollRef.current);

    const startTime = Date.now();
    const MAX_POLL_MS = 10 * 60 * 1_000; // 10 min

    async function attempt() {
      if (Date.now() - startTime > MAX_POLL_MS) {
        clearInterval(verifyPollRef.current!);
        verifyPollRef.current = null;
        return;
      }
      const result = await callVerifyPayment(id);
      if (!result || result.status !== "confirmed") return;

      // Payment detected — update state
      clearInterval(verifyPollRef.current!);
      verifyPollRef.current = null;

      const plan              = result.plan ?? "pro";
      const paidRemaining     = result.paidScansRemaining ?? null;

      setFreemium((prev) => ({
        ...prev,
        plan,
        paidScansRemaining: paidRemaining,
        remaining:          paidRemaining,
        canScan:            paidRemaining === null ? true : paidRemaining > 0,
      }));
      setPaymentStatus("confirmed");
    }

    // First check immediately
    attempt();
    verifyPollRef.current = setInterval(attempt, 20_000);
  }

  const requestPayment = useCallback(async (
    email:  string,
    plan:   "basico" | "pro",
    amount: number,
    scans:  number,
  ) => {
    const id = ccIdRef.current;
    if (!id) return;
    try {
      await fetch(`${API_BASE}/freemium/request-upgrade`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ ccId: id, email, plan, amount, scans }),
      });
      setPaymentStatus("pending");
      // Immediately kick off blockchain verification polling
      startVerifyPolling(id);
    } catch {
      // silently ignore — UI stays in "none" state
    }
  }, []);

  const applyFreemiumUpdate = useCallback((updated: FreemiumStatus) => {
    setFreemium((prev) => ({ ...prev, ...updated }));
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
