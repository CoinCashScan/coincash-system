import { useEffect, useState, useCallback, useRef } from "react";
import { ArrowLeft, RefreshCw, Search, Copy, CheckCheck, Ban, ShieldAlert, X } from "lucide-react";
import { toast } from "sonner";

// ── Palette ────────────────────────────────────────────────────────────────────
const BG     = "#0B0F14";
const CARD   = "#121821";
const GREEN  = "#19C37D";
const DANGER = "#FF4D4F";
const AMBER  = "#F59E0B";
const BORDER = "rgba(255,255,255,0.06)";

interface BlacklistedEntry {
  id: number;
  address: string;
  chain: string;
  riskLevel: string;
  freezeBalance: string;
  freezeTime: number;
}

interface Props {
  onClose?: () => void;
}

function fmt(ts: number): string {
  return new Date(ts).toLocaleString("es-ES", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "Hace un momento";
  const m = Math.floor(s / 60);
  if (m < 60) return `Hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Hace ${h} h`;
  return `Hace ${Math.floor(h / 24)} días`;
}

function short(addr: string) { return `${addr.slice(0, 10)}…${addr.slice(-8)}`; }

// ── Skeleton row ───────────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 border-b" style={{ borderColor: BORDER }}>
      <div className="h-9 w-9 rounded-xl animate-pulse shrink-0" style={{ background: "rgba(255,255,255,0.06)" }} />
      <div className="flex-1 flex flex-col gap-2">
        <div className="h-2.5 w-36 rounded-full animate-pulse" style={{ background: "rgba(255,255,255,0.07)" }} />
        <div className="h-2 w-24 rounded-full animate-pulse" style={{ background: "rgba(255,255,255,0.05)" }} />
      </div>
      <div className="h-3 w-16 rounded-full animate-pulse" style={{ background: "rgba(255,255,255,0.06)" }} />
    </div>
  );
}

// ── Entry row ─────────────────────────────────────────────────────────────────
function EntryRow({ entry }: { entry: BlacklistedEntry }) {
  const [copied, setCopied] = useState(false);
  const bal = parseFloat(entry.freezeBalance);
  const hasBal = bal > 0;

  const copy = () => {
    navigator.clipboard.writeText(entry.address).catch(() => {});
    setCopied(true);
    toast.success("Dirección copiada.");
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="px-4 py-3.5 border-b" style={{ borderColor: BORDER }}>
      {/* Row top: icon + address + copy */}
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl shrink-0 mt-0.5"
          style={{ background: `${DANGER}15` }}>
          <Ban className="h-4 w-4" style={{ color: DANGER }} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <p className="text-[11px] font-mono truncate" style={{ color: "rgba(255,255,255,0.75)" }}>
              {short(entry.address)}
            </p>
            <button onClick={copy}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md transition-opacity active:opacity-50"
              style={{ background: "rgba(255,255,255,0.06)" }}>
              {copied
                ? <CheckCheck className="h-2.5 w-2.5" style={{ color: GREEN }} />
                : <Copy className="h-2.5 w-2.5" style={{ color: "rgba(255,255,255,0.35)" }} />
              }
            </button>
          </div>

          {/* Badges row */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md"
              style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.45)" }}>
              {entry.chain}
            </span>
            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md"
              style={{ background: `${DANGER}18`, color: DANGER }}>
              {entry.riskLevel}
            </span>
            {hasBal && (
              <span className="text-[9px] font-bold font-mono px-1.5 py-0.5 rounded-md"
                style={{ background: `${AMBER}12`, color: AMBER }}>
                {bal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT
              </span>
            )}
          </div>
        </div>

        {/* Freeze time */}
        <div className="shrink-0 text-right">
          <p className="text-[9px] font-medium" style={{ color: "rgba(255,255,255,0.25)" }}>
            {timeAgo(entry.freezeTime)}
          </p>
          <p className="text-[8px] mt-0.5" style={{ color: "rgba(255,255,255,0.15)" }}>
            {fmt(entry.freezeTime)}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function BlacklistPage({ onClose }: Props) {
  const [entries, setEntries]     = useState<BlacklistedEntry[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [query, setQuery]         = useState("");
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const countdownRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const [countdown, setCountdown] = useState(30);

  const REFRESH_INTERVAL = 30_000;

  const fetchData = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api-server/api/blacklist");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: BlacklistedEntry[] = await res.json();
      setEntries(data);
      setLastUpdated(Date.now());
      setCountdown(30);
    } catch {
      setError("No se pudo cargar la lista. Verificando conexión…");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial load + 30s interval
  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(), REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Live countdown display
  useEffect(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => (prev <= 1 ? 30 : prev - 1));
    }, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [lastUpdated]);

  const filtered = entries.filter(e =>
    e.address.toLowerCase().includes(query.toLowerCase().trim())
  );

  return (
    <div className="fixed inset-0 flex flex-col z-50" style={{ background: BG }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 pt-10 pb-4 shrink-0">
        <button onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full"
          style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          <ArrowLeft className="h-4 w-4" style={{ color: "rgba(255,255,255,0.6)" }} />
        </button>

        <div className="flex-1 mx-3">
          <p className="text-sm font-bold text-white leading-tight">USDT Blacklisted Wallets</p>
          <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>
            TRC20 · {filtered.length} {filtered.length === 1 ? "resultado" : "resultados"}
          </p>
        </div>

        <button onClick={() => fetchData(true)} disabled={refreshing}
          className="flex h-9 w-9 items-center justify-center rounded-full disabled:opacity-40"
          style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
            style={{ color: refreshing ? GREEN : "rgba(255,255,255,0.5)" }} />
        </button>
      </div>

      {/* ── Hero banner ────────────────────────────────────────────────────── */}
      <div className="mx-4 mb-4 rounded-2xl px-4 py-3.5 flex items-center gap-3 shrink-0"
        style={{ background: `${DANGER}0C`, border: `1px solid ${DANGER}25` }}>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl shrink-0"
          style={{ background: `${DANGER}15` }}>
          <ShieldAlert className="h-5 w-5" style={{ color: DANGER }} />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold" style={{ color: DANGER }}>
            Monitor de Congelamiento
          </p>
          <p className="text-[10px] leading-snug mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
            Contrato TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj · Actualización cada 30 s
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-bold" style={{ color: DANGER }}>{entries.length}</p>
          <p className="text-[9px]" style={{ color: "rgba(255,255,255,0.3)" }}>congeladas</p>
        </div>
      </div>

      {/* ── Search ─────────────────────────────────────────────────────────── */}
      <div className="mx-4 mb-3 flex items-center gap-3 rounded-2xl px-4 py-2.5 shrink-0"
        style={{ background: CARD, border: `1px solid ${BORDER}` }}>
        <Search className="h-4 w-4 shrink-0" style={{ color: "rgba(255,255,255,0.3)" }} />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar dirección TRON…"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-white/20"
          style={{ color: "#fff" }}
        />
        {query && (
          <button onClick={() => setQuery("")}>
            <X className="h-3.5 w-3.5" style={{ color: "rgba(255,255,255,0.3)" }} />
          </button>
        )}
      </div>

      {/* ── Auto-refresh status bar ─────────────────────────────────────────── */}
      <div className="mx-4 mb-2 flex items-center gap-2 shrink-0">
        {refreshing ? (
          <>
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                style={{ background: GREEN }} />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: GREEN }} />
            </span>
            <p className="text-[9px]" style={{ color: "rgba(255,255,255,0.25)" }}>Actualizando…</p>
          </>
        ) : lastUpdated ? (
          <>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: GREEN }} />
            <p className="text-[9px]" style={{ color: "rgba(255,255,255,0.25)" }}>
              Actualizado · próximo en {countdown}s
            </p>
          </>
        ) : null}
      </div>

      {/* ── List ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto mx-4 rounded-2xl"
        style={{ background: CARD, border: `1px solid ${BORDER}` }}>

        {loading ? (
          <>
            {[1,2,3,4,5,6].map(i => <SkeletonRow key={i} />)}
          </>
        ) : error ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <Ban className="h-8 w-8" style={{ color: "rgba(255,255,255,0.12)" }} />
            <p className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.3)" }}>{error}</p>
            <button onClick={() => fetchData(true)}
              className="mt-2 text-xs font-semibold px-3 py-1.5 rounded-xl"
              style={{ background: `${DANGER}15`, color: DANGER }}>
              Reintentar
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center px-6">
            <Search className="h-8 w-8" style={{ color: "rgba(255,255,255,0.1)" }} />
            <p className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.3)" }}>
              {query ? "Sin resultados para esa dirección" : "No hay registros aún"}
            </p>
          </div>
        ) : (
          filtered.map(entry => <EntryRow key={entry.id} entry={entry} />)
        )}
      </div>

      {/* ── Legal footer ───────────────────────────────────────────────────── */}
      <div className="mx-4 my-3 px-3 py-2.5 rounded-xl flex items-start gap-2 shrink-0"
        style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${BORDER}` }}>
        <ShieldAlert className="h-3 w-3 shrink-0 mt-0.5" style={{ color: "rgba(255,255,255,0.2)" }} />
        <p className="text-[9px] leading-relaxed" style={{ color: "rgba(255,255,255,0.2)" }}>
          Detecta eventos <em>AddedBlackList</em> del contrato USDT TRC20. Solo informativo.
        </p>
      </div>
    </div>
  );
}
