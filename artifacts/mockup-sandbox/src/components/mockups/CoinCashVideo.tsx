import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { ShieldAlert, ShieldCheck, Search, Activity, Lock, CheckCircle2, ChevronDown, AlertTriangle, AlertOctagon, Smartphone, Zap } from "lucide-react";
import logoIcon from "../../assets/cc-logo-icon-orig.png";

// Hook: 3s, Problem: 3s, App: 3.5s, Prediction: 3.5s, Result: 3s, Warning: 2.5s, CTA: 4s
const SCENE_DURATIONS = [3000, 3000, 3500, 3500, 3000, 2500, 4000];

export default function CoinCashVideo() {
  const [currentScene, setCurrentScene] = useState(0);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    const playScene = (index: number) => {
      timer = setTimeout(() => {
        const nextScene = (index + 1) % SCENE_DURATIONS.length;
        setCurrentScene(nextScene);
        playScene(nextScene);
      }, SCENE_DURATIONS[index]);
    };
    playScene(currentScene);
    return () => clearTimeout(timer);
  }, [currentScene]);

  // Dark (crypto/fintech) with Black, Blue, and Red (alert)
  const bgColors = [
    "#0B0A0F", // Hook (Dark)
    "#060913", // Problem (Dark blue-ish)
    "#020B1A", // App (Deep Blue)
    "#020B1A", // Prediction (Deep Blue)
    "#1A0505", // Result (Dark Red)
    "#1A0505", // Warning (Dark Red)
    "#060913", // CTA (Dark blue-ish)
  ];
  
  const accentColors = [
    "#FF3333", // Hook - Red
    "#3388FF", // Problem - Blue
    "#0066FF", // App - Blue
    "#3388FF", // Prediction - Blue
    "#FF1A1A", // Result - Red
    "#FF0000", // Warning - Red
    "#0066FF", // CTA - Blue
  ];

  return (
    <div className="w-full h-screen bg-black flex items-center justify-center font-sans overflow-hidden">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;700;800&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap');
        .font-display { font-family: 'Plus Jakarta Sans', sans-serif; }
        .font-mono { font-family: 'JetBrains Mono', monospace; }
        .text-glow-red { text-shadow: 0 0 20px rgba(255, 51, 51, 0.6); }
        .text-glow-blue { text-shadow: 0 0 20px rgba(51, 136, 255, 0.6); }
        
        .glitch-wrapper {
          position: relative;
        }
        .glitch {
          position: relative;
          color: white;
        }
        .glitch::before, .glitch::after {
          content: attr(data-text);
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          opacity: 0.8;
        }
        .glitch::before {
          color: #0ff;
          z-index: -1;
          animation: glitch-anim-1 2s infinite linear alternate-reverse;
        }
        .glitch::after {
          color: #f0f;
          z-index: -2;
          animation: glitch-anim-2 3s infinite linear alternate-reverse;
        }
        @keyframes glitch-anim-1 {
          0% { clip-path: inset(20% 0 80% 0); transform: translate(-2px, 1px); }
          20% { clip-path: inset(60% 0 10% 0); transform: translate(2px, -1px); }
          40% { clip-path: inset(40% 0 50% 0); transform: translate(-2px, 2px); }
          60% { clip-path: inset(80% 0 5% 0); transform: translate(2px, -2px); }
          80% { clip-path: inset(10% 0 70% 0); transform: translate(-1px, 1px); }
          100% { clip-path: inset(30% 0 50% 0); transform: translate(1px, -1px); }
        }
        @keyframes glitch-anim-2 {
          0% { clip-path: inset(10% 0 60% 0); transform: translate(2px, -1px); }
          20% { clip-path: inset(30% 0 20% 0); transform: translate(-2px, 1px); }
          40% { clip-path: inset(70% 0 10% 0); transform: translate(2px, 2px); }
          60% { clip-path: inset(20% 0 50% 0); transform: translate(-2px, -2px); }
          80% { clip-path: inset(50% 0 30% 0); transform: translate(1px, 1px); }
          100% { clip-path: inset(5% 0 80% 0); transform: translate(-1px, -1px); }
        }
      `}</style>

      {/* 9:16 Container representing TikTok 1080x1920 */}
      <div 
        className="relative overflow-hidden shadow-2xl bg-[#0B0F14] text-white select-none"
        style={{ 
          width: '100%',
          height: '100%',
          maxWidth: '56.25vh', /* 9/16 aspect ratio */
          maxHeight: '100vh',
          aspectRatio: '9/16'
        }}
      >
        {/* Persistent Background Layer */}
        <motion.div
          className="absolute inset-0 z-0"
          animate={{ backgroundColor: bgColors[currentScene] }}
          transition={{ duration: 0.8 }}
        >
          {/* Tech Grid Pattern */}
          <div className="absolute inset-0 opacity-10" 
            style={{ 
              backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
              backgroundSize: '40px 40px'
            }} 
          />
          <div className="absolute inset-0 opacity-[0.04] mix-blend-overlay pointer-events-none" 
            style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }}
          ></div>
        </motion.div>

        {/* Persistent Accent Glows */}
        <motion.div
          className="absolute w-[80vw] h-[80vw] sm:w-[500px] sm:h-[500px] rounded-full blur-[100px] z-0 opacity-20"
          animate={{
            backgroundColor: accentColors[currentScene],
            x: currentScene === 1 ? '-30%' : currentScene === 3 ? '30%' : '0%',
            y: currentScene === 0 ? '-30%' : currentScene === 4 ? '30%' : '0%',
            scale: currentScene === 5 ? 1.5 : 1,
          }}
          transition={{ duration: 1.5, ease: "easeInOut" }}
          style={{ top: '20%', left: '50%', transform: 'translateX(-50%)' }}
        />

        {/* Foreground Content */}
        <AnimatePresence mode="wait">
          {currentScene === 0 && <Scene1 key="scene-1" />}
          {currentScene === 1 && <Scene2 key="scene-2" />}
          {currentScene === 2 && <Scene3 key="scene-3" />}
          {currentScene === 3 && <Scene4 key="scene-4" />}
          {currentScene === 4 && <Scene5 key="scene-5" />}
          {currentScene === 5 && <Scene6 key="scene-6" />}
          {currentScene === 6 && <Scene7 key="scene-7" />}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Scene 1: Hook (Glitch effect + alert)
function Scene1() {
  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center p-8 text-center"
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, filter: "blur(10px)" }}
      transition={{ duration: 0.5 }}
    >
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        <motion.div
          animate={{ scale: [1, 1.2, 1], rotate: [0, -5, 5, 0] }}
          transition={{ repeat: Infinity, duration: 0.5, repeatDelay: 1 }}
          className="mb-8 inline-block"
        >
          <AlertTriangle className="w-24 h-24 text-[#FF3333] drop-shadow-[0_0_20px_rgba(255,51,51,0.8)]" />
        </motion.div>

        <h1 className="font-display text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.1] mb-6">
          <div className="glitch-wrapper mb-4">
            <span className="glitch text-glow-red text-[#FF3333]" data-text="⚠️ Te pueden congelar">⚠️ Te pueden congelar</span>
          </div>
          los <span className="text-white">USDT</span><br/>
          <span className="text-white opacity-90">sin avisarte</span>
        </h1>
      </motion.div>
    </motion.div>
  );
}

// Scene 2: Problem
function Scene2() {
  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center p-8"
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      transition={{ duration: 0.6 }}
    >
      <motion.h2 
        className="font-display text-4xl font-bold text-center mb-12 leading-tight"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        Muchas wallets <br/>
        parecen <span className="text-[#3388FF] text-glow-blue">seguras...</span><br/>
        <span className="text-white/50">pero no lo son</span>
      </motion.h2>

      <motion.div 
        className="w-full max-w-sm bg-[#111625] border border-[#3388FF]/30 rounded-3xl p-6 shadow-2xl relative"
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4, type: "spring" }}
      >
        <div className="flex items-center gap-4 mb-6 opacity-50">
          <div className="w-12 h-12 rounded-full bg-[#3388FF]/20 flex items-center justify-center">
            <span className="text-[#3388FF] font-bold text-xl">₮</span>
          </div>
          <div>
            <div className="text-gray-400 font-display">Tether USD</div>
            <div className="text-white font-bold text-xl font-mono">1,500.00</div>
          </div>
        </div>

        <motion.div 
          className="absolute inset-0 bg-[#FF3333]/90 backdrop-blur-md rounded-3xl flex flex-col items-center justify-center border-2 border-[#FF3333]"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1.5, type: "spring", bounce: 0.6 }}
        >
          <AlertOctagon className="w-16 h-16 text-white mb-2" />
          <div className="text-white font-bold text-2xl font-display text-center leading-tight">¡ACTIVIDAD<br/>SOSPECHOSA!</div>
          <div className="text-white/80 mt-2 font-mono text-sm">Origen ilícito detectado</div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

// Scene 3: App
function Scene3() {
  const [scanPos, setScanPos] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setScanPos(p => (p > 100 ? 0 : p + 3));
    }, 30);
    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center p-8"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, y: 100 }}
      transition={{ duration: 0.6 }}
    >
      <motion.div
        initial={{ y: -30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="mb-10 text-center"
      >
        <h2 className="font-display text-4xl md:text-5xl font-bold leading-tight">
          <span style={{ color: "#FFFFFF" }}>Coin</span><span style={{ color: "#00DCA0" }}>Cash</span> analiza<br/>
          wallets en segundos
        </h2>
      </motion.div>

      <motion.div 
        className="w-full max-w-sm bg-[#0A1128] border-2 border-[#0066FF]/40 rounded-[2.5rem] p-6 relative overflow-hidden shadow-[0_0_50px_rgba(0,102,255,0.2)]"
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4, type: "spring" }}
      >
        <div className="flex justify-center mb-6">
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
          >
            <Search className="w-12 h-12 text-[#0066FF]" />
          </motion.div>
        </div>

        <div className="relative bg-black/60 border border-[#0066FF]/30 rounded-xl p-4 mb-4 overflow-hidden h-24 flex items-center justify-center">
          <div className="font-mono text-sm text-gray-300 break-all text-center">
            TN3W4H6rK2ce4vX9YnVN...
          </div>
          
          <motion.div 
            className="absolute left-0 right-0 h-8 bg-gradient-to-b from-transparent via-[#0066FF]/50 to-transparent"
            style={{ top: `${scanPos}%`, transform: 'translateY(-50%)' }}
          />
          <div className="absolute left-0 right-0 h-0.5 bg-[#0066FF] shadow-[0_0_15px_#0066FF]"
            style={{ top: `${scanPos}%` }}
          />
        </div>

        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <motion.div 
              key={i}
              className="h-10 bg-[#141C3A] rounded-lg overflow-hidden relative"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6 + i * 0.1 }}
            >
              <motion.div 
                className="absolute top-0 left-0 bottom-0 bg-[#0066FF]/20"
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: 1.5, delay: 0.8 }}
              />
            </motion.div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

// Scene 4: Prediction
function Scene4() {
  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center p-8 bg-gradient-to-b from-transparent to-[#0A1128]/80"
      initial={{ opacity: 0, rotateY: 90 }}
      animate={{ opacity: 1, rotateY: 0 }}
      exit={{ opacity: 0, scale: 1.2 }}
      transition={{ duration: 0.8 }}
      style={{ perspective: 1000 }}
    >
      <motion.div
        className="w-24 h-24 rounded-2xl bg-[#0066FF]/20 flex items-center justify-center mb-8 border border-[#0066FF]/50"
        initial={{ scale: 0, rotate: -45 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", bounce: 0.5, delay: 0.2 }}
      >
        <Zap className="w-12 h-12 text-[#0066FF] drop-shadow-[0_0_15px_#0066FF]" />
      </motion.div>

      <motion.h2 
        className="font-display text-4xl md:text-5xl font-bold text-center leading-tight mb-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        Sistema de<br/>
        <span className="text-[#FF3333] text-glow-red">predicción 🔥</span><br/>
        de congelamiento
      </motion.h2>

      <motion.div
        className="bg-[#0066FF]/10 text-[#0066FF] px-6 py-4 rounded-2xl border border-[#0066FF]/30 font-display font-semibold text-xl text-center shadow-[0_0_20px_rgba(0,102,255,0.15)]"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        Detecta riesgo antes de perder tu dinero
      </motion.div>
    </motion.div>
  );
}

// Scene 5: Result
function Scene5() {
  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center p-8"
      initial={{ opacity: 0, scale: 2 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, filter: "blur(20px)" }}
      transition={{ duration: 0.6, type: "spring" }}
    >
      <div className="relative w-72 h-72 flex items-center justify-center mb-10">
        <svg className="absolute inset-0 w-full h-full transform -rotate-90">
          <circle cx="144" cy="144" r="120" fill="none" stroke="#330000" strokeWidth="24" />
          <motion.circle 
            cx="144" cy="144" r="120" fill="none" stroke="#FF0000" strokeWidth="24" strokeLinecap="round"
            strokeDasharray="754"
            initial={{ strokeDashoffset: 754 }}
            animate={{ strokeDashoffset: 0 }}
            transition={{ duration: 1.5, ease: "easeOut" }}
            className="drop-shadow-[0_0_20px_#FF0000]"
          />
        </svg>
        <div className="text-center">
          <motion.div 
            className="text-7xl font-black font-display text-[#FF0000] text-glow-red"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 1, type: "spring", bounce: 0.6 }}
          >
            100
          </motion.div>
          <div className="text-2xl text-white/60 font-mono mt-1">/ 100</div>
        </div>
      </div>

      <motion.div 
        className="text-center"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2 }}
      >
        <div className="text-2xl font-display text-white/80 mb-2">Riesgo de congelamiento:</div>
        <div className="text-5xl font-black font-display text-[#FF0000] tracking-wider uppercase text-glow-red">
          ALTO
        </div>
      </motion.div>
    </motion.div>
  );
}

// Scene 6: Warning
function Scene6() {
  return (
    <motion.div
      className="absolute inset-0 z-10 flex items-center justify-center p-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -50 }}
      transition={{ duration: 0.4 }}
    >
      <motion.div
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ repeat: Infinity, duration: 0.8 }}
        className="text-center border-4 border-[#FF0000] p-10 rounded-[2.5rem] bg-[#FF0000]/10 w-full max-w-sm shadow-[0_0_50px_rgba(255,0,0,0.3)]"
      >
        <AlertTriangle className="w-24 h-24 text-[#FF0000] mx-auto mb-8 drop-shadow-[0_0_20px_#FF0000]" />
        <h2 className="font-display text-4xl font-bold text-white uppercase leading-tight">
          ⚠️ Fondos<br/>pueden ser<br/>
          <span className="text-[#FF0000] text-glow-red">bloqueados</span>
        </h2>
      </motion.div>
    </motion.div>
  );
}

// Scene 7: CTA
function Scene7() {
  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col items-center justify-between py-24 px-8"
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
    >
      <div className="flex flex-col items-center mt-12">
        <motion.div
          className="relative w-40 h-40 mb-8"
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 100, delay: 0.2 }}
        >
          <img 
            src={logoIcon}
            alt="CoinCash Logo" 
            className="w-full h-full object-contain drop-shadow-[0_0_30px_rgba(0,220,160,0.7)]"
          />
        </motion.div>
        
        <motion.h1 
          className="font-display text-5xl md:text-6xl font-extrabold tracking-tight mb-10"
          style={{ letterSpacing: "-0.02em" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <span style={{ color: "#FFFFFF" }}>Coin</span><span style={{ color: "#00DCA0" }}>Cash</span>
        </motion.h1>

        <motion.h2 
          className="font-display text-4xl text-center font-bold leading-tight"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
        >
          Verifica antes<br/>de recibir dinero
        </motion.h2>
      </div>

      <motion.div
        className="w-full text-center"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.5 }}
      >
        <motion.div
          animate={{ y: [0, -10, 0] }}
          transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
          className="flex flex-col items-center"
        >
          <div className="text-xl md:text-2xl font-display font-bold text-white bg-[#0066FF] px-8 py-4 rounded-full shadow-[0_0_30px_rgba(0,102,255,0.5)] border-2 border-[#3388FF]">
            👇 Da clic en el link de la descripción
          </div>
        </motion.div>
        {/* Visual space for UI of tiktok/reels - bottom area */}
        <div className="h-32"></div>
      </motion.div>
    </motion.div>
  );
}
