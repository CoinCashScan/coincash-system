import { useState, useEffect } from "react";

const STORAGE_KEY = "coincash-ios-install-dismissed";

function isIOS(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function isInStandaloneMode(): boolean {
  return (
    ("standalone" in navigator && (navigator as any).standalone === true) ||
    window.matchMedia("(display-mode: standalone)").matches
  );
}

export default function IOSInstallBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    if (
      isIOS() &&
      !isInStandaloneMode() &&
      !localStorage.getItem(STORAGE_KEY)
    ) {
      t = setTimeout(() => setVisible(true), 1200);
    }
    return () => { if (t !== undefined) clearTimeout(t); };
  }, []);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={dismiss}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.55)",
          zIndex: 9998,
        }}
      />

      {/* Sheet */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 9999,
          background: "#141A24",
          borderTopLeftRadius: "24px",
          borderTopRightRadius: "24px",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.6)",
          padding: "28px 24px 40px",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
        }}
      >
        {/* Handle */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "-8px" }}>
          <div style={{
            width: "40px",
            height: "4px",
            borderRadius: "2px",
            background: "rgba(255,255,255,0.15)",
          }} />
        </div>

        {/* Icon + Title */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{
            width: "48px",
            height: "48px",
            borderRadius: "12px",
            background: "rgba(0,255,198,0.12)",
            border: "1px solid rgba(0,255,198,0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 2v13M7 7l5-5 5 5" stroke="#00FFC6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M20 16v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4" stroke="#00FFC6" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "#ffffff", lineHeight: 1.2 }}>
              Instalar CoinCash
            </div>
            <div style={{ fontSize: "12px", color: "#9CA3AF", marginTop: "3px" }}>
              Agregar a tu pantalla de inicio
            </div>
          </div>
        </div>

        {/* Steps */}
        <div style={{
          background: "rgba(255,255,255,0.04)",
          borderRadius: "16px",
          border: "1px solid rgba(255,255,255,0.07)",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "14px",
        }}>
          {[
            {
              num: "1",
              icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="#60A5FA" strokeWidth="1.8"/>
                  <path d="M9 12l2 2 4-4" stroke="#60A5FA" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ),
              text: "Abre esta página en Safari",
            },
            {
              num: "2",
              icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2v13M7 7l5-5 5 5" stroke="#00FFC6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M20 16v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4" stroke="#00FFC6" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
              ),
              text: (
                <>
                  Toca el botón{" "}
                  <span style={{ color: "#00FFC6", fontWeight: 600 }}>Compartir</span>
                  {" "}
                  <span style={{ fontSize: "15px" }}>⎋</span>
                  {" "}en la barra inferior
                </>
              ),
            },
            {
              num: "3",
              icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="#A78BFA" strokeWidth="1.8"/>
                  <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="#A78BFA" strokeWidth="1.8"/>
                  <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="#A78BFA" strokeWidth="1.8"/>
                  <path d="M17.5 14v7M14 17.5h7" stroke="#A78BFA" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
              ),
              text: (
                <>
                  Selecciona{" "}
                  <span style={{ color: "#A78BFA", fontWeight: 600 }}>"Agregar a pantalla de inicio"</span>
                </>
              ),
            },
          ].map((step, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
              <div style={{
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                marginTop: "1px",
              }}>
                {step.icon}
              </div>
              <div style={{
                fontSize: "13.5px",
                color: "rgba(255,255,255,0.85)",
                lineHeight: 1.5,
                paddingTop: "5px",
              }}>
                {step.text}
              </div>
            </div>
          ))}
        </div>

        {/* Button */}
        <button
          onClick={dismiss}
          style={{
            width: "100%",
            padding: "15px",
            borderRadius: "14px",
            border: "none",
            background: "linear-gradient(135deg, #00FFC6 0%, #00D4A8 100%)",
            color: "#0B0F14",
            fontSize: "15px",
            fontWeight: 700,
            letterSpacing: "0.01em",
            cursor: "pointer",
            boxShadow: "0 4px 20px rgba(0,255,198,0.3)",
          }}
        >
          Entendido
        </button>
      </div>
    </>
  );
}
