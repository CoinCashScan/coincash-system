import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";

const BASE = import.meta.env.BASE_URL;

// ─── Scenes definition ─────────────────────────────────────────────────────
const SCENES = [
  { duration: 3500 },  // 0 intro
  { duration: 5000 },  // 1 step 1
  { duration: 5000 },  // 2 step 2
  { duration: 5500 },  // 3 step 3
  { duration: 5500 },  // 4 step 4
  { duration: 6000 },  // 5 step 5 payoff
];

const FONT = `@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');
* { box-sizing: border-box; margin: 0; padding: 0; }
.iv { font-family: 'Space Grotesk', sans-serif; }
@keyframes ping { 0%,100%{opacity:.8;transform:scale(1)} 50%{opacity:0;transform:scale(1.5)} }
@keyframes tap-ring { 0%{opacity:.9;transform:scale(.8)} 100%{opacity:0;transform:scale(2)} }
.ping { animation: ping 1.5s ease-in-out infinite; }
.tap-ring { animation: tap-ring 1.2s ease-out infinite; }`;

// ─── Highlight dot that pulses over a tap point ─────────────────────────────
function TapDot({ style }: { style: React.CSSProperties }) {
  return (
    <div style={{ position: "absolute", ...style }}>
      <div className="tap-ring" style={{ position: "absolute", inset: -12, border: "3px solid #00FFC6", borderRadius: "50%", pointerEvents: "none" }} />
      <div className="ping"    style={{ position: "absolute", inset: -6,  background: "rgba(0,255,198,0.35)", borderRadius: "50%", pointerEvents: "none" }} />
      <div style={{ width: 20, height: 20, background: "#00FFC6", borderRadius: "50%", boxShadow: "0 0 12px #00FFC6", position: "relative" }} />
    </div>
  );
}

// ─── Phone frame wrapping a screenshot ────────────────────────────────────
function PhoneFrame({ src, children, scale = 1 }: { src: string; children?: React.ReactNode; scale?: number }) {
  return (
    <div style={{
      width: `calc(clamp(160px, 22vw, 290px) * ${scale})`,
      height: `calc(clamp(320px, 44vw, 580px) * ${scale})`,
      borderRadius: 44, border: "8px solid #1a2a4a",
      background: "#000", overflow: "hidden", position: "relative",
      boxShadow: "0 24px 70px rgba(0,0,0,0.7), 0 0 0 1px rgba(0,255,198,0.15)",
      flexShrink: 0,
    }}>
      <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
      {children}
    </div>
  );
}

// ─── Step badge ────────────────────────────────────────────────────────────
function Badge({ text }: { text: string }) {
  return (
    <div style={{ display: "inline-block", padding: "5px 16px", borderRadius: 999, border: "1px solid rgba(0,255,198,0.35)", background: "rgba(0,255,198,0.08)", color: "#00FFC6", fontSize: "clamp(10px, 1vw, 13px)", letterSpacing: "0.12em", textTransform: "uppercase" as const, marginBottom: 18, fontWeight: 600 }}>
      {text}
    </div>
  );
}

// ─── Step layout: phone left or right ─────────────────────────────────────
function StepLayout({
  badge, title, note, imgSrc, dot, phoneRight = false,
}: {
  badge: string; title: React.ReactNode; note?: string;
  imgSrc: string; dot?: React.CSSProperties; phoneRight?: boolean;
}) {
  const phone = (
    <motion.div
      initial={{ y: 60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -40, opacity: 0 }}
      transition={{ duration: 1, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
    >
      <PhoneFrame src={imgSrc}>
        {dot && <TapDot style={dot} />}
      </PhoneFrame>
    </motion.div>
  );

  const text = (
    <motion.div
      initial={{ x: phoneRight ? -40 : 40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
      style={{ flex: 1, maxWidth: "42%" }}
    >
      <Badge text={badge} />
      <h2 style={{ fontSize: "clamp(18px, 2.8vw, 44px)", fontWeight: 700, lineHeight: 1.2, marginBottom: 16 }}>
        {title}
      </h2>
      {note && (
        <p style={{ fontSize: "clamp(11px, 1.2vw, 17px)", color: "rgba(255,255,255,0.4)", lineHeight: 1.5 }}>{note}</p>
      )}
    </motion.div>
  );

  return (
    <motion.div
      className="iv"
      style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: "5vw", padding: "4vw 6vw" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
    >
      {phoneRight ? text : phone}
      {phoneRight ? phone : text}
    </motion.div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────
export default function InstallVideoPage() {
  const [scene, setScene] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setScene((s) => (s + 1) % SCENES.length), SCENES[scene].duration);
    return () => clearTimeout(t);
  }, [scene]);

  return (
    <div className="iv" style={{ position: "fixed", inset: 0, background: "#0B0F14", overflow: "hidden", color: "#fff" }}>
      <style>{FONT}</style>

      {/* Back */}
      <button
        onClick={() => { window.location.hash = ""; }}
        style={{ position: "fixed", top: 16, left: 16, zIndex: 200, background: "rgba(11,18,32,0.9)", border: "1px solid rgba(0,255,198,0.2)", borderRadius: 20, padding: "6px 14px 6px 10px", display: "flex", alignItems: "center", gap: 6, color: "#00FFC6", fontSize: 13, fontWeight: 600, cursor: "pointer", backdropFilter: "blur(8px)", fontFamily: "'Space Grotesk',sans-serif" }}
      >
        <span style={{ fontSize: 18, lineHeight: 1 }}>‹</span> Volver
      </button>

      {/* Progress bar */}
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: 3, background: "rgba(255,255,255,0.07)", zIndex: 100 }}>
        <motion.div
          style={{ height: "100%", background: "linear-gradient(90deg,#00FFC6,#00B8A9)", transformOrigin: "left" }}
          animate={{ width: `${((scene + 1) / SCENES.length) * 100}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>

      {/* Scene dots */}
      <div style={{ position: "fixed", bottom: 14, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 7, zIndex: 100 }}>
        {SCENES.map((_, i) => (
          <div key={i} style={{ width: i === scene ? 22 : 6, height: 6, borderRadius: 3, background: i === scene ? "#00FFC6" : "rgba(255,255,255,0.2)", transition: "all 0.35s" }} />
        ))}
      </div>

      {/* Persistent ambient glow */}
      <motion.div
        style={{ position: "absolute", width: "50vw", height: "50vw", borderRadius: "50%", filter: "blur(130px)", background: "rgba(0,255,198,0.09)", pointerEvents: "none" }}
        animate={{ x: scene < 3 ? "0vw" : "30vw", y: scene < 3 ? "10vh" : "30vh" }}
        transition={{ duration: 3, ease: "easeInOut" }}
      />

      <AnimatePresence mode="wait">
        {scene === 0 && <SceneIntro key="s0" />}
        {scene === 1 && <Scene1 key="s1" />}
        {scene === 2 && <Scene2 key="s2" />}
        {scene === 3 && <Scene3 key="s3" />}
        {scene === 4 && <Scene4 key="s4" />}
        {scene === 5 && <Scene5 key="s5" />}
      </AnimatePresence>
    </div>
  );
}

// ─── Scene 0: Intro ─────────────────────────────────────────────────────────
function SceneIntro() {
  return (
    <motion.div
      className="iv"
      style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 24 }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.08, filter: "blur(12px)" }}
      transition={{ duration: 0.9 }}
    >
      <motion.div
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ duration: 0.9, type: "spring", stiffness: 200, damping: 18 }}
        style={{ width: 96, height: 96, background: "#1a2a4a", borderRadius: 28, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(0,255,198,0.3)", boxShadow: "0 0 40px rgba(0,255,198,0.2)" }}
      >
        <ShieldCheck style={{ width: 50, height: 50, color: "#00FFC6" }} strokeWidth={1.5} />
      </motion.div>

      <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4, duration: 0.9, ease: [0.16,1,0.3,1] }}>
        <h1 style={{ fontSize: "clamp(28px,5vw,72px)", fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.1, marginBottom: 12 }}>
          Instala <span style={{ color: "#00FFC6" }}>CoinCash</span>
        </h1>
        <p style={{ fontSize: "clamp(15px,2vw,28px)", color: "rgba(255,255,255,0.45)" }}>
          en tu iPhone en 4 pasos
        </p>
      </motion.div>
    </motion.div>
  );
}

// ─── Scene 1: Abre la app en el navegador ────────────────────────────────────
function Scene1() {
  return (
    <StepLayout
      badge="Paso 1"
      title={<>Abre <span style={{ color: "#00FFC6" }}>hardsoftcomputer.com</span> en tu navegador</>}
      note="Funciona en Safari y en Brave. Verás la app de CoinCash."
      imgSrc={`${BASE}step1-safari.jpg`}
      dot={{ bottom: "5%", right: "6%", transform: "translate(0,0)" }}
      phoneRight
    />
  );
}

// ─── Scene 2: Toca "..." y luego Compartir ────────────────────────────────
function Scene2() {
  return (
    <StepLayout
      badge="Paso 2"
      title={<>Toca <span style={{ color: "#00FFC6" }}>"..."</span> y selecciona <span style={{ color: "#00FFC6" }}>Compartir</span></>}
      note="El menú del navegador aparece. Toca Compartir en la primera opción."
      imgSrc={`${BASE}step2-menu.jpg`}
      dot={{ top: "38%", left: "14%" }}
    />
  );
}

// ─── Scene 3: Agregar a Inicio ────────────────────────────────────────────
function Scene3() {
  return (
    <StepLayout
      badge="Paso 3"
      title={<>Toca <span style={{ color: "#00FFC6" }}>"Agregar a Inicio"</span> en el menú</>}
      note="Desplázate hacia abajo en el menú de compartir hasta ver esta opción."
      imgSrc={`${BASE}step3-share.jpg`}
      dot={{ bottom: "30%", left: "8%", transform: "translate(0,0)" }}
      phoneRight
    />
  );
}

// ─── Scene 4: Confirmar con Agregar ──────────────────────────────────────
function Scene4() {
  return (
    <StepLayout
      badge="Paso 4"
      title={<>Toca el botón azul <span style={{ color: "#00FFC6" }}>"Agregar"</span></>}
      note='El nombre ya aparece como "CoinCash". Solo confirma tocando Agregar.'
      imgSrc={`${BASE}step4-addtohome.jpg`}
      dot={{ top: "4%", right: "6%" }}
    />
  );
}

// ─── Scene 5: Payoff — ícono en pantalla de inicio ────────────────────────
function Scene5() {
  return (
    <motion.div
      className="iv"
      style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: "5vw", padding: "4vw 6vw" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.8 }}
    >
      {/* Text */}
      <motion.div
        initial={{ x: -40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.9, ease: [0.16,1,0.3,1] }}
        style={{ flex: 1, maxWidth: "42%" }}
      >
        <Badge text="¡Listo!" />
        <h2 style={{ fontSize: "clamp(22px,3.5vw,52px)", fontWeight: 700, lineHeight: 1.2, marginBottom: 16 }}>
          Ya tienes <span style={{ color: "#00FFC6" }}>CoinCash</span> instalada
        </h2>
        <p style={{ fontSize: "clamp(11px,1.2vw,17px)", color: "rgba(255,255,255,0.4)", lineHeight: 1.6 }}>
          El ícono aparece en tu pantalla de inicio.<br />
          Tócalo para abrir la app sin el navegador.
        </p>
      </motion.div>

      {/* Phone with home screen */}
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1, duration: 1, ease: [0.16,1,0.3,1] }}
      >
        <PhoneFrame src={`${BASE}step5-homescreen.jpg`}>
          {/* Highlight the CoinCash icon at bottom-left of home screen */}
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.8, duration: 0.6, type: "spring" }}
            style={{ position: "absolute", bottom: "14%", left: "4%", width: "22%", aspectRatio: "1", border: "3px solid #00FFC6", borderRadius: 22, boxShadow: "0 0 24px rgba(0,255,198,0.7), 0 0 50px rgba(0,255,198,0.3)" }}
          />
        </PhoneFrame>
      </motion.div>
    </motion.div>
  );
}
