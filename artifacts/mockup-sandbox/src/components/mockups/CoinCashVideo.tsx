import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { ShieldAlert, ShieldCheck, Search, Activity, Lock, CheckCircle2, ChevronDown, AlertTriangle } from "lucide-react";
import logoIcon from "../../assets/cc-logo-icon-orig.png";

// Hook: 3s, Problem: 3s, Solution: 6s, Benefits: 6s, Branding: 4s
const SCENE_DURATIONS = [3000, 3000, 6000, 6000, 4000];

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

  // Persistent background element colors
  const bgColors = ["#0B0F14", "#180B0F", "#0B1220", "#0B1220", "#0B0F14"];
  const accentColors = ["#00FFC6", "#FF4D4F", "#00FFC6", "#00DCA0", "#00FFC6"];

  return (
    <div className="w-full h-screen bg-black flex items-center justify-center font-sans overflow-hidden">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;700;800&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap');
        .font-display { font-family: 'Plus Jakarta Sans', sans-serif; }
        .font-mono { font-family: 'JetBrains Mono', monospace; }
        .text-glow { text-shadow: 0 0 20px rgba(0, 255, 198, 0.5); }
        .text-glow-danger { text-shadow: 0 0 20px rgba(255, 77, 79, 0.5); }
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
          transition={{ duration: 1.5 }}
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
            x: currentScene === 1 ? '-20%' : currentScene === 3 ? '20%' : '0%',
            y: currentScene === 0 ? '-30%' : currentScene === 2 ? '30%' : '0%',
            scale: currentScene === 4 ? 1.5 : 1,
          }}
          transition={{ duration: 2, ease: "easeInOut" }}
          style={{ top: '20%', left: '50%', transform: 'translateX(-50%)' }}
        />

        {/* Foreground Content */}
        <AnimatePresence mode="wait">
          {currentScene === 0 && <Scene1 key="scene-1" />}
          {currentScene === 1 && <Scene2 key="scene-2" />}
          {currentScene === 2 && <Scene3 key="scene-3" />}
          {currentScene === 3 && <Scene4 key="scene-4" />}
          {currentScene === 4 && <Scene5 key="scene-5" />}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Scene 1: Hook
function Scene1() {
  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center p-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: "blur(10px)" }}
      transition={{ duration: 0.8 }}
    >
      <motion.div
        initial={{ y: 50, opacity: 0, rotateX: -20 }}
        animate={{ y: 0, opacity: 1, rotateX: 0 }}
        transition={{ duration: 0.8, delay: 0.2, type: "spring", stiffness: 100 }}
        className="text-center w-full"
        style={{ perspective: 1000 }}
      >
        <motion.div 
          className="bg-[#00FFC6]/20 text-[#00FFC6] px-6 py-2 rounded-full inline-block mb-8 border border-[#00FFC6]/50 font-display font-bold text-lg"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", delay: 0.5, bounce: 0.5 }}
        >
          ALERTA USDT
        </motion.div>
        
        <h1 className="font-display text-5xl md:text-6xl font-extrabold tracking-tight text-white leading-tight mb-8">
          Antes de <span className="text-[#00FFC6] text-glow">recibir USDT</span><br/>
          mira esto
        </h1>

        <motion.div
          animate={{ y: [0, 15, 0] }}
          transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
          className="mx-auto flex justify-center mt-12"
        >
          <ChevronDown className="w-16 h-16 text-[#00FFC6]" />
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

// Scene 2: Problem
function Scene2() {
  const [showWarning, setShowWarning] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowWarning(true), 1200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center p-8"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, y: -50 }}
      transition={{ duration: 0.6 }}
    >
      <div className="w-full max-w-sm relative">
        {/* Mock Wallet */}
        <motion.div 
          className="bg-[#1A1F2E] border border-gray-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden"
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                <span className="text-green-500 font-bold">₮</span>
              </div>
              <div>
                <div className="text-gray-400 text-sm font-display">Balance (TRC20)</div>
                <div className="text-white font-bold text-2xl font-display">12,450.00 USDT</div>
              </div>
            </div>
          </div>
          <div className="bg-black/50 rounded-xl p-4 font-mono text-sm text-gray-400 break-all border border-gray-800">
            TVH3oR...j9XqLp
          </div>

          {/* Red Alert Overlay */}
          <AnimatePresence>
            {showWarning && (
              <motion.div 
                className="absolute inset-0 bg-[#FF4D4F]/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4 }}
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", bounce: 0.6 }}
                >
                  <AlertTriangle className="w-20 h-20 text-white mb-4 drop-shadow-lg" />
                </motion.div>
                <div className="text-white font-display font-bold text-2xl mb-2">RIESGO ALTO</div>
                <div className="text-white/90 font-display text-lg">Billetera vinculada a fraude</div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Floating Text */}
        <motion.div
          className="absolute -top-20 left-0 right-0 text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.6 }}
        >
          <h2 className="font-display text-4xl font-bold text-white leading-tight">
            Muchas billeteras<br/>
            están en <span className="text-[#FF4D4F] text-glow-danger">riesgo ⚠️</span>
          </h2>
        </motion.div>
      </div>
    </motion.div>
  );
}

// Scene 3: Solution
function Scene3() {
  const [scanPos, setScanPos] = useState(0);
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    // Animate scanner line
    const interval = setInterval(() => {
      setScanPos(p => (p > 100 ? 0 : p + 2));
    }, 30);

    const timer = setTimeout(() => {
      setScanned(true);
      clearInterval(interval);
    }, 3500);

    return () => {
      clearInterval(interval);
      clearTimeout(timer);
    };
  }, []);

  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center p-8"
      initial={{ opacity: 0, x: 100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, scale: 1.2, filter: "blur(20px)" }}
      transition={{ type: "spring", stiffness: 80, damping: 20 }}
    >
      <div className="text-center w-full mb-12">
        <motion.h2 
          className="font-display text-4xl md:text-5xl font-bold text-white mb-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          Analiza cualquier wallet<br/>
          <span className="text-[#00FFC6]">TRC20 en segundos</span>
        </motion.h2>
      </div>

      {/* App UI Mockup */}
      <motion.div 
        className="w-full max-w-sm bg-[#0B1220] border border-[#00FFC6]/30 rounded-3xl p-6 relative overflow-hidden shadow-[0_0_50px_rgba(0,255,198,0.15)]"
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.6, type: "spring" }}
      >
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#00FFC6]/10 mb-4">
            <Search className="w-8 h-8 text-[#00FFC6]" />
          </div>
          <div className="text-xl font-display font-bold text-white">Escáner de Billeteras</div>
        </div>

        <div className="relative bg-black/40 border border-gray-800 rounded-xl p-4 mb-6">
          <div className="font-mono text-sm text-[#00FFC6] break-all">
            TN3W4H6rK2ce4vX9YnVN7xBkKjZpX...
          </div>
          
          {/* Scanner Line */}
          {!scanned && (
            <motion.div 
              className="absolute left-0 right-0 h-1 bg-[#00FFC6] shadow-[0_0_10px_#00FFC6]"
              style={{ top: `${scanPos}%` }}
            />
          )}
        </div>

        {/* Results */}
        <div className="space-y-3">
          <ResultRow icon={<Activity className="w-5 h-5" />} text="Actividad" status={scanned ? "Verificada" : "Analizando..."} delay={0} scanned={scanned} />
          <ResultRow icon={<ShieldAlert className="w-5 h-5" />} text="Riesgo" status={scanned ? "Bajo" : "Analizando..."} delay={0.2} scanned={scanned} highlight={true} />
          <ResultRow icon={<Lock className="w-5 h-5" />} text="Seguridad" status={scanned ? "Alta" : "Analizando..."} delay={0.4} scanned={scanned} />
        </div>
      </motion.div>
    </motion.div>
  );
}

function ResultRow({ icon, text, status, delay, scanned, highlight = false }: any) {
  return (
    <motion.div 
      className="flex items-center justify-between bg-gray-900/50 p-3 rounded-lg"
      animate={{ 
        backgroundColor: scanned ? (highlight ? 'rgba(0, 220, 160, 0.1)' : 'rgba(26, 31, 46, 0.8)') : 'rgba(17, 24, 39, 0.5)' 
      }}
      transition={{ duration: 0.5, delay: scanned ? delay : 0 }}
    >
      <div className="flex items-center gap-3 text-gray-300">
        <div className={scanned && highlight ? "text-[#00DCA0]" : "text-gray-400"}>
          {icon}
        </div>
        <span className="font-display font-medium">{text}</span>
      </div>
      <span className={`font-display font-bold ${scanned ? (highlight ? 'text-[#00DCA0]' : 'text-white') : 'text-gray-500 animate-pulse'}`}>
        {status}
      </span>
    </motion.div>
  );
}

// Scene 4: Benefits
function Scene4() {
  const benefits = [
    "Evita estafas",
    "Verifica antes de recibir",
    "Rápido y fácil"
  ];

  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center p-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, x: -100 }}
      transition={{ duration: 0.8 }}
    >
      <div className="w-full max-w-sm space-y-8">
        {benefits.map((text, i) => (
          <motion.div
            key={i}
            className="flex items-center gap-6 bg-gradient-to-r from-[#00FFC6]/20 to-transparent p-6 rounded-2xl border-l-4 border-[#00FFC6]"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.8 + 0.3, type: "spring", stiffness: 100, damping: 15 }}
          >
            <motion.div
              initial={{ scale: 0, rotate: -90 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: i * 0.8 + 0.6, type: "spring" }}
            >
              <CheckCircle2 className="w-10 h-10 text-[#00FFC6] drop-shadow-[0_0_10px_rgba(0,255,198,0.5)]" />
            </motion.div>
            <span className="font-display text-2xl font-bold text-white">
              {text}
            </span>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

// Scene 5: Branding
function Scene5() {
  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center p-8 bg-[#0B0F14]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1 }}
    >
      <motion.div
        className="flex flex-col items-center"
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 150, damping: 20, delay: 0.2 }}
      >
        <motion.div
          className="relative w-48 h-48 mb-8 flex items-center justify-center"
          animate={{ 
            boxShadow: ['0 0 0px rgba(0,255,198,0)', '0 0 80px rgba(0,255,198,0.4)', '0 0 0px rgba(0,255,198,0)'] 
          }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <img 
            src={logoIcon}
            alt="CoinCash Logo" 
            className="w-40 h-40 object-contain drop-shadow-[0_0_20px_rgba(0,255,198,0.6)]"
          />
        </motion.div>
        
        <h1 className="font-display text-6xl md:text-7xl font-extrabold tracking-tight text-white mb-2">
          CoinCash
        </h1>
        
        {/* Placeholder for link - requested by user */}
        <motion.div 
          className="h-32 mt-12 w-full max-w-xs border-2 border-dashed border-gray-700 rounded-xl flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.5 }}
          transition={{ delay: 1.5 }}
        >
          <span className="font-display text-gray-500 text-sm">Espacio para tu enlace</span>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
