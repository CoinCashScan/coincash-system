import { useEffect, useState } from "react";

const TEAL = "#00FFC6";

// Inject keyframes once into the document head
const KEYFRAMES = `
@keyframes cc-splash-in {
  from { opacity: 0; transform: scale(0.92); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes cc-splash-out {
  from { opacity: 1; }
  to   { opacity: 0; }
}
@keyframes cc-logo-glow {
  0%, 100% { box-shadow: 0 0 28px 6px rgba(0,255,198,0.25), 0 0 60px 12px rgba(0,184,169,0.12); }
  50%       { box-shadow: 0 0 44px 14px rgba(0,255,198,0.45), 0 0 90px 24px rgba(0,184,169,0.22); }
}
@keyframes cc-pulse-dot {
  0%, 100% { opacity: 1;   transform: scale(1); }
  50%       { opacity: 0.5; transform: scale(1.5); }
}
@keyframes cc-fade-text {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
`;

function injectKeyframes() {
  if (typeof document === "undefined") return;
  if (document.getElementById("cc-splash-kf")) return;
  const s = document.createElement("style");
  s.id = "cc-splash-kf";
  s.textContent = KEYFRAMES;
  document.head.appendChild(s);
}

interface Props {
  onDone: () => void;
}

/**
 * Full-screen splash shown on first load.
 * Stays visible for at least MIN_MS, then fades out.
 */
const MIN_MS     = 1800;  // minimum display time
const FADEOUT_MS = 500;   // fade-out duration

export default function SplashScreen({ onDone }: Props) {
  const [phase, setPhase] = useState<"in" | "hold" | "out">("in");

  useEffect(() => {
    injectKeyframes();

    // After fade-in (500ms) we enter the hold phase
    const t1 = setTimeout(() => setPhase("hold"), 500);

    // After MIN_MS total, start fade-out
    const t2 = setTimeout(() => setPhase("out"), MIN_MS);

    // After fade-out completes, notify parent
    const t3 = setTimeout(() => onDone(), MIN_MS + FADEOUT_MS);

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  return (
    <div
      style={{
        position:       "fixed",
        inset:          0,
        zIndex:         99999,
        background:     "linear-gradient(160deg, #0B0F1A 0%, #0B1520 60%, #080C14 100%)",
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: "center",
        gap:            0,
        animation:      phase === "out"
          ? `cc-splash-out ${FADEOUT_MS}ms ease forwards`
          : "cc-splash-in 0.5s cubic-bezier(0.22,1,0.36,1) both",
        pointerEvents: phase === "out" ? "none" : "all",
      }}
    >
      {/* ── Ambient background glow ── */}
      <div style={{
        position: "absolute",
        top: "35%", left: "50%",
        transform: "translate(-50%, -50%)",
        width: 320, height: 320,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(0,255,198,0.07) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      {/* ── Logo container ── */}
      <div style={{
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        gap:            24,
        animation:      "cc-splash-in 0.6s cubic-bezier(0.22,1,0.36,1) 0.05s both",
      }}>

        {/* Shield / logo circle */}
        <div style={{
          position:     "relative",
          width:        100,
          height:       100,
          borderRadius: "50%",
          background:   "linear-gradient(135deg, #00FFC6 0%, #00B8A9 100%)",
          display:      "flex",
          alignItems:   "center",
          justifyContent: "center",
          animation:    "cc-logo-glow 2.4s ease-in-out infinite",
          flexShrink:   0,
        }}>
          {/* Shield icon */}
          <svg width="52" height="60" viewBox="0 0 52 60" fill="none">
            <path
              d="M26 2L4 12v18c0 14 9.6 27 22 30 12.4-3 22-16 22-30V12L26 2z"
              fill="rgba(11,15,26,0.92)"
            />
            <path
              d="M26 8L8 17v13c0 11.5 8 22 18 25 10-3 18-13.5 18-25V17L26 8z"
              fill="none"
              stroke={TEAL}
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            {/* Check mark */}
            <polyline
              points="16,30 22,36 36,22"
              stroke={TEAL}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>

          {/* Pulse dot — live activity indicator */}
          <div style={{
            position:     "absolute",
            top:          6,
            right:        6,
            width:        12,
            height:       12,
            borderRadius: "50%",
            background:   "#19C37D",
            border:       "2px solid rgba(11,15,26,0.8)",
            animation:    "cc-pulse-dot 1.4s ease-in-out infinite",
          }} />
        </div>

        {/* Brand name */}
        <div style={{ textAlign: "center" }}>
          <div style={{
            fontSize:      34,
            fontWeight:    800,
            letterSpacing: "-0.5px",
            color:         "#FFFFFF",
            fontFamily:    "'Inter', system-ui, sans-serif",
            lineHeight:    1,
          }}>
            Coin<span style={{ color: TEAL }}>Cash</span>
          </div>

          {/* Tagline */}
          <div style={{
            marginTop:     12,
            fontSize:      13,
            color:         "rgba(255,255,255,0.38)",
            letterSpacing: "0.04em",
            fontFamily:    "'Inter', system-ui, sans-serif",
            fontWeight:    400,
            animation:     "cc-fade-text 0.6s ease 0.5s both",
          }}>
            Análisis de seguridad TRON en tiempo real
          </div>
        </div>

        {/* Loading bar */}
        <div style={{
          width:        120,
          height:       2,
          background:   "rgba(255,255,255,0.07)",
          borderRadius: 2,
          overflow:     "hidden",
          marginTop:    8,
          animation:    "cc-fade-text 0.4s ease 0.6s both",
        }}>
          <div style={{
            height:     "100%",
            background: `linear-gradient(90deg, transparent, ${TEAL}, transparent)`,
            borderRadius: 2,
            animation:  `cc-splash-in 1.2s linear ${MIN_MS / 1000 - 0.2}s both`,
            width:      "100%",
          }} />
        </div>
      </div>
    </div>
  );
}
