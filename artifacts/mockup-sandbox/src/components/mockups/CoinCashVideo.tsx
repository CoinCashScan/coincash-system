import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { 
  ShieldAlert, 
  AlertTriangle, 
  Search, 
  ShieldCheck, 
  Activity, 
  Zap, 
  CheckCircle2,
  ChevronRight,
  Shield,
  Smartphone
} from "lucide-react";
import logoIcon from "../../assets/cc-logo-icon-orig.png";

// Escena 1: 2s
// Escena 2: 3s
// Escena 3: 5s
// Escena 4: 4s
// Escena 5: 4s
// Escena 6: 5s
// Escena 7: 6s
// Escena 8: 4s
const SCENE_DURATIONS = [2000, 3000, 5000, 4000, 4000, 5000, 6000, 4000];

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

  // bg colors
  const bgColors = [
    "#0B0F14", // 1. Hook
    "#1A0A0A", // 2. Problema (Reddish dark)
    "#0B0F14", // 3. Scanner
    "#0B0F14", // 4. Resultado
    "#0B0F14", // 5. Servicios
    "#0B0F14", // 6. Planes
    "#0B0F14", // 7. Pagar
    "#0B0F14", // 8. CTA
  ];

  const accentColors = [
    "#FF4D4F", // 1
    "#FF4D4F", // 2
    "#00FFC6", // 3
    "#FF4D4F", // 4
    "#00FFC6", // 5
    "#F59E0B", // 6
    "#00FFC6", // 7
    "#00FFC6", // 8
  ];

  return (
    <div className="w-full h-screen bg-[#0B0F14] flex items-center justify-center overflow-hidden">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;700&display=swap');
        .font-display { font-family: 'Space Grotesk', sans-serif; }
        .font-body { font-family: 'Inter', sans-serif; }
        .text-glow-green { text-shadow: 0 0 20px rgba(0, 255, 198, 0.6); }
        .text-glow-red { text-shadow: 0 0 20px rgba(255, 77, 79, 0.6); }
        .text-glow-gold { text-shadow: 0 0 20px rgba(245, 158, 11, 0.6); }
        
        .glitch-wrapper { position: relative; }
        .glitch { position: relative; color: white; }
        .glitch::before, .glitch::after {
          content: attr(data-text);
          position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0.8;
        }
        .glitch::before { color: #FF4D4F; z-index: -1; animation: glitch-anim-1 0.4s infinite linear alternate-reverse; }
        .glitch::after { color: #00FFC6; z-index: -2; animation: glitch-anim-2 0.3s infinite linear alternate-reverse; }
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

      {/* 9:16 Container representing Tiktok/Reels */}
      <div 
        className="relative overflow-hidden shadow-2xl bg-[#0B0F14] text-white select-none"
        style={{ 
          width: '100%',
          height: '100%',
          maxWidth: '56.25vh',
          maxHeight: '100vh',
          aspectRatio: '9/16'
        }}
      >
        {/* Background */}
        <motion.div
          className="absolute inset-0 z-0"
          animate={{ backgroundColor: bgColors[currentScene] }}
          transition={{ duration: 0.8 }}
        >
          {/* Animated Tech Grid */}
          <motion.div 
            className="absolute inset-0 opacity-[0.03]" 
            style={{ 
              backgroundImage: 'linear-gradient(rgba(0, 255, 198, 0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 255, 198, 0.5) 1px, transparent 1px)',
              backgroundSize: '40px 40px'
            }}
            animate={{ backgroundPosition: ['0px 0px', '40px 40px'] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
          />
          {/* Noise */}
          <div className="absolute inset-0 opacity-[0.03] mix-blend-overlay pointer-events-none" 
            style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.8%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }}
          ></div>
        </motion.div>

        {/* Global Accent Glow */}
        <motion.div
          className="absolute w-[80vw] h-[80vw] sm:w-[500px] sm:h-[500px] rounded-full blur-[120px] z-0 opacity-20"
          animate={{
            backgroundColor: accentColors[currentScene],
            x: currentScene % 2 === 0 ? '-20%' : '20%',
            y: currentScene % 3 === 0 ? '-20%' : '20%',
            scale: currentScene === 7 ? 1.5 : 1,
          }}
          transition={{ duration: 2, ease: "easeInOut" }}
          style={{ top: '30%', left: '50%', transform: 'translateX(-50%)' }}
        />

        {/* Floating Particles */}
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          {[...Array(10)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-1 rounded-full bg-[#00FFC6] opacity-30"
              initial={{
                x: Math.random() * 400,
                y: Math.random() * 800,
              }}
              animate={{
                y: [null, Math.random() * -800],
                opacity: [0, 0.5, 0],
              }}
              transition={{
                duration: 5 + Math.random() * 5,
                repeat: Infinity,
                ease: "linear",
                delay: Math.random() * 5,
              }}
            />
          ))}
        </div>

        {/* Scenes */}
        <AnimatePresence mode="wait">
          {currentScene === 0 && <Scene1 key="s1" />}
          {currentScene === 1 && <Scene2 key="s2" />}
          {currentScene === 2 && <Scene3 key="s3" />}
          {currentScene === 3 && <Scene4 key="s4" />}
          {currentScene === 4 && <Scene5 key="s5" />}
          {currentScene === 5 && <Scene6 key="s6" />}
          {currentScene === 6 && <Scene7 key="s7" />}
          {currentScene === 7 && <Scene8 key="s8" />}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ESCENA 1: HOOK (2s)
function Scene1() {
  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center p-8 text-center"
      initial={{ opacity: 0, scale: 1.2 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8, filter: "blur(10px)" }}
      transition={{ duration: 0.4 }}
    >
      <motion.div
        animate={{ scale: [1, 1.3, 1], rotate: [0, -10, 10, 0] }}
        transition={{ repeat: Infinity, duration: 0.3 }}
        className="mb-8"
      >
        <ShieldAlert className="w-28 h-28 text-[#FF4D4F] drop-shadow-[0_0_30px_rgba(255,77,79,0.8)]" />
      </motion.div>
      <h1 className="font-display text-5xl md:text-6xl font-bold leading-tight">
        <div className="glitch-wrapper">
          <span className="glitch text-[#FF4D4F] text-glow-red uppercase" data-text="¿Tu wallet">¿Tu wallet</span>
        </div>
        <div className="glitch-wrapper mt-2">
          <span className="glitch text-white uppercase" data-text="es segura?">es segura?</span>
        </div>
      </h1>
    </motion.div>
  );
}

// ESCENA 2: PROBLEMA (3s)
function Scene2() {
  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center p-8 bg-[#FF4D4F]/10"
      initial={{ opacity: 0, x: '100%' }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: '-100%' }}
      transition={{ type: "spring", stiffness: 200, damping: 25 }}
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", delay: 0.2 }}
        className="mb-10 p-6 bg-black/50 border border-[#FF4D4F]/50 rounded-full backdrop-blur-md"
      >
        <AlertTriangle className="w-20 h-20 text-[#FF4D4F]" />
      </motion.div>
      <motion.h2 
        className="font-display text-4xl text-center font-bold leading-snug"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        Puedes perder<br/>
        <span className="text-[#FF4D4F] text-glow-red">tu dinero</span><br/>
        enviando a wallets<br/>en riesgo
      </motion.h2>
    </motion.div>
  );
}

// ESCENA 3: USO DEL SCANNER (5s)
function Scene3() {
  const [scan, setScan] = useState(0);

  useEffect(() => {
    const int = setInterval(() => setScan(p => (p > 100 ? 0 : p + 2)), 30);
    return () => clearInterval(int);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center p-8"
      initial={{ opacity: 0, y: 100 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 1.1 }}
      transition={{ duration: 0.6 }}
    >
      <motion.h2 
        className="font-display text-3xl text-center font-bold mb-12"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        Analiza cualquier<br/>wallet en <span className="text-[#00FFC6] text-glow-green">segundos</span>
      </motion.h2>

      <motion.div 
        className="w-full bg-[#131A22] border border-[#00FFC6]/30 rounded-3xl p-5 shadow-[0_0_40px_rgba(0,255,198,0.15)]"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.5, type: "spring", bounce: 0.4 }}
      >
        <div className="text-sm font-body text-gray-400 mb-2 ml-2">Wallet Address (TRC20)</div>
        
        <div className="bg-black/60 border border-white/10 rounded-xl p-4 mb-6 relative overflow-hidden flex items-center justify-between">
          <div className="font-mono text-sm text-white/80">TNx98vW...kL2p</div>
          <div className="w-6 h-6 rounded-full bg-[#00FFC6]/20 flex items-center justify-center">
            <div className="w-3 h-3 rounded-full bg-[#00FFC6]" />
          </div>
          
          <motion.div 
            className="absolute left-0 right-0 h-10 bg-gradient-to-b from-transparent via-[#00FFC6]/40 to-transparent z-10"
            style={{ top: `${scan}%`, transform: 'translateY(-50%)' }}
          />
          <div className="absolute left-0 right-0 h-[2px] bg-[#00FFC6] shadow-[0_0_15px_#00FFC6] z-10"
            style={{ top: `${scan}%` }}
          />
        </div>

        <motion.div 
          className="w-full bg-[#00FFC6] text-black font-display font-bold py-4 rounded-xl flex items-center justify-center gap-2"
          whileHover={{ scale: 1.05 }}
        >
          <Search className="w-5 h-5" /> Analizar Wallet
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

// ESCENA 4: RESULTADO (4s)
function Scene4() {
  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center p-8 bg-[#FF4D4F]/5"
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, y: -50 }}
      transition={{ duration: 0.5, type: "spring" }}
    >
      <motion.div 
        className="relative mb-8"
        initial={{ rotate: -90 }}
        animate={{ rotate: 0 }}
        transition={{ duration: 1, type: "spring" }}
      >
        <svg className="w-64 h-64 transform -rotate-90">
          <circle cx="128" cy="128" r="110" fill="none" stroke="#331010" strokeWidth="20" />
          <motion.circle 
            cx="128" cy="128" r="110" fill="none" stroke="#FF4D4F" strokeWidth="20" strokeLinecap="round"
            strokeDasharray="691"
            initial={{ strokeDashoffset: 691 }}
            animate={{ strokeDashoffset: 0 }}
            transition={{ duration: 1.5, ease: "easeOut", delay: 0.5 }}
            className="drop-shadow-[0_0_20px_#FF4D4F]"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span 
            className="text-7xl font-display font-bold text-[#FF4D4F] text-glow-red"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 1, type: "spring" }}
          >
            100
          </motion.span>
          <span className="text-xl font-mono text-white/50">/ 100</span>
        </div>
      </motion.div>

      <motion.div
        className="bg-[#FF4D4F]/20 border border-[#FF4D4F] text-[#FF4D4F] px-6 py-2 rounded-full font-display font-bold text-xl uppercase tracking-wider mb-6 flex items-center gap-2"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.5 }}
      >
        <ShieldAlert className="w-5 h-5" /> Riesgo Alto
      </motion.div>

      <motion.h2
        className="font-display text-3xl text-center font-bold leading-tight"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.8 }}
      >
        Detecta wallets<br/>en lista negra
      </motion.h2>
    </motion.div>
  );
}

// ESCENA 5: SERVICIOS (4s)
function Scene5() {
  const cards = [
    { icon: <ShieldCheck className="w-8 h-8 text-[#00FFC6]" />, title: "Escaneo de Seguridad" },
    { icon: <Zap className="w-8 h-8 text-[#F59E0B]" />, title: "Predicción de Congelamiento" },
    { icon: <Shield className="w-8 h-8 text-[#60A5FA]" />, title: "Análisis Antifraude" }
  ];

  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center p-8"
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      transition={{ duration: 0.5 }}
    >
      <motion.h2
        className="font-display text-4xl text-center font-bold mb-12 leading-tight"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        Protege tu dinero<br/>
        <span className="text-[#00FFC6] text-glow-green">antes de enviar</span>
      </motion.h2>

      <div className="w-full space-y-4">
        {cards.map((c, i) => (
          <motion.div
            key={i}
            className="bg-[#131A22] border border-white/10 rounded-2xl p-4 flex items-center gap-4 shadow-lg"
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 + i * 0.2, type: "spring" }}
          >
            <div className="w-14 h-14 rounded-xl bg-black/50 flex items-center justify-center border border-white/5">
              {c.icon}
            </div>
            <div className="font-display font-bold text-lg">{c.title}</div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

// ESCENA 6: PLANES DE PAGO (5s)
function Scene6() {
  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center p-8"
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 1.1 }}
      transition={{ duration: 0.6 }}
    >
      <motion.h2
        className="font-display text-4xl font-bold mb-10 text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        Elige tu plan
      </motion.h2>

      <div className="flex gap-4 w-full h-[400px]">
        {/* Basic Plan */}
        <motion.div
          className="flex-1 bg-[#131A22] border border-[#60A5FA]/30 rounded-[2rem] p-5 flex flex-col relative"
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, type: "spring" }}
        >
          <div className="text-[#60A5FA] font-display font-bold text-lg mb-2">Básico</div>
          <div className="font-display text-3xl font-bold mb-1">$9.99</div>
          <div className="text-white/50 font-body text-sm mb-6">100 análisis</div>
          
          <div className="mt-auto bg-[#60A5FA]/10 text-[#60A5FA] text-center py-3 rounded-xl font-display font-bold text-sm">
            Seleccionar
          </div>
        </motion.div>

        {/* Pro Plan */}
        <motion.div
          className="flex-1 bg-gradient-to-b from-[#1A160A] to-[#131A22] border-2 border-[#F59E0B] rounded-[2rem] p-5 flex flex-col relative shadow-[0_0_30px_rgba(245,158,11,0.2)]"
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, type: "spring" }}
        >
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#F59E0B] text-black font-display font-bold text-xs px-3 py-1 rounded-full whitespace-nowrap">
            MÁS POPULAR
          </div>
          
          <div className="text-[#F59E0B] font-display font-bold text-lg mb-2 text-glow-gold">Pro</div>
          <div className="font-display text-3xl font-bold mb-1 text-white">$19.99</div>
          <div className="text-white/80 font-body text-sm mb-6">250 análisis</div>
          
          <div className="mt-auto bg-[#F59E0B] text-black text-center py-3 rounded-xl font-display font-bold text-sm shadow-[0_0_15px_rgba(245,158,11,0.5)]">
            Seleccionar
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

// ESCENA 7: CÓMO PAGAR (6s)
function Scene7() {
  const steps = [
    "Selecciona tu plan",
    "Envía USDT (TRC20)",
    "Presiona 'Ya pagué'",
    "Verificación automática"
  ];

  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center p-8"
      initial={{ opacity: 0, x: '100%' }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.6 }}
    >
      <motion.h2
        className="font-display text-4xl text-center font-bold mb-12 leading-tight"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        Activa tu plan<br/>
        <span className="text-[#00FFC6] text-glow-green">en minutos</span>
      </motion.h2>

      <div className="w-full relative">
        <div className="absolute left-6 top-6 bottom-6 w-0.5 bg-[#00FFC6]/20" />
        
        {steps.map((text, i) => (
          <motion.div
            key={i}
            className="flex items-center gap-6 mb-8 relative z-10"
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 + i * 0.5, type: "spring" }}
          >
            <div className="w-12 h-12 rounded-full bg-[#131A22] border-2 border-[#00FFC6] flex items-center justify-center font-display font-bold text-[#00FFC6] shadow-[0_0_15px_rgba(0,255,198,0.3)] shrink-0">
              {i + 1}
            </div>
            <div className="font-display text-lg font-medium">{text}</div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

// ESCENA 8: CTA FINAL (4s)
function Scene8() {
  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center p-8 text-center"
      initial={{ opacity: 0, scale: 1.5 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
    >
      <motion.div
        className="relative w-40 h-40 mb-10"
        initial={{ scale: 0, rotate: 180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 100, delay: 0.3 }}
      >
        <motion.div
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="absolute inset-0 bg-[#00FFC6] rounded-full blur-[50px] opacity-40"
        />
        <img 
          src={logoIcon}
          alt="CoinCash" 
          className="relative z-10 w-full h-full object-contain drop-shadow-[0_0_20px_rgba(0,255,198,0.5)]"
        />
      </motion.div>

      <motion.h1 
        className="font-display text-5xl font-bold leading-tight mb-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        Verifica<br/>antes de enviar
      </motion.h1>

      <motion.p
        className="font-body text-xl text-white/70 mb-12"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9 }}
      >
        Evita perder USDT en segundos
      </motion.p>

      <motion.div
        className="bg-[#00FFC6]/10 border border-[#00FFC6] px-8 py-4 rounded-2xl w-full max-w-sm"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2, type: "spring" }}
        whileHover={{ scale: 1.05, backgroundColor: "rgba(0,255,198,0.2)" }}
      >
        <div className="font-display text-[#00FFC6] font-bold text-xl text-glow-green">
          www.hardsoftcomputer.com
        </div>
      </motion.div>
    </motion.div>
  );
}
