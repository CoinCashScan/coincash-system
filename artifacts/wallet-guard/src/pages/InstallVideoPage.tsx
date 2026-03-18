import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { Apple, Share, ShieldCheck, ChevronUp } from "lucide-react";

const SCENE_DURATIONS = [5000, 8000, 10000, 7000];

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');
  .iv-font { font-family: 'Space Grotesk', sans-serif; }
`;

export default function InstallVideoPage() {
  const [scene, setScene] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => {
      setScene((s) => (s + 1) % SCENE_DURATIONS.length);
    }, SCENE_DURATIONS[scene]);
    return () => clearTimeout(t);
  }, [scene]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0B0F14", overflow: "hidden", color: "#fff" }}>
      <style>{CSS}</style>

      {/* Back button */}
      <button
        onClick={() => { window.location.hash = ""; }}
        style={{
          position: "fixed", top: 16, left: 16, zIndex: 200,
          background: "rgba(11,18,32,0.85)", border: "1px solid rgba(0,255,198,0.2)",
          borderRadius: 20, padding: "6px 14px 6px 10px",
          display: "flex", alignItems: "center", gap: 6,
          color: "#00FFC6", fontSize: 13, fontWeight: 600,
          cursor: "pointer", backdropFilter: "blur(8px)",
          fontFamily: "'Space Grotesk', sans-serif",
        }}
      >
        <span style={{ fontSize: 18, lineHeight: 1 }}>‹</span> Volver
      </button>

      {/* Scene dots */}
      <div style={{ position: "fixed", bottom: 12, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 6, zIndex: 101 }}>
        {SCENE_DURATIONS.map((_, i) => (
          <div key={i} style={{ width: i === scene ? 20 : 6, height: 6, borderRadius: 3, background: i === scene ? "#00FFC6" : "rgba(255,255,255,0.2)", transition: "all 0.3s" }} />
        ))}
      </div>

      {/* Persistent accent glow */}
      <motion.div
        style={{ position: "absolute", width: "40vw", height: "40vw", borderRadius: "50%", filter: "blur(120px)", background: "rgba(0,255,198,0.10)", pointerEvents: "none" }}
        animate={{
          x: scene === 0 ? "30vw" : scene === 1 ? "0vw" : scene === 2 ? "50vw" : "30vw",
          y: scene === 0 ? "30vh" : scene === 1 ? "50vh" : scene === 2 ? "20vh" : "30vh",
          scale: scene === 3 ? 1.5 : 1,
        }}
        transition={{ duration: 3, ease: "easeInOut" }}
      />

      {/* Persistent radial bg */}
      <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle at 50% 50%, #1a2a4a 0%, transparent 50%)", opacity: 0.2, pointerEvents: "none" }} />

      <AnimatePresence mode="wait">
        {scene === 0 && <Scene1 key="s1" />}
        {scene === 1 && <Scene2 key="s2" />}
        {scene === 2 && <Scene3 key="s3" />}
        {scene === 3 && <Scene4 key="s4" />}
      </AnimatePresence>
    </div>
  );
}

/* ── Scene 1: Hook ────────────────────────────────────── */
function Scene1() {
  return (
    <motion.div
      className="iv-font"
      style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: "blur(10px)" }}
      transition={{ duration: 1 }}
    >
      <motion.div
        style={{ width: 96, height: 96, background: "#1a2a4a", borderRadius: 28, margin: "0 auto 32px", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(0,255,198,0.3)", boxShadow: "0 0 30px rgba(0,255,198,0.2)" }}
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ duration: 1, delay: 0.2, type: "spring", stiffness: 200, damping: 20 }}
      >
        <ShieldCheck style={{ width: 48, height: 48, color: "#00FFC6" }} strokeWidth={1.5} />
      </motion.div>

      <motion.h1
        style={{ fontSize: "clamp(28px, 5vw, 72px)", fontWeight: 700, letterSpacing: "-0.02em", margin: "0 0 16px" }}
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 1, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        Instala <span style={{ color: "#00FFC6" }}>CoinCash</span>
      </motion.h1>

      <motion.p
        style={{ fontSize: "clamp(16px, 2.5vw, 32px)", color: "rgba(255,255,255,0.5)", margin: 0 }}
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 1, delay: 0.9, ease: [0.16, 1, 0.3, 1] }}
      >
        en tu iPhone en 3 pasos
      </motion.p>
    </motion.div>
  );
}

/* ── Scene 2: Paso 1 — Safari ─────────────────────────── */
function Scene2() {
  return (
    <motion.div
      className="iv-font"
      style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: "4vw", padding: "5vw" }}
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, x: "-8vw" }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Left: text */}
      <div style={{ flex: 1, maxWidth: "45%" }}>
        <motion.div
          style={{ display: "inline-block", padding: "6px 16px", borderRadius: 999, border: "1px solid rgba(0,255,198,0.3)", background: "rgba(0,255,198,0.08)", color: "#00FFC6", fontSize: "clamp(10px, 1vw, 13px)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 20 }}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          Paso 1
        </motion.div>

        <motion.h2
          style={{ fontSize: "clamp(22px, 3.5vw, 56px)", fontWeight: 700, lineHeight: 1.15, margin: "0 0 24px" }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          Abre <br /><span style={{ color: "#00FFC6" }}>hardsoftcomputer.com</span><br />en Safari
        </motion.h2>

        <motion.div
          style={{ display: "inline-flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: "12px 20px", color: "rgba(255,255,255,0.5)", fontSize: "clamp(12px, 1.2vw, 16px)" }}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
        >
          <Apple style={{ width: 18, height: 18 }} />
          Usa Safari — no Chrome
        </motion.div>
      </div>

      {/* Right: stylized phone */}
      <motion.div
        style={{ flex: "0 0 auto" }}
        initial={{ y: 80, opacity: 0, rotateY: 20 }}
        animate={{ y: 0, opacity: 1, rotateY: 0 }}
        transition={{ duration: 1.2, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
      >
        <div style={{
          width: "clamp(180px, 20vw, 280px)", height: "clamp(360px, 40vw, 560px)",
          borderRadius: 40, border: "8px solid #1a2a4a", background: "#000",
          position: "relative", overflow: "hidden",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,255,198,0.1)",
        }}>
          {/* Safari top bar */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 56, background: "rgba(26,42,74,0.9)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 8, zIndex: 10, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(0,0,0,0.4)", borderRadius: 10, padding: "4px 12px", fontSize: 11, color: "rgba(255,255,255,0.7)" }}>
              <ShieldCheck style={{ width: 12, height: 12, color: "#00FFC6" }} />
              hardsoftcomputer.com
            </div>
          </div>

          {/* App content */}
          <div style={{ paddingTop: 80, display: "flex", flexDirection: "column", alignItems: "center", padding: "80px 16px 16px" }}>
            <ShieldCheck style={{ width: 48, height: 48, color: "#00FFC6", marginBottom: 12 }} strokeWidth={1.5} />
            <div style={{ height: 8, width: 80, background: "rgba(255,255,255,0.15)", borderRadius: 4, marginBottom: 8 }} />
            <div style={{ height: 6, width: 110, background: "rgba(255,255,255,0.08)", borderRadius: 4 }} />
          </div>

          {/* Safari bottom bar with animated share */}
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 64, background: "rgba(26,42,74,0.9)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "space-around", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ width: 20, height: 20, background: "rgba(255,255,255,0.15)", borderRadius: 4 }} />
            <motion.div
              style={{ position: "relative" }}
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 1.8, repeat: Infinity, delay: 2 }}
            >
              <Share style={{ width: 24, height: 24, color: "#00FFC6" }} />
              <motion.div
                style={{ position: "absolute", inset: -6, border: "2px solid #00FFC6", borderRadius: 8, opacity: 0 }}
                animate={{ opacity: [0, 0.8, 0], scale: [0.8, 1.3, 1.5] }}
                transition={{ duration: 1.8, repeat: Infinity, delay: 2 }}
              />
            </motion.div>
            <div style={{ width: 20, height: 20, background: "rgba(255,255,255,0.15)", borderRadius: 4 }} />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ── Scene 3: Pasos 2 & 3 — with screenshot ──────────── */
function Scene3() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t1 = setTimeout(() => setStep(1), 3500);
    const t2 = setTimeout(() => setStep(2), 7000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const steps = [
    { tag: "Paso 2", text: <>Toca el botón <span style={{ color: "#00FFC6" }}>Compartir</span> <ChevronUp style={{ display: "inline", width: 24, height: 24, color: "#00FFC6", verticalAlign: "middle" }} /><br />en la barra inferior</> },
    { tag: "Paso 3", text: <>Selecciona<br /><span style={{ color: "#00FFC6" }}>"Agregar a pantalla de inicio"</span></> },
    { tag: "¡Listo!", text: <>Toca <span style={{ color: "#00FFC6" }}>Agregar</span> en la esquina superior derecha</> },
  ];

  return (
    <motion.div
      className="iv-font"
      style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: "5vw", padding: "5vw" }}
      initial={{ opacity: 0, x: "8vw" }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, filter: "blur(16px)", scale: 1.1 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Left: step text */}
      <div style={{ flex: 1, maxWidth: "40%", position: "relative", minHeight: 180 }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.5 }}
            style={{ position: "absolute", top: 0, left: 0 }}
          >
            <div style={{ display: "inline-block", padding: "5px 14px", borderRadius: 999, border: "1px solid rgba(0,255,198,0.3)", background: "rgba(0,255,198,0.08)", color: "#00FFC6", fontSize: "clamp(10px, 1vw, 13px)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 16 }}>
              {steps[step].tag}
            </div>
            <h3 style={{ fontSize: "clamp(18px, 2.8vw, 42px)", fontWeight: 700, lineHeight: 1.25, margin: 0 }}>
              {steps[step].text}
            </h3>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Right: phone with screenshot */}
      <div style={{ flex: "0 0 auto", position: "relative" }}>
        <motion.div
          style={{
            width: "clamp(180px, 20vw, 280px)", height: "clamp(360px, 40vw, 560px)",
            borderRadius: 40, border: "8px solid #1a2a4a", background: "#000",
            overflow: "hidden", position: "relative",
            boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,255,198,0.1)",
          }}
          animate={{ rotateY: step === 0 ? -8 : step === 1 ? -3 : 0, scale: step === 2 ? 1.04 : 1 }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <img
            src={`${import.meta.env.BASE_URL}install-screenshot.png`}
            alt="CoinCash install steps"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />

          {/* Step highlights */}
          <AnimatePresence>
            {step === 0 && (
              <motion.div
                key="h0"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                style={{
                  position: "absolute", bottom: "2%", left: "50%", transform: "translateX(-50%)",
                  width: 56, height: 56, border: "3px solid #00FFC6", borderRadius: 12,
                  boxShadow: "0 0 20px #00FFC6, 0 0 40px rgba(0,255,198,0.3)",
                }}
              />
            )}
            {step === 1 && (
              <motion.div
                key="h1"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                style={{
                  position: "absolute", bottom: "28%", left: "5%", right: "5%",
                  height: 44, border: "3px solid #00FFC6", borderRadius: 10,
                  background: "rgba(0,255,198,0.08)",
                  boxShadow: "0 0 16px rgba(0,255,198,0.5)",
                }}
              />
            )}
            {step === 2 && (
              <motion.div
                key="h2"
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                style={{
                  position: "absolute", top: "2%", right: "5%",
                  background: "rgba(0,255,198,0.15)", border: "2px solid #00FFC6",
                  borderRadius: 8, padding: "4px 10px",
                  boxShadow: "0 0 16px rgba(0,255,198,0.5)",
                  color: "#00FFC6", fontWeight: 700, fontSize: "clamp(10px, 1vw, 13px)",
                }}
              >
                Agregar
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </motion.div>
  );
}

/* ── Scene 4: Payoff ──────────────────────────────────── */
function Scene4() {
  return (
    <motion.div
      className="iv-font"
      style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ duration: 1 }}
    >
      <motion.div
        style={{ position: "relative", marginBottom: 40 }}
        initial={{ y: 80, scale: 0.5, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        transition={{ duration: 1.2, type: "spring", stiffness: 120, damping: 18 }}
      >
        <div style={{ width: 120, height: 120, background: "#1a2a4a", borderRadius: 32, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 20px 60px rgba(0,255,198,0.3)", overflow: "hidden", position: "relative" }}>
          <ShieldCheck style={{ width: 64, height: 64, color: "#00FFC6" }} strokeWidth={1.5} />
          <motion.div
            style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, transparent 40%, rgba(0,255,198,0.25) 50%, transparent 60%)" }}
            animate={{ x: ["-100%", "200%"] }}
            transition={{ duration: 2, repeat: Infinity, repeatDelay: 1.5 }}
          />
        </div>
        {/* Ping rings */}
        {[1, 2].map((i) => (
          <motion.div
            key={i}
            style={{ position: "absolute", inset: -(i * 16), borderRadius: 32 + i * 16, border: "1px solid rgba(0,255,198,0.3)" }}
            animate={{ opacity: [0.6, 0], scale: [1, 1.15] }}
            transition={{ duration: 2, repeat: Infinity, delay: i * 0.4 }}
          />
        ))}
      </motion.div>

      <motion.h2
        style={{ fontSize: "clamp(26px, 4.5vw, 64px)", fontWeight: 700, letterSpacing: "-0.02em", margin: "0 0 16px" }}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.9 }}
      >
        Ya tienes <span style={{ color: "#00FFC6" }}>CoinCash</span>
      </motion.h2>

      <motion.p
        style={{ fontSize: "clamp(13px, 1.8vw, 24px)", color: "rgba(255,255,255,0.45)", letterSpacing: "0.1em", textTransform: "uppercase", margin: 0 }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9, duration: 0.9 }}
      >
        Análisis de seguridad TRON en tiempo real
      </motion.p>
    </motion.div>
  );
}
