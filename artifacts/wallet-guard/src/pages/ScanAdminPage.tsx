import { useState, useEffect } from "react";
import { API_BASE } from "@/lib/apiConfig";

const ADMIN_KEY = "CoinCashAdmin2026";
const TEAL  = "#00FFC6";
const BG    = "#0B0F14";
const CARD  = "#0B1220";
const MUTED = "rgba(255,255,255,0.45)";
const TEXT  = "rgba(255,255,255,0.9)";
const BORDER = "rgba(255,255,255,0.07)";

interface ScanStats {
  total: number;
  today: number;
  byCountry: { name: string; code: string; count: number }[];
  recent: { id: number; wallet: string; country: string; country_code: string; scanned_at: string }[];
}

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

export default function ScanAdminPage() {
  const key = new URLSearchParams(window.location.search).get("key");
  const [stats, setStats] = useState<ScanStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (key !== ADMIN_KEY) { setLoading(false); return; }
    fetch(`${API_BASE}/scan/stats?key=${ADMIN_KEY}`)
      .then(r => r.json())
      .then(d => { setStats(d); setLoading(false); })
      .catch(() => { setError("Error al cargar estadísticas"); setLoading(false); });
  }, [key]);

  if (key !== ADMIN_KEY) {
    return (
      <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", color: MUTED }}>
          <p style={{ fontSize: 32, margin: "0 0 8px" }}>🔒</p>
          <p style={{ fontSize: 14 }}>Acceso denegado</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: TEAL, fontSize: 14 }}>Cargando...</p>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "#f87171", fontSize: 14 }}>{error ?? "Sin datos"}</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: BG, color: TEXT, fontFamily: "'Inter',sans-serif", paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ background: CARD, borderBottom: `1px solid ${BORDER}`, padding: "20px 16px" }}>
        <p style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Panel de Analítica</p>
        <p style={{ margin: "4px 0 0", fontSize: 12, color: MUTED }}>CoinCash Scanner · Scans de wallets</p>
      </div>

      <div style={{ padding: "16px" }}>

        {/* Total / Hoy */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          {[{ label: "Total scans", value: stats.total }, { label: "Hoy", value: stats.today }].map((item, i) => (
            <div key={i} style={{ background: CARD, borderRadius: 12, border: `1px solid rgba(0,255,198,0.18)`, padding: "16px 14px" }}>
              <p style={{ margin: 0, fontSize: 11, color: MUTED, textTransform: "uppercase", letterSpacing: "0.07em" }}>{item.label}</p>
              <p style={{ margin: "6px 0 0", fontSize: 28, fontWeight: 800, color: TEAL, fontFamily: "monospace" }}>
                {item.value.toLocaleString()}
              </p>
            </div>
          ))}
        </div>

        {/* Países */}
        {stats.byCountry.length > 0 && (
          <div style={{ background: CARD, borderRadius: 12, border: `1px solid ${BORDER}`, marginBottom: 16, overflow: "hidden" }}>
            <p style={{ margin: 0, padding: "12px 14px 8px", fontSize: 12, color: MUTED, textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: `1px solid ${BORDER}` }}>
              Por país
            </p>
            {stats.byCountry.map((c) => (
              <div key={c.code} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: `1px solid ${BORDER}` }}>
                <span style={{ fontSize: 20 }}>{flagEmoji(c.code)}</span>
                <span style={{ flex: 1, fontSize: 13, color: TEXT }}>{c.name}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: TEAL, fontFamily: "monospace" }}>{c.count}</span>
              </div>
            ))}
          </div>
        )}

        {/* Actividad reciente */}
        <div style={{ background: CARD, borderRadius: 12, border: `1px solid ${BORDER}`, overflow: "hidden" }}>
          <p style={{ margin: 0, padding: "12px 14px 8px", fontSize: 12, color: MUTED, textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: `1px solid ${BORDER}` }}>
            Actividad reciente ({stats.recent.length})
          </p>
          {stats.recent.length === 0 && (
            <p style={{ margin: 0, padding: "16px 14px", fontSize: 13, color: MUTED }}>Sin registros aún</p>
          )}
          {stats.recent.map((r) => (
            <div key={r.id} style={{ padding: "10px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "flex-start", gap: 10 }}>
              <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{flagEmoji(r.country_code)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 12, fontFamily: "monospace", color: TEAL, wordBreak: "break-all" }}>{r.wallet}</p>
                <p style={{ margin: "2px 0 0", fontSize: 11, color: MUTED }}>{r.country}</p>
              </div>
              <span style={{ fontSize: 11, color: MUTED, flexShrink: 0, whiteSpace: "nowrap" }}>{timeAgo(r.scanned_at)}</span>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
