import { useState, useEffect, useRef, useCallback } from "react";
import { useChatSocket } from "@/hooks/useChatSocket";
import { API_BASE } from "@/lib/apiConfig";

// ── Media helpers ─────────────────────────────────────────────────────────────
const IMG_PREFIX  = "[MEDIA_IMG:";
const FILE_PREFIX = "[MEDIA_FILE:";
const API_STATIC  = API_BASE;

function isMediaMsg(text: string) {
  return text.startsWith(IMG_PREFIX) || text.startsWith(FILE_PREFIX);
}

function AdminMediaBubble({ message, onImageClick }: { message: string; onImageClick: (url: string) => void }) {
  if (message.startsWith(IMG_PREFIX)) {
    const objectPath = message.slice(IMG_PREFIX.length, -1);
    const url = `${API_STATIC}/storage${objectPath}`;
    return (
      <img
        src={url}
        alt="imagen"
        onClick={() => onImageClick(url)}
        style={{ maxWidth: 220, maxHeight: 200, borderRadius: 10, display: "block", cursor: "zoom-in" }}
        onError={(e) => { (e.target as HTMLImageElement).alt = "No se pudo cargar"; }}
      />
    );
  }
  if (message.startsWith(FILE_PREFIX)) {
    const parts      = message.slice(FILE_PREFIX.length, -1).split(":");
    const objectPath = parts[0];
    const filename   = parts[1] ?? "archivo";
    return (
      <a
        href={`${API_STATIC}/storage${objectPath}`}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: "#00FFC6", fontSize: 13, textDecoration: "underline" }}
      >
        📎 {filename}
      </a>
    );
  }
  return null;
}

const ADMIN_CC_ID = "CC-801286";
const SUPPORT_ID  = "CC-SUPPORT";
const API         = API_BASE;

interface ConvSummary {
  userId:       string;
  lastMessage:  string;
  lastTime:     string;
  lastSender:   string;
  photoUrl?:    string | null;
  unreadCount?: number;
}

/** Play a short notification beep using the Web Audio API — no files needed. */
function playNotif() {
  try {
    const ctx  = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch { /* silently ignore if audio not available */ }
}

interface ChatMessage {
  id:           number;
  senderCcId:   string;
  receiverCcId: string;
  message:      string;
  timestamp:    string;
}

function timeStr(ts: string) {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

interface CountryRecord { name: string; code: string; count: number; }
interface VisitStats   { total: number; countries: CountryRecord[]; }
interface ScanStats    { total: number; today: number; byCountry: { name: string; code: string; count: number }[]; recent: { id: number; wallet: string; country: string; country_code: string; device_id: string; cc_id: string; ip_hash: string; plan_type: string; scanned_at: string }[]; }

const SCAN_KEY = "CoinCashAdmin2026";

function flagEmoji(code: string) {
  if (!code || code === "xx") return "🌐";
  return code.toUpperCase().replace(/./g, ch => String.fromCodePoint(ch.charCodeAt(0) + 127397));
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
}

// ── Admin credentials (frontend gate — not a security replacement) ────────────
const ADMIN_USER = "Admin";
const ADMIN_PASS = "@dmin!001";
const SESSION_KEY = "cc_admin_auth";

function AdminLoginGate({ onLogin }: { onLogin: () => void }) {
  const [user, setUser]   = useState("");
  const [pass, setPass]   = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy]   = useState(false);
  const [showPass, setShowPass] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setTimeout(() => {
      if (user.trim() === ADMIN_USER && pass === ADMIN_PASS) {
        sessionStorage.setItem(SESSION_KEY, "1");
        onLogin();
      } else {
        setError("Usuario o contraseña incorrectos");
      }
      setBusy(false);
    }, 600);
  };

  return (
    <div style={{
      minHeight: "100dvh", background: "#0B0F14", display: "flex",
      flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: 24, fontFamily: "system-ui, sans-serif",
    }}>
      {/* Logo */}
      <div style={{ marginBottom: 32, textAlign: "center" }}>
        <div style={{ fontSize: 32, fontWeight: 800, color: "#00FFC6", letterSpacing: "-0.5px" }}>
          CoinCash
        </div>
        <div style={{ fontSize: 13, color: "#4B5563", marginTop: 4 }}>Panel de administración</div>
      </div>

      {/* Card */}
      <form
        onSubmit={handleSubmit}
        style={{
          width: "100%", maxWidth: 360,
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 20, padding: "32px 28px",
        }}
      >
        <div style={{ marginBottom: 24, textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#E5E7EB" }}>Iniciar sesión</div>
        </div>

        {/* Usuario */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: "#6B7280", fontWeight: 600, display: "block", marginBottom: 6 }}>
            USUARIO
          </label>
          <input
            type="text"
            value={user}
            onChange={e => setUser(e.target.value)}
            placeholder="Usuario"
            autoComplete="username"
            required
            style={{
              width: "100%", boxSizing: "border-box",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 10, padding: "12px 14px",
              color: "#E5E7EB", fontSize: 15, outline: "none",
            }}
          />
        </div>

        {/* Contraseña */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ fontSize: 12, color: "#6B7280", fontWeight: 600, display: "block", marginBottom: 6 }}>
            CONTRASEÑA
          </label>
          <div style={{ position: "relative" }}>
            <input
              type={showPass ? "text" : "password"}
              value={pass}
              onChange={e => setPass(e.target.value)}
              placeholder="Contraseña"
              autoComplete="current-password"
              required
              style={{
                width: "100%", boxSizing: "border-box",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 10, padding: "12px 44px 12px 14px",
                color: "#E5E7EB", fontSize: 15, outline: "none",
              }}
            />
            <button
              type="button"
              onClick={() => setShowPass(v => !v)}
              style={{
                position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", color: "#6B7280", cursor: "pointer",
                fontSize: 13, padding: 0,
              }}
            >
              {showPass ? "Ocultar" : "Ver"}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            marginBottom: 16, background: "rgba(255,77,79,0.1)",
            border: "1px solid rgba(255,77,79,0.3)", borderRadius: 10,
            padding: "10px 14px", fontSize: 13, color: "#FF4D4F", textAlign: "center",
          }}>
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={busy}
          style={{
            width: "100%", padding: "13px 0",
            background: busy ? "rgba(0,255,198,0.15)" : "linear-gradient(135deg, #00DCA0, #00FFC6)",
            border: "none", borderRadius: 10,
            color: busy ? "#00FFC6" : "#0B0F14",
            fontWeight: 800, fontSize: 15, cursor: busy ? "not-allowed" : "pointer",
            letterSpacing: "0.02em",
          }}
        >
          {busy ? "Verificando…" : "Entrar al panel"}
        </button>
      </form>
    </div>
  );
}

export default function AdminPage() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(SESSION_KEY) === "1");

  if (!authed) return <AdminLoginGate onLogin={() => setAuthed(true)} />;

  return <AdminPanelInner />;
}

function AdminPanelInner() {
  const [conversations, setConversations] = useState<ConvSummary[]>([]);
  const [selectedUser,  setSelectedUser]  = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [convMessages, setConvMessages]   = useState<ChatMessage[]>([]);
  const [input, setInput]                 = useState("");
  const [loadingConv, setLoadingConv]     = useState(false);
  const [unreadUsers, setUnreadUsers]     = useState<Set<string>>(new Set());
  const [adminTab, setAdminTab]           = useState<"mensajes" | "visitantes" | "scans" | "planes">("mensajes");
  const [scansSubTab, setScansSubTab]     = useState<"actividad" | "dispositivos">("actividad");
  const [visitStats, setVisitStats]       = useState<VisitStats>({ total: 0, countries: [] });
  const [scanStats,  setScanStats]        = useState<ScanStats | null>(null);

  // ── Device stats ────────────────────────────────────────────────────────────
  interface DeviceStat {
    device_id: string; cc_id: string; ip_hash: string;
    total_scans: number; scans_today: number; last_seen: string;
    possible_evasion: boolean;
    is_active: boolean;
    is_blocked: boolean;
  }
  interface DeviceStats { devices: DeviceStat[]; abusiveIpHashes: string[]; }
  const [deviceStats, setDeviceStats] = useState<DeviceStats | null>(null);

  // ── Active devices (one per cc_id+IP) ─────────────────────────────────────
  interface ActiveDeviceEntry { ccId: string; groupId: string; deviceId: string; lastScanAt: string; }
  const [activeDevices, setActiveDevices] = useState<ActiveDeviceEntry[]>([]);
  const [activeBusy,    setActiveBusy]    = useState<string | null>(null);

  // ── Whitelist (per-device) ────────────────────────────────────────────────────
  interface WhitelistEntry { deviceId: string; note: string; addedAt: string; }
  const [whitelist,       setWhitelist]       = useState<WhitelistEntry[]>([]);
  const [whitelistBusy,   setWhitelistBusy]   = useState<string | null>(null);

  // ── Planes state ─────────────────────────────────────────────────────────
  interface PlanUser { ccId: string; email: string; plan: string; scansToday: number; upgradeRequestedAt: string | null; paidScansRemaining: number | null; fraudScore: number; isTrusted: boolean; }
  interface PlanesStats { totalUsers: number; proUsers: number; freeUsers: number; scansToday: number; }
  interface PendingUser {
    ccId:          string;
    email:         string;
    requestedAt:   string;
    upgradePlan:   "basico" | "pro" | null;
    upgradeAmount: number | null;
    upgradeScans:  number | null;
  }
  const [planesUsers,   setPlanesUsers]   = useState<PlanUser[]>([]);
  const [planesStats,   setPlanesStats]   = useState<PlanesStats | null>(null);
  const [pendingUsers,  setPendingUsers]  = useState<PendingUser[]>([]);
  const [planesLoading,   setPlanesLoading]   = useState(false);
  const [actionBusy,      setActionBusy]      = useState<string | null>(null);
  const [showOnlyActive,  setShowOnlyActive]  = useState(true);
  const [revertModal,     setRevertModal]     = useState<{ ccId: string; context: "pending" | "pro" } | null>(null);

  // ── Reset stats state ─────────────────────────────────────────────────────
  const [resetModal,      setResetModal]      = useState<null | "visitas" | "scans" | "fullReset">(null);
  const [resetBusy,       setResetBusy]       = useState(false);
  const [resetToast,      setResetToast]      = useState<string | null>(null);
  const [fullResetInput,  setFullResetInput]  = useState("");

  const showToast = (msg: string) => {
    setResetToast(msg);
    setTimeout(() => setResetToast(null), 3500);
  };

  const handleReset = async () => {
    if (!resetModal) return;
    setResetBusy(true);
    try {
      if (resetModal === "fullReset") {
        if (fullResetInput.trim() !== "RESET") return;
        const res = await fetch(`${API}/admin/full-reset`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: SCAN_KEY, confirm: "RESET" }),
        });
        if (!res.ok) throw new Error("Error del servidor");
        setResetModal(null);
        setFullResetInput("");
        // Refresh all panels
        await Promise.all([fetchVisitStats(), fetchScanStats(), fetchPlanesData(), fetchDeviceStats()]);
        showToast("✓ Sistema reiniciado completamente");
      } else {
        const endpoint = resetModal === "visitas" ? "visit" : "scan";
        const res = await fetch(`${API}/${endpoint}/reset?key=${SCAN_KEY}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Error del servidor");
        if (resetModal === "visitas") {
          await fetchVisitStats();
        } else {
          await fetchScanStats();
        }
        setResetModal(null);
        showToast("Estadísticas reiniciadas correctamente");
      }
    } catch {
      setResetModal(null);
      setFullResetInput("");
      showToast("Error al reiniciar. Intenta de nuevo.");
    } finally {
      setResetBusy(false);
    }
  };

  const fetchPlanesData = useCallback(async () => {
    try {
      const res  = await fetch(`${API}/freemium/users?key=${SCAN_KEY}`);
      const data = await res.json();
      if (data.users)  setPlanesUsers(data.users);
      if (data.stats)  setPlanesStats(data.stats);
    } catch { /* ignore */ }
  }, []);

  const fetchPendingData = useCallback(async () => {
    try {
      const res  = await fetch(`${API}/freemium/pending?key=${SCAN_KEY}`);
      const data = await res.json();
      if (data.pending) setPendingUsers(data.pending);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (adminTab !== "planes") return;
    setPlanesLoading(true);
    Promise.all([fetchPlanesData(), fetchPendingData()]).finally(() => setPlanesLoading(false));
    const t = setInterval(() => { fetchPlanesData(); fetchPendingData(); }, 15000);
    return () => clearInterval(t);
  }, [adminTab, fetchPlanesData, fetchPendingData]);

  const planAction = useCallback(async (endpoint: string, ccId: string, extra?: object) => {
    setActionBusy(ccId);
    try {
      await fetch(`${API}/freemium/${endpoint}`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ key: SCAN_KEY, ccId, ...extra }),
      });
      await Promise.all([fetchPlanesData(), fetchPendingData()]);
    } catch { /* ignore */ } finally { setActionBusy(null); }
  }, [fetchPlanesData, fetchPendingData]);

  const revertAction = useCallback(async (ccId: string) => {
    setRevertModal(null);
    setActionBusy(ccId);
    try {
      await fetch(`${API}/admin/revert-payment`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ key: SCAN_KEY, ccId }),
      });
      await Promise.all([fetchPlanesData(), fetchPendingData()]);
    } catch { /* ignore */ } finally { setActionBusy(null); }
  }, [fetchPlanesData, fetchPendingData]);

  const bottomRef = useRef<HTMLDivElement>(null);

  // ── Visitor stats polling ─────────────────────────────────────────────────
  const fetchVisitStats = useCallback(async () => {
    try {
      const res  = await fetch(`${API}/visit/stats`);
      const data = await res.json();
      if (typeof data.total === "number") setVisitStats(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchVisitStats();
    const t = setInterval(fetchVisitStats, 5000);
    return () => clearInterval(t);
  }, [fetchVisitStats]);

  // ── Scan stats polling ────────────────────────────────────────────────────
  const fetchScanStats = useCallback(async () => {
    try {
      const res  = await fetch(`${API}/scan/stats?key=${SCAN_KEY}`);
      const data = await res.json();
      if (typeof data.total === "number") setScanStats(data);
    } catch { /* ignore */ }
  }, []);

  const fetchDeviceStats = useCallback(async () => {
    try {
      const res  = await fetch(`${API}/scan/devices?key=${SCAN_KEY}`);
      const data = await res.json();
      if (Array.isArray(data.devices)) setDeviceStats(data);
    } catch { /* ignore */ }
  }, []);

  const fetchActiveDevices = useCallback(async () => {
    try {
      const res  = await fetch(`${API}/scan/active-devices?key=${SCAN_KEY}`);
      const data = await res.json();
      if (Array.isArray(data.activeDevices)) setActiveDevices(data.activeDevices);
    } catch { /* ignore */ }
  }, []);

  const clearActiveDevice = async (ccId: string, groupId: string) => {
    const key = `${ccId}__${groupId}`;
    setActiveBusy(key);
    try {
      await fetch(`${API}/scan/active-device/clear`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": SCAN_KEY },
        body: JSON.stringify({ ccId, groupId }),
      });
      await fetchActiveDevices();
    } catch { /* ignore */ } finally { setActiveBusy(null); }
  };

  const setAsActiveDevice = async (ccId: string, groupId: string, deviceId: string) => {
    const key = `set__${deviceId}`;
    setActiveBusy(key);
    try {
      await fetch(`${API}/scan/active-device/set`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": SCAN_KEY },
        body: JSON.stringify({ ccId, groupId, deviceId }),
      });
      await fetchActiveDevices();
    } catch { /* ignore */ } finally { setActiveBusy(null); }
  };

  const fetchWhitelist = useCallback(async () => {
    try {
      const res  = await fetch(`${API}/scan/whitelist-device?key=${SCAN_KEY}`);
      const data = await res.json();
      if (Array.isArray(data.whitelist)) setWhitelist(data.whitelist);
    } catch { /* ignore */ }
  }, []);

  const addDeviceToWhitelist = async (deviceId: string) => {
    setWhitelistBusy(deviceId);
    try {
      await fetch(`${API}/scan/whitelist-device`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": SCAN_KEY },
        body: JSON.stringify({ deviceId, note: "Marcado como legítimo por admin" }),
      });
      await fetchWhitelist();
      await fetchDeviceStats();
    } catch { /* ignore */ } finally { setWhitelistBusy(null); }
  };

  const removeDeviceFromWhitelist = async (deviceId: string) => {
    setWhitelistBusy(deviceId);
    try {
      await fetch(`${API}/scan/whitelist-device/${encodeURIComponent(deviceId)}`, {
        method: "DELETE",
        headers: { "x-admin-key": SCAN_KEY },
      });
      await fetchWhitelist();
      await fetchDeviceStats();
    } catch { /* ignore */ } finally { setWhitelistBusy(null); }
  };

  useEffect(() => {
    fetchScanStats();
    fetchDeviceStats();
    fetchWhitelist();
    fetchActiveDevices();
    const t = setInterval(() => {
      fetchScanStats();
      fetchDeviceStats();
      fetchActiveDevices();
    }, 15000);
    return () => clearInterval(t);
  }, [fetchScanStats, fetchDeviceStats, fetchWhitelist, fetchActiveDevices]);

  const { connected, messages, sendMessage, loadHistory } = useChatSocket(ADMIN_CC_ID);

  const refreshConversations = useCallback(async () => {
    try {
      const res  = await fetch(`${API}/chat/conversations`);
      const data = await res.json();
      if (data.conversations) {
        setConversations(data.conversations);
        // Sync unread badge from persistent DB state
        setUnreadUsers((prev) => {
          const next = new Set(prev);
          (data.conversations as ConvSummary[]).forEach((c) => {
            if ((c.unreadCount ?? 0) > 0) next.add(c.userId);
            else next.delete(c.userId);
          });
          return next;
        });
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    refreshConversations();
    const t = setInterval(refreshConversations, 5000);
    return () => clearInterval(t);
  }, [refreshConversations]);

  useEffect(() => {
    if (!selectedUser) return;
    setLoadingConv(true);
    setConvMessages([]);
    fetch(`${API}/chat/messages/${SUPPORT_ID}/${selectedUser}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.messages) {
          setConvMessages(data.messages);
          loadHistory(data.messages);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingConv(false));
  }, [selectedUser, loadHistory]);

  // Poll conversation messages every 4 seconds when a chat is open
  useEffect(() => {
    if (!selectedUser) return;
    const t = setInterval(() => {
      fetch(`${API}/chat/messages/${SUPPORT_ID}/${selectedUser}`)
        .then((r) => r.json())
        .then((data) => {
          if (!data.messages) return;
          setConvMessages((prev) => {
            const prevIds = new Set(prev.map((m) => m.id));
            const incoming = data.messages.filter((m: { id: number }) => !prevIds.has(m.id));
            return incoming.length > 0 ? [...prev, ...incoming] : prev;
          });
        })
        .catch(() => {});
    }, 4000);
    return () => clearInterval(t);
  }, [selectedUser]);

  // Track messages for the currently open conversation
  useEffect(() => {
    if (!selectedUser || messages.length === 0) return;
    setConvMessages((prev) => {
      const prevIds = new Set(prev.map((m) => m.id));
      const relevant = messages.filter(
        (m) =>
          !prevIds.has(m.id) &&
          (m.senderCcId === selectedUser || m.receiverCcId === selectedUser ||
           m.senderCcId === SUPPORT_ID   || m.receiverCcId === SUPPORT_ID),
      );
      return relevant.length > 0 ? [...prev, ...relevant] : prev;
    });
    refreshConversations();
  }, [messages, selectedUser, refreshConversations]);

  // Mark unread + play sound: any incoming client message not from the open conversation
  const seenMsgIds = useRef<Set<number>>(new Set());
  useEffect(() => {
    messages.forEach((m) => {
      if (seenMsgIds.current.has(m.id)) return;
      seenMsgIds.current.add(m.id);
      const isFromClient = m.senderCcId !== SUPPORT_ID && m.senderCcId !== ADMIN_CC_ID;
      if (!isFromClient) return;
      const fromUser = m.senderCcId;
      if (fromUser !== selectedUser) {
        setUnreadUsers((prev) => new Set(prev).add(fromUser));
        playNotif();
        refreshConversations();
      }
    });
  }, [messages, selectedUser, refreshConversations]);

  // Clear unread when user opens a conversation; mark messages as read in DB
  function openConversation(userId: string) {
    setSelectedUser(userId);
    setUnreadUsers((prev) => {
      const next = new Set(prev);
      next.delete(userId);
      return next;
    });
    // Persist read state so badge resets after page reload too
    fetch(`${API}/chat/mark-read`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ userId }),
    }).catch(() => {});
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [convMessages]);

  function handleSend() {
    if (!input.trim() || !selectedUser) return;
    sendMessage(selectedUser, input.trim());
    setInput("");
  }

  // ── Conversation list / Visitor stats ────────────────────────────────────
  if (!selectedUser) {
    const maxVisits = visitStats.countries[0]?.count ?? 1;

    return (
      <div style={{ height: "100vh", background: "#0B0F14", color: "#fff", fontFamily: "'Inter',sans-serif", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ background: "#0B1220", borderBottom: "1px solid rgba(255,255,255,0.08)", padding: "16px 20px 0", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg,#00FFC6,#00B8A9)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🛡</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Soporte CoinCash</div>
              <div style={{ fontSize: 11, color: connected ? "#00FFC6" : "#9CA3AF" }}>
                {connected ? "● En línea" : "○ Conectando…"}
              </div>
            </div>
            <button
              onClick={() => { sessionStorage.removeItem(SESSION_KEY); window.location.reload(); }}
              title="Cerrar sesión"
              style={{
                background: "rgba(255,77,79,0.08)", border: "1px solid rgba(255,77,79,0.25)",
                borderRadius: 8, color: "#FF4D4F", fontSize: 11, fontWeight: 700,
                padding: "5px 10px", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
              }}
            >
              Cerrar sesión
            </button>
          </div>
          <div style={{ fontSize: 11, color: "#4B5563", margin: "6px 0 12px" }}>Panel de agente · {ADMIN_CC_ID}</div>

          {/* Tab bar */}
          <div style={{ display: "flex", gap: 0 }}>
            {([
              { key: "mensajes",   label: "💬 Chats" },
              { key: "visitantes", label: "🌍 Visitas" },
              { key: "scans",      label: "🔍 Scans" },
              { key: "planes",     label: "💳 Planes" },
            ] as const).map((t) => (
              <button
                key={t.key}
                onClick={() => setAdminTab(t.key)}
                style={{
                  flex: 1, padding: "8px 0", border: "none", cursor: "pointer",
                  background: "transparent", fontFamily: "inherit", fontSize: 12, fontWeight: 600,
                  color: adminTab === t.key ? "#00FFC6" : "#6B7280",
                  borderBottom: adminTab === t.key ? "2px solid #00FFC6" : "2px solid transparent",
                  transition: "all 0.2s",
                }}
              >
                {t.label}
                {t.key === "mensajes" && unreadUsers.size > 0 && (
                  <span style={{ marginLeft: 4, background: "#00FFC6", color: "#0B1220", borderRadius: 10, padding: "1px 5px", fontSize: 10, fontWeight: 700 }}>
                    {unreadUsers.size}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Visitor stats panel ── */}
        {adminTab === "visitantes" && (
          <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>

            {/* Total counter card */}
            <div style={{
              background: "linear-gradient(135deg, rgba(0,255,198,0.08) 0%, rgba(0,184,169,0.04) 100%)",
              border: "1px solid rgba(0,255,198,0.2)",
              borderRadius: 16, padding: "20px 24px", marginBottom: 16,
              backdropFilter: "blur(10px)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div>
                <div style={{ fontSize: 11, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
                  Total de visitas
                </div>
                <div style={{ fontSize: 40, fontWeight: 800, color: "#00FFC6", letterSpacing: "-1px", lineHeight: 1 }}>
                  {visitStats.total.toLocaleString("es-ES")}
                </div>
                <div style={{ fontSize: 11, color: "#4B5563", marginTop: 6 }}>
                  {visitStats.countries.length} {visitStats.countries.length === 1 ? "país" : "países"} detectados
                </div>
              </div>
              <div style={{ fontSize: 48, opacity: 0.3 }}>🌐</div>
            </div>

            {/* Live indicator */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, paddingLeft: 2 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#00FFC6", animation: "pulse 1.5s infinite" }} />
              <span style={{ fontSize: 11, color: "#6B7280" }}>Actualización en tiempo real · cada 5 s</span>
            </div>

            {/* Reset button — Visitas */}
            <button
              onClick={() => setResetModal("visitas")}
              style={{
                marginBottom: 14, width: "100%", padding: "8px 0",
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 10, color: "#6B7280", fontSize: 11, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.03em",
              }}
            >
              🗑 Reiniciar estadísticas de visitas
            </button>

            {/* Country cards */}
            {visitStats.countries.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 24px", color: "#4B5563" }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>🌍</div>
                <div>Aún no hay visitas registradas</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {visitStats.countries.map((c, i) => {
                  const pct = Math.round((c.count / maxVisits) * 100);
                  const flagSrc = c.code === "xx"
                    ? null
                    : `https://flagcdn.com/24x18/${c.code}.png`;
                  return (
                    <div
                      key={c.code}
                      title={`${c.name}: ${c.count} visita${c.count !== 1 ? "s" : ""}`}
                      style={{
                        background: i === 0
                          ? "linear-gradient(135deg,rgba(0,255,198,0.1),rgba(0,184,169,0.05))"
                          : "rgba(255,255,255,0.03)",
                        border: i === 0
                          ? "1px solid rgba(0,255,198,0.25)"
                          : "1px solid rgba(255,255,255,0.06)",
                        borderRadius: 12, padding: "12px 14px",
                        transition: "border-color 0.2s",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                        {/* Flag */}
                        <div style={{ width: 28, height: 20, borderRadius: 3, overflow: "hidden", flexShrink: 0, background: "#1E2736", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {flagSrc
                            ? <img src={flagSrc} alt={c.name} style={{ width: 28, height: "auto", display: "block" }} />
                            : <span style={{ fontSize: 14 }}>🌐</span>
                          }
                        </div>
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: i === 0 ? "#00FFC6" : "#E5E7EB" }}>
                          {c.name}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: i === 0 ? "#00FFC6" : "#9CA3AF" }}>
                          {c.count.toLocaleString("es-ES")}
                        </span>
                        {i === 0 && (
                          <span style={{ fontSize: 9, background: "rgba(0,255,198,0.15)", color: "#00FFC6", borderRadius: 6, padding: "2px 5px", fontWeight: 700 }}>
                            #1
                          </span>
                        )}
                      </div>
                      {/* Progress bar */}
                      <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{
                          height: "100%", width: `${pct}%`,
                          background: i === 0
                            ? "linear-gradient(90deg,#00FFC6,#00B8A9)"
                            : "rgba(0,255,198,0.4)",
                          borderRadius: 2, transition: "width 0.5s ease",
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Scan analytics panel ── */}
        {adminTab === "scans" && (
          <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
            {/* Subtabs */}
            <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
              {(["actividad", "dispositivos"] as const).map(tab => (
                <button key={tab} onClick={() => setScansSubTab(tab)} style={{
                  flex: 1, padding: "7px 0", borderRadius: 10, border: "1px solid",
                  cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700,
                  letterSpacing: "0.03em",
                  background: scansSubTab === tab ? "rgba(0,255,198,0.12)" : "rgba(255,255,255,0.03)",
                  borderColor: scansSubTab === tab ? "rgba(0,255,198,0.4)" : "rgba(255,255,255,0.08)",
                  color: scansSubTab === tab ? "#00FFC6" : "#6B7280",
                }}>
                  {tab === "actividad" ? "📋 Actividad" : "📱 Dispositivos"}
                </button>
              ))}
            </div>

            {!scanStats ? (
              <div style={{ textAlign: "center", padding: "40px", color: "#4B5563" }}>Cargando…</div>
            ) : scansSubTab === "actividad" ? (
              <>
                {/* Reset button — Scans */}
                <button
                  onClick={() => setResetModal("scans")}
                  style={{
                    marginBottom: 8, width: "100%", padding: "8px 0",
                    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 10, color: "#6B7280", fontSize: 11, fontWeight: 600,
                    cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.03em",
                  }}
                >
                  🗑 Reiniciar estadísticas de scans
                </button>

                {/* Reset Total del Sistema */}
                <button
                  onClick={() => { setFullResetInput(""); setResetModal("fullReset"); }}
                  style={{
                    marginBottom: 14, width: "100%", padding: "9px 0",
                    background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.3)",
                    borderRadius: 10, color: "#EF4444", fontSize: 11, fontWeight: 700,
                    cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.03em",
                  }}
                >
                  🔴 Reset Total del Sistema
                </button>

                {/* Total / Hoy */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                  {[{ label: "Total scans", value: scanStats.total }, { label: "Hoy", value: scanStats.today }].map((item, i) => (
                    <div key={i} style={{ background: "linear-gradient(135deg,rgba(0,255,198,0.08),rgba(0,184,169,0.04))", border: "1px solid rgba(0,255,198,0.2)", borderRadius: 14, padding: "14px" }}>
                      <div style={{ fontSize: 10, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{item.label}</div>
                      <div style={{ fontSize: 32, fontWeight: 800, color: "#00FFC6", fontFamily: "monospace", lineHeight: 1 }}>{item.value.toLocaleString()}</div>
                    </div>
                  ))}
                </div>

                {/* Países */}
                {scanStats.byCountry.filter(c => c.code !== "xx").length > 0 && (
                  <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, marginBottom: 14, overflow: "hidden" }}>
                    <div style={{ padding: "10px 14px 6px", fontSize: 10, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>Por país</div>
                    {scanStats.byCountry.filter(c => c.code !== "xx").map(c => (
                      <div key={c.code} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        <span style={{ fontSize: 18 }}>{flagEmoji(c.code)}</span>
                        <span style={{ flex: 1, fontSize: 13, color: "#E5E7EB" }}>{c.name}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#00FFC6", fontFamily: "monospace" }}>{c.count}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Actividad reciente */}
                <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, overflow: "hidden" }}>
                  <div style={{ padding: "10px 14px 6px", fontSize: 10, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    Actividad reciente ({scanStats.recent.length})
                  </div>
                  {scanStats.recent.length === 0 && (
                    <div style={{ padding: "20px 14px", fontSize: 13, color: "#4B5563", textAlign: "center" }}>Sin scans aún</div>
                  )}
                  {scanStats.recent.map(r => (
                    <div key={r.id} style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      {/* Row 1: flag + wallet + time */}
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 5 }}>
                        <span style={{ fontSize: 15, flexShrink: 0 }}>{flagEmoji(r.country_code)}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 11, fontFamily: "monospace", color: "#00FFC6", wordBreak: "break-all", lineHeight: 1.3 }}>{r.wallet}</div>
                          <div style={{ fontSize: 10, color: "#6B7280", marginTop: 1 }}>{r.country}</div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
                          <span style={{ fontSize: 10, color: "#6B7280", whiteSpace: "nowrap" }}>{timeAgo(r.scanned_at)}</span>
                          <span style={{
                            fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", padding: "2px 7px",
                            borderRadius: 10,
                            background: r.plan_type === "pro" ? "rgba(167,139,250,0.15)" : r.plan_type === "basico" ? "rgba(96,165,250,0.12)" : "rgba(0,255,198,0.08)",
                            color: r.plan_type === "pro" ? "#A78BFA" : r.plan_type === "basico" ? "#60A5FA" : "#00FFC6",
                            border: `1px solid ${r.plan_type === "pro" ? "rgba(167,139,250,0.3)" : r.plan_type === "basico" ? "rgba(96,165,250,0.3)" : "rgba(0,255,198,0.2)"}`,
                          }}>
                            {r.plan_type === "pro" ? "PRO" : r.plan_type === "basico" ? "BÁSICO" : "FREE"}
                          </span>
                        </div>
                      </div>
                      {/* Row 2: device tracking */}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {r.cc_id && (
                          <span style={{ fontSize: 9, fontFamily: "monospace", color: "#9CA3AF", background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: "2px 6px" }}>
                            CC: {r.cc_id}
                          </span>
                        )}
                        {r.device_id && (
                          <span style={{ fontSize: 9, fontFamily: "monospace", color: "#9CA3AF", background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: "2px 6px" }}>
                            DEV: {r.device_id.slice(0, 8)}…
                          </span>
                        )}
                        {r.ip_hash && (
                          <span style={{ fontSize: 9, fontFamily: "monospace", color: "#9CA3AF", background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: "2px 6px" }}>
                            IP: {r.ip_hash.slice(0, 10)}…
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              /* ── Dispositivos por deviceId ── */
              <>
                {/* Alerta de evasión */}
                {deviceStats && deviceStats.abusiveIpHashes.length > 0 && (
                  <div style={{
                    marginBottom: 12, padding: "10px 14px", borderRadius: 10,
                    background: "rgba(255,77,79,0.08)", border: "1px solid rgba(255,77,79,0.3)",
                    fontSize: 12, color: "#FF4D4F", fontWeight: 600,
                  }}>
                    ⚠️ {deviceStats.abusiveIpHashes.length} IP{deviceStats.abusiveIpHashes.length > 1 ? "s" : ""} compartida{deviceStats.abusiveIpHashes.length > 1 ? "s" : ""} por múltiples dispositivos hoy — posible evasión de límite
                  </div>
                )}

                {/* Resumen */}
                {deviceStats && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                    {[
                      { label: "Dispositivos únicos", value: deviceStats.devices.length },
                      { label: "Con posible evasión", value: deviceStats.devices.filter(d => d.possible_evasion).length },
                    ].map((item, i) => (
                      <div key={i} style={{
                        background: i === 1 && item.value > 0 ? "rgba(255,77,79,0.08)" : "rgba(0,255,198,0.06)",
                        border: `1px solid ${i === 1 && item.value > 0 ? "rgba(255,77,79,0.25)" : "rgba(0,255,198,0.15)"}`,
                        borderRadius: 12, padding: "12px 14px",
                      }}>
                        <div style={{ fontSize: 10, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{item.label}</div>
                        <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "monospace", lineHeight: 1, color: i === 1 && item.value > 0 ? "#FF4D4F" : "#00FFC6" }}>{item.value}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Lista de dispositivos */}
                <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, overflow: "hidden" }}>
                  <div style={{ padding: "10px 14px 6px", fontSize: 10, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    Dispositivos ({deviceStats?.devices.length ?? 0}) — ordenados por scans hoy
                  </div>
                  {!deviceStats || deviceStats.devices.length === 0 ? (
                    <div style={{ padding: "24px 14px", fontSize: 13, color: "#4B5563", textAlign: "center" }}>Sin datos de dispositivos aún</div>
                  ) : deviceStats.devices.map((d, i) => {
                      const isActiveDevice  = !!d.is_active;
                      const isBlockedDevice = !!d.is_blocked;
                      const isWL     = whitelist.some(w => w.deviceId === d.device_id);
                      const lockKey  = `${d.cc_id}__${d.ip_hash}`;
                      const setKey   = `set__${d.device_id}`;
                      const wlBusy   = whitelistBusy === d.device_id;
                      const lockBusy = activeBusy === lockKey;
                      const setBusy  = activeBusy === setKey;

                      return (
                        <div key={i} style={{
                          padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)",
                          background: isBlockedDevice
                            ? "rgba(245,158,11,0.04)"
                            : d.possible_evasion ? "rgba(255,77,79,0.04)" : "transparent",
                        }}>
                          {/* Row 1: IDs + status badges */}
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                              {d.cc_id && (
                                <span style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 700, color: "#00FFC6" }}>{d.cc_id}</span>
                              )}
                              {d.device_id && (
                                <span style={{ fontSize: 10, fontFamily: "monospace", color: "#9CA3AF" }}>
                                  DEV:{d.device_id.startsWith("CC-") ? d.device_id : d.device_id.slice(0, 8) + "…"}
                                </span>
                              )}
                            </div>
                            <div style={{ display: "flex", gap: 5, flexShrink: 0, alignItems: "center" }}>
                              {isActiveDevice && (
                                <span style={{
                                  fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 10,
                                  background: "rgba(0,220,160,0.15)", border: "1px solid rgba(0,220,160,0.4)", color: "#00DCA0",
                                }}>⚡ ACTIVO</span>
                              )}
                              {isBlockedDevice && (
                                <span style={{
                                  fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 10,
                                  background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.35)", color: "#F59E0B",
                                }}>🔒 BLOQUEADO</span>
                              )}
                              {d.possible_evasion && (isWL ? (
                                <span style={{
                                  fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 10,
                                  background: "rgba(0,255,198,0.12)", border: "1px solid rgba(0,255,198,0.35)", color: "#00FFC6",
                                }}>✅ LEGÍTIMO</span>
                              ) : (
                                <span style={{
                                  fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 10,
                                  background: "rgba(255,77,79,0.15)", border: "1px solid rgba(255,77,79,0.4)", color: "#FF4D4F",
                                }}>⚠️ EVASIÓN</span>
                              ))}
                              <span style={{
                                fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 10,
                                background: "rgba(0,255,198,0.08)", border: "1px solid rgba(0,255,198,0.2)", color: "#00FFC6",
                              }}>{d.scans_today} hoy · {d.total_scans} total</span>
                            </div>
                          </div>
                          {/* Row 2: IP + action buttons + time */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              {d.ip_hash && (
                                <span style={{ fontSize: 9, fontFamily: "monospace", color: "#4B5563" }}>
                                  IP:{d.ip_hash.slice(0, 12)}…
                                </span>
                              )}
                              {/* Active device controls */}
                              {isActiveDevice && d.cc_id && d.ip_hash && (
                                <button
                                  disabled={lockBusy}
                                  onClick={() => clearActiveDevice(d.cc_id, d.ip_hash)}
                                  style={{
                                    fontSize: 9, padding: "2px 8px", borderRadius: 8,
                                    border: "1px solid rgba(107,114,128,0.4)",
                                    background: "rgba(107,114,128,0.08)", color: "#9CA3AF",
                                    cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
                                  }}
                                >{lockBusy ? "…" : "🔓 Liberar bloqueo"}</button>
                              )}
                              {isBlockedDevice && d.cc_id && d.ip_hash && (
                                <button
                                  disabled={setBusy}
                                  onClick={() => setAsActiveDevice(d.cc_id, d.ip_hash, d.device_id)}
                                  style={{
                                    fontSize: 9, padding: "2px 8px", borderRadius: 8,
                                    border: "1px solid rgba(0,220,160,0.35)",
                                    background: "rgba(0,220,160,0.06)", color: "#00DCA0",
                                    cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
                                  }}
                                >{setBusy ? "…" : "⚡ Activar este"}</button>
                              )}
                              {/* Evasion whitelist controls */}
                              {d.possible_evasion && d.device_id && (isWL ? (
                                <button
                                  disabled={wlBusy}
                                  onClick={() => removeDeviceFromWhitelist(d.device_id)}
                                  style={{
                                    fontSize: 9, padding: "2px 8px", borderRadius: 8, border: "1px solid rgba(255,77,79,0.4)",
                                    background: "rgba(255,77,79,0.08)", color: "#FF4D4F", cursor: "pointer",
                                    fontFamily: "inherit", fontWeight: 600,
                                  }}
                                >{wlBusy ? "…" : "✕ Quitar de lista blanca"}</button>
                              ) : (
                                <button
                                  disabled={wlBusy}
                                  onClick={() => addDeviceToWhitelist(d.device_id)}
                                  style={{
                                    fontSize: 9, padding: "2px 8px", borderRadius: 8, border: "1px solid rgba(0,255,198,0.3)",
                                    background: "rgba(0,255,198,0.06)", color: "#00FFC6", cursor: "pointer",
                                    fontFamily: "inherit", fontWeight: 600,
                                  }}
                                >{wlBusy ? "…" : "✅ Marcar como legítimo"}</button>
                              ))}
                            </div>
                            <span style={{ fontSize: 10, color: "#6B7280" }}>{timeAgo(d.last_seen)}</span>
                          </div>
                        </div>
                      );
                    })}
                  
                </div>

                {/* ── Whitelist de dispositivos ── */}
                {whitelist.length > 0 && (
                  <div style={{ marginTop: 14, background: "rgba(0,255,198,0.03)", border: "1px solid rgba(0,255,198,0.12)", borderRadius: 12, overflow: "hidden" }}>
                    <div style={{ padding: "10px 14px 6px", fontSize: 10, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      ✅ Dispositivos marcados como legítimos ({whitelist.length})
                    </div>
                    {whitelist.map((w, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        <div>
                          <span style={{ fontSize: 10, fontFamily: "monospace", color: "#00FFC6" }}>
                            DEV:{w.deviceId.length > 12 ? w.deviceId.slice(0, 12) + "…" : w.deviceId}
                          </span>
                          <span style={{ fontSize: 9, color: "#4B5563", marginLeft: 8 }}>{timeAgo(w.addedAt)}</span>
                        </div>
                        <button
                          disabled={whitelistBusy === w.deviceId}
                          onClick={() => removeDeviceFromWhitelist(w.deviceId)}
                          style={{
                            fontSize: 9, padding: "2px 8px", borderRadius: 8, border: "1px solid rgba(255,77,79,0.3)",
                            background: "rgba(255,77,79,0.06)", color: "#FF4D4F", cursor: "pointer",
                            fontFamily: "inherit", fontWeight: 600,
                          }}
                        >{whitelistBusy === w.deviceId ? "…" : "Remover"}</button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Planes y Suscripciones panel ── */}
        {adminTab === "planes" && (
          <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
            {planesLoading && !planesStats ? (
              <div style={{ textAlign: "center", padding: "40px", color: "#4B5563" }}>Cargando…</div>
            ) : (
              <>
                {/* ── Stats cards ── */}
                {planesStats && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                    {[
                      { label: "Total usuarios",   value: planesStats.totalUsers, color: "#00FFC6" },
                      { label: "Usuarios pagados", value: planesStats.proUsers,   color: "#A78BFA" },
                      { label: "Usuarios FREE",    value: planesStats.freeUsers,  color: "#6B7280" },
                      { label: "Scans hoy",        value: planesStats.scansToday, color: "#F59E0B" },
                    ].map((item) => (
                      <div key={item.label} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "14px 16px" }}>
                        <div style={{ fontSize: 10, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{item.label}</div>
                        <div style={{ fontSize: 28, fontWeight: 800, color: item.color, fontFamily: "monospace", lineHeight: 1 }}>{item.value}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── Pagos pendientes ── */}
                {pendingUsers.length > 0 && (
                  <div style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 14, marginBottom: 16, overflow: "hidden" }}>
                    <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(245,158,11,0.2)", display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 14 }}>⏳</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#F59E0B", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Pagos pendientes ({pendingUsers.length})
                      </span>
                    </div>
                    {pendingUsers.map((u) => {
                      const isPro    = !u.upgradePlan || u.upgradePlan === "pro";
                      const planIcon = isPro ? "🔥" : "💳";
                      const planName = isPro ? "PRO" : "Básico";
                      const planColor = isPro ? "#F59E0B" : "#60A5FA";
                      const amount   = u.upgradeAmount !== null ? `$${u.upgradeAmount.toFixed(2)}` : (isPro ? "$19.99" : "$9.99");
                      const scans    = u.upgradeScans ?? (isPro ? 250 : 100);

                      return (
                      <div key={u.ccId} style={{ padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        {/* Top row: CC-ID + time */}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                          <div style={{ fontSize: 12, fontFamily: "monospace", color: "#E5E7EB", fontWeight: 600 }}>{u.ccId}</div>
                          <div style={{ fontSize: 10, color: "#4B5563" }}>⏱ {timeAgo(u.requestedAt)}</div>
                        </div>

                        {/* Plan badge row */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 4,
                            fontSize: 11, fontWeight: 800, color: planColor,
                            background: isPro ? "rgba(245,158,11,0.1)" : "rgba(96,165,250,0.1)",
                            border: `1px solid ${isPro ? "rgba(245,158,11,0.3)" : "rgba(96,165,250,0.3)"}`,
                            borderRadius: 6, padding: "3px 8px",
                          }}>
                            {planIcon} {planName}
                          </span>
                          <span style={{ fontSize: 11, color: "#9CA3AF" }}>
                            {amount} • {scans} análisis
                          </span>
                          {u.email && (
                            <span style={{ fontSize: 10, color: "#4B5563", marginLeft: "auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }}>
                              {u.email}
                            </span>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div style={{ display: "flex", gap: 7 }}>
                          <button
                            disabled={actionBusy === u.ccId}
                            onClick={() => planAction("confirm-upgrade", u.ccId, { plan: u.upgradePlan ?? "pro" })}
                            style={{
                              flex: 1,
                              background: actionBusy === u.ccId
                                ? "rgba(167,139,250,0.2)"
                                : isPro
                                  ? "linear-gradient(135deg,#92400E,#F59E0B)"
                                  : "linear-gradient(135deg,#1E3A5F,#60A5FA)",
                              border: "none", borderRadius: 8, color: "#fff",
                              fontSize: 11, fontWeight: 700,
                              padding: "7px 0", cursor: actionBusy === u.ccId ? "not-allowed" : "pointer",
                            }}
                          >
                            {actionBusy === u.ccId ? "…" : `✔ Confirmar ${planName}`}
                          </button>
                          <button
                            disabled={actionBusy === u.ccId}
                            onClick={() => setRevertModal({ ccId: u.ccId, context: "pending" })}
                            style={{
                              background: "rgba(255,80,80,0.1)", border: "1px solid rgba(255,80,80,0.3)",
                              borderRadius: 8, color: "#FF6B6B", fontSize: 11, fontWeight: 700,
                              padding: "7px 12px", cursor: actionBusy === u.ccId ? "not-allowed" : "pointer", whiteSpace: "nowrap",
                            }}
                          >
                            🔄 Revertir
                          </button>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}

                {/* ── Usuarios table ── */}
                {(() => {
                  const isPaidPlan = (p: string) => p === "pro" || p === "basico";
                  const sorted = [...planesUsers].sort((a, b) => {
                    const aScore = (a.plan === "pro" ? 3 : a.plan === "basico" ? 2 : 0) + (a.scansToday > 0 ? 1 : 0);
                    const bScore = (b.plan === "pro" ? 3 : b.plan === "basico" ? 2 : 0) + (b.scansToday > 0 ? 1 : 0);
                    return bScore - aScore;
                  });
                  const isActive = (u: PlanUser) => isPaidPlan(u.plan) || u.scansToday > 0;
                  const visible  = showOnlyActive ? sorted.filter(isActive) : sorted;
                  const hiddenCount = sorted.length - sorted.filter(isActive).length;

                  return (
                    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, overflow: "hidden" }}>
                      {/* Header + toggle */}
                      <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 11, color: "#6B7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                          {showOnlyActive
                            ? `Activos (${visible.length}${hiddenCount > 0 ? ` de ${planesUsers.length}` : ""})`
                            : `Todos los usuarios (${planesUsers.length})`}
                        </span>
                        {/* Toggle "Mostrar solo activos" */}
                        <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", userSelect: "none" }}>
                          <span style={{ fontSize: 10, color: showOnlyActive ? "#00FFC6" : "#4B5563", fontWeight: 600, whiteSpace: "nowrap" }}>
                            Solo activos
                          </span>
                          <div
                            onClick={() => setShowOnlyActive(v => !v)}
                            style={{
                              width: 34, height: 18, borderRadius: 9, position: "relative",
                              background: showOnlyActive ? "rgba(0,255,198,0.25)" : "rgba(255,255,255,0.08)",
                              border: showOnlyActive ? "1px solid rgba(0,255,198,0.5)" : "1px solid rgba(255,255,255,0.15)",
                              transition: "all 0.2s",
                              cursor: "pointer",
                            }}
                          >
                            <div style={{
                              position: "absolute", top: 2,
                              left: showOnlyActive ? 16 : 2,
                              width: 12, height: 12, borderRadius: "50%",
                              background: showOnlyActive ? "#00FFC6" : "#4B5563",
                              transition: "all 0.2s",
                            }} />
                          </div>
                        </label>
                      </div>

                      {visible.length === 0 ? (
                        <div style={{ padding: "30px 14px", textAlign: "center", color: "#4B5563", fontSize: 13 }}>
                          {showOnlyActive ? "Sin usuarios activos hoy" : "Sin usuarios registrados"}
                        </div>
                      ) : (
                        visible.map((u) => {
                          const isPro      = u.plan === "pro";
                          const isBasico   = u.plan === "basico";
                          const isPaid     = isPro || isBasico;
                          const isBusy     = actionBusy === u.ccId;
                          const isPending  = !!u.upgradeRequestedAt;
                          const isActiveUser = u.scansToday > 0;

                          const planBadgeText  = isPro ? "⭐ PRO" : isBasico ? "💳 BÁSICO" : "FREE";
                          const planBadgeBg    = isPro ? "rgba(245,158,11,0.18)" : isBasico ? "rgba(96,165,250,0.15)" : "rgba(107,114,128,0.2)";
                          const planBadgeColor = isPro ? "#F59E0B" : isBasico ? "#60A5FA" : "#9CA3AF";
                          const planBadgeBorder= isPro ? "1px solid rgba(245,158,11,0.45)" : isBasico ? "1px solid rgba(96,165,250,0.35)" : "1px solid rgba(107,114,128,0.3)";
                          const leftBorder     = isPending ? "3px solid #F59E0B" : isPaid ? "3px solid #A78BFA" : isActiveUser ? "3px solid #00DCA0" : "3px solid transparent";

                          const hasFraud   = u.fraudScore > 0;
                          const fraudColor = u.fraudScore >= 60 ? "#FF4D4F" : u.fraudScore >= 30 ? "#F59E0B" : "#D97706";

                          return (
                            <div key={u.ccId} style={{
                              padding: "12px 14px",
                              borderBottom: "1px solid rgba(255,255,255,0.04)",
                              borderLeft: leftBorder,
                            }}>
                              {/* Row 1: ccId + badges */}
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                                <span style={{ fontFamily: "monospace", fontSize: 12, color: "#E5E7EB", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {u.ccId}
                                </span>
                                {/* Plan badge */}
                                <span style={{
                                  fontSize: 10, fontWeight: 700, borderRadius: 6, padding: "2px 7px",
                                  background: planBadgeBg, color: planBadgeColor, border: planBadgeBorder,
                                }}>
                                  {planBadgeText}
                                </span>
                                {/* ACTIVO badge — verde, solo si tiene scans */}
                                {isActiveUser && (
                                  <span style={{
                                    fontSize: 10, fontWeight: 700, borderRadius: 6, padding: "2px 7px",
                                    background: "rgba(0,220,160,0.15)",
                                    color: "#00DCA0",
                                    border: "1px solid rgba(0,220,160,0.4)",
                                  }}>
                                    ● ACTIVO
                                  </span>
                                )}
                                {isPending && (
                                  <span style={{ fontSize: 10, color: "#F59E0B", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 6, padding: "2px 6px", fontWeight: 700 }}>
                                    PENDIENTE
                                  </span>
                                )}
                                {/* Trusted badge */}
                                {u.isTrusted && (
                                  <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 6, padding: "2px 6px", background: "rgba(0,255,198,0.1)", color: "#00FFC6", border: "1px solid rgba(0,255,198,0.3)" }}>
                                    ✓ LEGÍTIMO
                                  </span>
                                )}
                                {/* Fraud score badge */}
                                {hasFraud && !u.isTrusted && (
                                  <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 6, padding: "2px 6px", background: `${fraudColor}18`, color: fraudColor, border: `1px solid ${fraudColor}50` }}>
                                    ⚠ Riesgo {u.fraudScore}
                                  </span>
                                )}
                              </div>
                              {/* Row 2: email + scans */}
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                <span style={{ fontSize: 11, color: "#6B7280", flex: 1 }}>{u.email || "—"}</span>
                                {isPaid && u.paidScansRemaining !== null ? (
                                  <span style={{ fontSize: 11, color: "#60A5FA" }}>
                                    Créditos: <strong style={{ color: u.paidScansRemaining > 10 ? "#00FFC6" : "#F59E0B" }}>{u.paidScansRemaining}</strong>
                                    <span style={{ color: "#4B5563" }}> / {u.plan === "pro" ? "250" : "100"}</span>
                                  </span>
                                ) : (
                                  <span style={{ fontSize: 11, color: isActiveUser ? "#00DCA0" : "#4B5563" }}>
                                    Scans hoy: <strong style={{ color: isActiveUser ? "#00FFC6" : "#6B7280" }}>{u.scansToday}</strong>
                                  </span>
                                )}
                              </div>
                              {/* Row 3: action buttons */}
                              <div style={{ display: "flex", gap: 6 }}>
                                {!isPaid ? (
                                  <button
                                    disabled={isBusy}
                                    onClick={() => planAction("set-plan", u.ccId, { plan: "pro" })}
                                    style={{
                                      flex: 1, background: isBusy ? "rgba(245,158,11,0.08)" : "rgba(245,158,11,0.12)",
                                      border: "1px solid rgba(245,158,11,0.4)", borderRadius: 8,
                                      color: "#F59E0B", fontSize: 11, fontWeight: 700, padding: "6px 0",
                                      cursor: isBusy ? "not-allowed" : "pointer",
                                    }}
                                  >
                                    {isBusy ? "…" : "⬆ Activar PRO"}
                                  </button>
                                ) : (
                                  <button
                                    disabled={isBusy}
                                    onClick={() => setRevertModal({ ccId: u.ccId, context: "pro" })}
                                    style={{
                                      flex: 1, background: "rgba(255,80,80,0.08)",
                                      border: "1px solid rgba(255,80,80,0.3)", borderRadius: 8,
                                      color: "#FF6B6B", fontSize: 11, fontWeight: 700, padding: "6px 0",
                                      cursor: isBusy ? "not-allowed" : "pointer",
                                    }}
                                  >
                                    {isBusy ? "…" : "🔄 Revertir pago"}
                                  </button>
                                )}
                                <button
                                  disabled={isBusy}
                                  onClick={() => planAction("reset-scans", u.ccId)}
                                  style={{
                                    flex: 1, background: "rgba(255,255,255,0.04)",
                                    border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
                                    color: "#6B7280", fontSize: 11, fontWeight: 700, padding: "6px 0",
                                    cursor: isBusy ? "not-allowed" : "pointer",
                                  }}
                                >
                                  {isBusy ? "…" : "↺ Reset scans"}
                                </button>
                              </div>
                              {/* Row 4: antifraude buttons (solo si hay fraud score o es usuario de riesgo) */}
                              {(hasFraud || u.isTrusted) && (
                                <div style={{ display: "flex", gap: 6, marginTop: 5 }}>
                                  <button
                                    disabled={isBusy || u.isTrusted}
                                    onClick={() => planAction("trust-user", u.ccId)}
                                    title="Marcar usuario como legítimo: resetea fraud score y activa bypass"
                                    style={{
                                      flex: 1, background: u.isTrusted ? "rgba(0,255,198,0.06)" : "rgba(0,255,198,0.1)",
                                      border: `1px solid ${u.isTrusted ? "rgba(0,255,198,0.2)" : "rgba(0,255,198,0.4)"}`,
                                      borderRadius: 8, color: u.isTrusted ? "#4B5563" : "#00FFC6",
                                      fontSize: 11, fontWeight: 700, padding: "5px 0",
                                      cursor: (isBusy || u.isTrusted) ? "not-allowed" : "pointer",
                                    }}
                                  >
                                    {isBusy ? "…" : u.isTrusted ? "✓ Ya marcado legítimo" : "✅ Marcar como legítimo"}
                                  </button>
                                  {!u.isTrusted && (
                                    <button
                                      disabled={isBusy}
                                      onClick={() => planAction("merge-devices", u.ccId)}
                                      title="Aceptar todos los dispositivos de este usuario como legítimos"
                                      style={{
                                        flex: 1, background: "rgba(99,102,241,0.1)",
                                        border: "1px solid rgba(99,102,241,0.4)", borderRadius: 8,
                                        color: "#818CF8", fontSize: 11, fontWeight: 700, padding: "5px 0",
                                        cursor: isBusy ? "not-allowed" : "pointer",
                                      }}
                                    >
                                      {isBusy ? "…" : "🔗 Unificar dispositivos"}
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}

                      {/* Footer: mostrar ocultos hint */}
                      {showOnlyActive && hiddenCount > 0 && (
                        <div
                          onClick={() => setShowOnlyActive(false)}
                          style={{ padding: "10px 14px", textAlign: "center", fontSize: 11, color: "#4B5563", cursor: "pointer", borderTop: "1px solid rgba(255,255,255,0.04)" }}
                        >
                          + {hiddenCount} oculto{hiddenCount > 1 ? "s" : ""} sin actividad — toca para ver todos
                        </div>
                      )}
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        )}

        {/* Conversation list */}
        {adminTab === "mensajes" && (
        <div style={{ flex: 1, overflowY: "auto" }}>
          {conversations.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 24px", color: "#4B5563", fontSize: 14 }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>💬</div>
              Aún no hay conversaciones
            </div>
          ) : (
            conversations.map((c, idx) => {
              const hasUnread = unreadUsers.has(c.userId);
              return (
                <button
                  key={c.userId}
                  onClick={() => openConversation(c.userId)}
                  style={{
                    width: "100%", padding: "14px 20px",
                    background: hasUnread ? "rgba(0,255,198,0.06)" : "transparent",
                    border: "none",
                    borderBottom: hasUnread
                      ? "1px solid rgba(0,255,198,0.15)"
                      : "1px solid rgba(255,255,255,0.05)",
                    borderLeft: hasUnread ? "3px solid #00FFC6" : "3px solid transparent",
                    cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 12,
                    transition: "background 0.2s",
                  }}
                >
                  {/* Avatar with unread pulse — no photo, always generic icon */}
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <div style={{
                      width: 42, height: 42, borderRadius: "50%",
                      background: hasUnread ? "rgba(0,255,198,0.15)" : "#1E2736",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 16,
                      border: hasUnread ? "2px solid #00FFC6" : "2px solid transparent",
                      overflow: "hidden",
                    }}>
                      👤
                    </div>
                    {hasUnread && (
                      <div style={{
                        position: "absolute", top: -2, right: -2,
                        minWidth: 16, height: 16, borderRadius: 8,
                        background: "#00FFC6", color: "#0B1220",
                        border: "2px solid #0B0F14",
                        fontSize: 9, fontWeight: 800,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        padding: "0 3px",
                        animation: "pulse 1.5s infinite",
                      }}>
                        {(c.unreadCount ?? 1) > 9 ? "9+" : (c.unreadCount ?? 1)}
                      </div>
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3, alignItems: "center" }}>
                      <span style={{
                        fontWeight: hasUnread ? 700 : 600,
                        fontSize: 13,
                        color: hasUnread ? "#00FFC6" : "#E5E7EB",
                      }}>{`Usuario ${idx + 1}`}</span>
                      <span style={{ fontSize: 11, color: hasUnread ? "#00FFC6" : "#6B7280", flexShrink: 0, fontWeight: hasUnread ? 600 : 400 }}>
                        {timeStr(c.lastTime)}
                      </span>
                    </div>
                    <div style={{
                      fontSize: 12,
                      color: hasUnread ? "#E5E7EB" : "#6B7280",
                      fontWeight: hasUnread ? 500 : 400,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {c.lastSender === SUPPORT_ID ? "Tú: " : ""}
                      {isMediaMsg(c.lastMessage) ? "📷 Imagen" : c.lastMessage}
                    </div>
                  </div>

                  {/* Unread badge */}
                  {hasUnread && (
                    <div style={{
                      background: "#00FFC6", color: "#0B1220",
                      fontSize: 10, fontWeight: 700,
                      borderRadius: 10, padding: "2px 7px",
                      flexShrink: 0, minWidth: 18, textAlign: "center",
                    }}>
                      NEW
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>
        )}

        {/* ── Revert payment confirmation modal ── */}
        {revertModal && (
          <div style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.78)", backdropFilter: "blur(6px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "24px",
          }} onClick={() => setRevertModal(null)}>
            <div
              style={{
                background: "#111827",
                border: "1px solid rgba(255,80,80,0.35)",
                borderRadius: 18, padding: "24px 20px", maxWidth: 340, width: "100%",
                boxShadow: "0 24px 80px rgba(0,0,0,0.7)",
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* Icon + title */}
              <div style={{ textAlign: "center", marginBottom: 16 }}>
                <div style={{ fontSize: 38, marginBottom: 8 }}>⚠️</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#F9FAFB" }}>
                  ¿Revertir este pago?
                </div>
              </div>

              {/* CC ID */}
              <div style={{
                background: "rgba(255,255,255,0.04)", borderRadius: 10,
                padding: "9px 12px", marginBottom: 14, textAlign: "center",
              }}>
                <span style={{ fontSize: 12, fontFamily: "monospace", color: "#9CA3AF" }}>
                  {revertModal.ccId}
                </span>
              </div>

              {/* Warning text */}
              <p style={{ margin: "0 0 18px", fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.65, textAlign: "center" }}>
                {revertModal.context === "pro"
                  ? "Esto desactivará el acceso PRO del usuario y lo regresará al plan FREE."
                  : "Esto eliminará la solicitud de pago pendiente. El usuario volverá al plan FREE."
                }
              </p>

              {/* Buttons */}
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => setRevertModal(null)}
                  style={{
                    flex: 1, padding: "10px 0", borderRadius: 10,
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    color: "#9CA3AF", fontSize: 12, fontWeight: 700,
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >Cancelar</button>
                <button
                  onClick={() => revertAction(revertModal.ccId)}
                  style={{
                    flex: 1, padding: "10px 0", borderRadius: 10,
                    background: "rgba(255,80,80,0.15)",
                    border: "1px solid rgba(255,80,80,0.45)",
                    color: "#FF6B6B", fontSize: 12, fontWeight: 800,
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >🔄 Sí, revertir</button>
              </div>
            </div>
          </div>
        )}

        {resetModal && (
          <div style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "24px",
          }}>
            <div style={{
              background: "#111827",
              border: `1px solid ${resetModal === "fullReset" ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.1)"}`,
              borderRadius: 18, padding: "24px 20px", maxWidth: 340, width: "100%",
              boxShadow: "0 24px 80px rgba(0,0,0,0.7)",
            }}>
              {resetModal === "fullReset" ? (
                <>
                  <div style={{ fontSize: 32, textAlign: "center", marginBottom: 10 }}>🔴</div>
                  <p style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 800, color: "#EF4444", textAlign: "center" }}>
                    RESET TOTAL DEL SISTEMA
                  </p>
                  <p style={{ margin: "0 0 16px", fontSize: 12, color: "#9CA3AF", textAlign: "center", lineHeight: 1.6 }}>
                    Esto borrará <strong style={{ color: "#F9FAFB" }}>absolutamente todo</strong>:<br/>
                    scans, visitas, usuarios, planes PRO, chat, dispositivos.<br/>
                    <span style={{ color: "#EF4444", fontWeight: 700 }}>Esta acción es irreversible.</span>
                  </p>
                  <p style={{ margin: "0 0 8px", fontSize: 11, color: "#6B7280", textAlign: "center" }}>
                    Escribe <strong style={{ color: "#E5E7EB", letterSpacing: "0.1em" }}>RESET</strong> para confirmar
                  </p>
                  <input
                    value={fullResetInput}
                    onChange={e => setFullResetInput(e.target.value)}
                    placeholder="Escribe RESET aquí"
                    autoFocus
                    style={{
                      width: "100%", boxSizing: "border-box",
                      padding: "10px 14px", marginBottom: 14,
                      background: "rgba(239,68,68,0.08)",
                      border: `1px solid ${fullResetInput === "RESET" ? "#EF4444" : "rgba(239,68,68,0.25)"}`,
                      borderRadius: 10, color: "#F9FAFB", fontSize: 14,
                      fontFamily: "monospace", fontWeight: 700, textAlign: "center",
                      outline: "none",
                    }}
                  />
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      onClick={() => { setResetModal(null); setFullResetInput(""); }}
                      disabled={resetBusy}
                      style={{
                        flex: 1, padding: "10px 0", border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: 10, background: "rgba(255,255,255,0.05)",
                        color: "#9CA3AF", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                      }}
                    >Cancelar</button>
                    <button
                      onClick={handleReset}
                      disabled={resetBusy || fullResetInput !== "RESET"}
                      style={{
                        flex: 1, padding: "10px 0", border: "none", borderRadius: 10,
                        background: fullResetInput !== "RESET" ? "rgba(239,68,68,0.2)" : resetBusy ? "rgba(239,68,68,0.4)" : "#EF4444",
                        color: fullResetInput !== "RESET" ? "rgba(255,255,255,0.3)" : "#fff",
                        fontSize: 13, fontWeight: 800,
                        cursor: fullResetInput !== "RESET" || resetBusy ? "not-allowed" : "pointer",
                        fontFamily: "inherit", letterSpacing: "0.03em",
                      }}
                    >{resetBusy ? "Reiniciando…" : "CONFIRMAR RESET"}</button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 28, textAlign: "center", marginBottom: 12 }}>⚠️</div>
                  <p style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: "#F9FAFB", textAlign: "center" }}>
                    ¿Reiniciar estadísticas?
                  </p>
                  <p style={{ margin: "0 0 20px", fontSize: 12, color: "#9CA3AF", textAlign: "center", lineHeight: 1.5 }}>
                    ¿Seguro que deseas reiniciar todas las estadísticas de{" "}
                    <strong style={{ color: "#E5E7EB" }}>{resetModal}</strong>?
                    Esta acción no se puede deshacer.
                  </p>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      onClick={() => setResetModal(null)}
                      disabled={resetBusy}
                      style={{
                        flex: 1, padding: "10px 0", border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: 10, background: "rgba(255,255,255,0.05)",
                        color: "#9CA3AF", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                      }}
                    >Cancelar</button>
                    <button
                      onClick={handleReset}
                      disabled={resetBusy}
                      style={{
                        flex: 1, padding: "10px 0", border: "none",
                        borderRadius: 10, background: resetBusy ? "rgba(239,68,68,0.3)" : "#EF4444",
                        color: "#fff", fontSize: 13, fontWeight: 700,
                        cursor: resetBusy ? "not-allowed" : "pointer", fontFamily: "inherit",
                      }}
                    >{resetBusy ? "Reiniciando…" : "Confirmar"}</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Toast notification ── */}
        {resetToast && (
          <div style={{
            position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)",
            zIndex: 9999, background: "#111827",
            border: "1px solid rgba(0,255,198,0.3)", borderRadius: 12,
            padding: "10px 18px", fontSize: 13, fontWeight: 600, color: "#00FFC6",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            whiteSpace: "nowrap", maxWidth: "90vw",
            animation: "fadeIn 0.2s ease",
          }}>
            ✓ {resetToast}
          </div>
        )}

      </div>
    );
  }

  // ── Chat panel ─────────────────────────────────────────────────────────────
  return (
    <div style={{ height: "100vh", background: "#0B0F14", color: "#fff", fontFamily: "'Inter',sans-serif", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ background: "#0B1220", borderBottom: "1px solid rgba(255,255,255,0.08)", padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <button
          onClick={() => setSelectedUser(null)}
          style={{ background: "none", border: "none", color: "#00FFC6", cursor: "pointer", fontSize: 24, padding: "0 4px", lineHeight: 1, display: "flex", alignItems: "center" }}
        >‹</button>
        <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#1E2736", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, overflow: "hidden", flexShrink: 0 }}>
          {conversations.find(c => c.userId === selectedUser)?.photoUrl
            ? <img src={conversations.find(c => c.userId === selectedUser)!.photoUrl!} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : "👤"}
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, fontFamily: "monospace" }}>{selectedUser}</div>
          <div style={{ fontSize: 11, color: "#6B7280" }}>Usuario</div>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 8px", display: "flex", flexDirection: "column", gap: 10 }}>
        {loadingConv && (
          <div style={{ textAlign: "center", color: "#4B5563", fontSize: 13, marginTop: 40 }}>Cargando…</div>
        )}
        {!loadingConv && convMessages.length === 0 && (
          <div style={{ textAlign: "center", color: "#4B5563", fontSize: 13, marginTop: 60 }}>No hay mensajes aún.</div>
        )}
        {convMessages.map((msg) => {
          const isSupport = msg.senderCcId === SUPPORT_ID || msg.senderCcId === ADMIN_CC_ID;
          const isMedia   = isMediaMsg(msg.message);
          return (
            <div key={msg.id} style={{ display: "flex", flexDirection: isSupport ? "row-reverse" : "row", alignItems: "flex-end", gap: 8 }}>
              {!isSupport && (
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(0,255,198,0.15)", border: "1.5px solid #00FFC6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>👤</div>
              )}
              <div style={{
                maxWidth: "72%",
                background: isMedia
                  ? "transparent"
                  : isSupport
                    ? "#1E2736"
                    : "linear-gradient(135deg,#00C896 0%,#00FFC6 100%)",
                color: isSupport ? "#E5E7EB" : "#0B1220",
                borderRadius: isSupport ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                padding: isMedia ? 0 : "10px 14px",
                fontSize: 14, lineHeight: 1.45, wordBreak: "break-word",
                overflow: "hidden",
                boxShadow: isMedia ? "none" : isSupport ? "none" : "0 2px 12px rgba(0,255,198,0.2)",
              }}>
                {isMedia ? <AdminMediaBubble message={msg.message} onImageClick={setSelectedImage} /> : msg.message}
                {!isMedia && (
                  <div style={{ fontSize: 10, marginTop: 4, opacity: 0.65, textAlign: isSupport ? "right" : "left" }}>
                    {timeStr(msg.timestamp)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ background: "#0B1220", borderTop: "1px solid rgba(255,255,255,0.07)", padding: "12px 16px", paddingBottom: "calc(12px + env(safe-area-inset-bottom))", display: "flex", gap: 10, alignItems: "flex-end", flexShrink: 0 }}>
        <textarea
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
          }}
          placeholder={`Responder a ${selectedUser}…`}
          rows={1}
          style={{
            flex: 1, background: "#111827", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 16, color: "#fff", fontSize: 14, padding: "10px 14px",
            resize: "none", outline: "none", fontFamily: "inherit", lineHeight: 1.4,
            maxHeight: 120, overflowY: "auto",
          }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || !connected}
          style={{
            width: 44, height: 44, borderRadius: "50%",
            background: input.trim() && connected ? "linear-gradient(135deg,#00FFC6,#00B8A9)" : "#1E2736",
            border: "none", cursor: input.trim() && connected ? "pointer" : "not-allowed",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0,
          }}
        >➤</button>
      </div>

      {/* ── Image lightbox modal ── */}
      {selectedImage && (
        <div
          onClick={() => setSelectedImage(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.92)",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 20,
            padding: 20,
          }}
        >
          {/* Stop propagation so clicks on image/buttons don't close modal */}
          <img
            src={selectedImage}
            alt="comprobante"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "90vw", maxHeight: "72vh",
              borderRadius: 14,
              boxShadow: "0 0 40px rgba(0,0,0,0.8)",
              objectFit: "contain",
            }}
          />
          <div style={{ display: "flex", gap: 12 }} onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => {
                const link = document.createElement("a");
                link.href = selectedImage!;
                link.download = "comprobante.jpg";
                link.target = "_blank";
                link.click();
              }}
              style={{
                padding: "10px 22px", borderRadius: 10, border: "none",
                background: "linear-gradient(135deg,#00FFC6,#00B8A9)",
                color: "#0B1220", fontWeight: 700, fontSize: 14,
                cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
              }}
            >⬇ Descargar</button>
            <button
              onClick={() => setSelectedImage(null)}
              style={{
                padding: "10px 22px", borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(255,255,255,0.06)",
                color: "#E5E7EB", fontWeight: 600, fontSize: 14,
                cursor: "pointer",
              }}
            >✖ Cerrar</button>
          </div>
          <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
            Toca fuera de la imagen para cerrar
          </p>
        </div>
      )}
    </div>
  );
}
