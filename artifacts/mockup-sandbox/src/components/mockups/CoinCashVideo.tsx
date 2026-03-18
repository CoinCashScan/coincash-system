import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { Apple, Share, PlusSquare, ShieldCheck, ChevronUp } from "lucide-react";

const SCENE_DURATIONS = [5000, 8000, 10000, 7000];

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

  // Persistent background element
  const bgColors = ["#0B0F14", "#0D141C", "#0B0F14", "#0B0F14"];

  return (
    <div className="w-full h-screen relative overflow-hidden bg-[#0B0F14] text-white flex items-center justify-center font-sans select-none aspect-video">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');
        .font-display { font-family: 'Space Grotesk', sans-serif; }
      `}</style>

      {/* Persistent Background */}
      <motion.div
        className="absolute inset-0 z-0"
        animate={{ backgroundColor: bgColors[currentScene] }}
        transition={{ duration: 2 }}
      >
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 50% 50%, #1a2a4a 0%, transparent 50%)' }} />
        <div className="absolute inset-0 opacity-[0.03] mix-blend-overlay pointer-events-none" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }}></div>
      </motion.div>

      {/* Persistent Accent Glow */}
      <motion.div
        className="absolute w-[40vw] h-[40vw] rounded-full blur-[120px] bg-[#00FFC6]/10 z-0"
        animate={{
          x: currentScene === 0 ? '0vw' : currentScene === 1 ? '-20vw' : currentScene === 2 ? '20vw' : '0vw',
          y: currentScene === 0 ? '0vh' : currentScene === 1 ? '20vh' : currentScene === 2 ? '-10vh' : '0vh',
          scale: currentScene === 3 ? 1.5 : 1,
        }}
        transition={{ duration: 3, ease: "easeInOut" }}
      />

      <AnimatePresence mode="wait">
        {currentScene === 0 && <Scene1 key="scene-1" />}
        {currentScene === 1 && <Scene2 key="scene-2" />}
        {currentScene === 2 && <Scene3 key="scene-3" />}
        {currentScene === 3 && <Scene4 key="scene-4" />}
      </AnimatePresence>
    </div>
  );
}

function Scene1() {
  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: "blur(10px)" }}
      transition={{ duration: 1 }}
    >
      <motion.div
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 1, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="text-center"
      >
        <motion.div 
          className="w-24 h-24 bg-[#1a2a4a] rounded-3xl mx-auto mb-8 flex items-center justify-center border border-[#00FFC6]/30 shadow-[0_0_30px_rgba(0,255,198,0.2)]"
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ duration: 1, delay: 0.2, type: "spring", stiffness: 200, damping: 20 }}
        >
          <ShieldCheck className="w-12 h-12 text-[#00FFC6]" strokeWidth={1.5} />
        </motion.div>
        
        <h1 className="font-display text-5xl md:text-7xl font-bold tracking-tight text-white mb-6">
          Instala <span className="text-[#00FFC6]">CoinCash</span>
        </h1>
        <p className="text-xl md:text-3xl text-gray-400 font-display tracking-wide">
          en tu iPhone en 3 pasos
        </p>
      </motion.div>
    </motion.div>
  );
}

function Scene2() {
  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, x: "-10vw" }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="flex w-full max-w-5xl items-center justify-between px-12">
        <div className="w-1/2 pr-12 text-left">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <div className="inline-block px-4 py-1.5 rounded-full border border-[#00FFC6]/30 bg-[#00FFC6]/10 text-[#00FFC6] font-display text-sm uppercase tracking-widest mb-6">
              Paso 1
            </div>
          </motion.div>
          
          <motion.h2 
            className="font-display text-5xl md:text-6xl font-bold tracking-tight text-white mb-6 leading-tight"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
          >
            Abre <br/><span className="text-[#00FFC6]">hardsoftcomputer.com</span><br/> en Safari
          </motion.h2>
          
          <motion.div
            className="flex items-center space-x-3 text-gray-400 mt-8 bg-white/5 px-6 py-4 rounded-2xl border border-white/10 w-max"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1 }}
          >
            <Apple className="w-6 h-6" />
            <span className="font-display text-lg">Usa Safari — no Chrome</span>
          </motion.div>
        </div>

        <div className="w-1/2 flex justify-center">
          <motion.div
            className="w-[300px] h-[600px] rounded-[3rem] border-8 border-[#1a2a4a] bg-black relative overflow-hidden shadow-2xl"
            initial={{ y: 100, opacity: 0, rotateY: 20 }}
            animate={{ y: 0, opacity: 1, rotateY: 0 }}
            transition={{ duration: 1.2, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            style={{ perspective: 1000 }}
          >
            {/* Safari Top Bar */}
            <div className="absolute top-0 w-full h-16 bg-[#1a2a4a]/80 backdrop-blur-md flex items-end justify-center pb-2 z-20 border-b border-white/10">
              <div className="w-48 h-8 bg-black/50 rounded-lg flex items-center justify-center space-x-2 text-sm text-gray-300">
                <ShieldCheck className="w-4 h-4 text-[#00FFC6]" />
                <span className="font-display">hardsoftcomputer.com</span>
              </div>
            </div>
            
            <div className="mt-24 p-6 text-center">
              <ShieldCheck className="w-16 h-16 text-[#00FFC6] mx-auto mb-4" />
              <div className="h-4 w-32 bg-white/20 rounded mx-auto mb-2" />
              <div className="h-3 w-48 bg-white/10 rounded mx-auto" />
            </div>

            {/* Bottom Nav */}
            <div className="absolute bottom-0 w-full h-24 bg-[#1a2a4a]/80 backdrop-blur-md flex items-start justify-center pt-4 space-x-12 z-20 border-t border-white/10">
              <div className="w-6 h-6 bg-white/20 rounded-full" />
              <motion.div 
                className="relative"
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 2, repeat: Infinity, delay: 2 }}
              >
                <Share className="w-7 h-7 text-[#00FFC6]" />
                <motion.div className="absolute -inset-2 border-2 border-[#00FFC6] rounded-md opacity-0"
                  animate={{ opacity: [0, 1, 0], scale: [0.8, 1.2, 1.4] }}
                  transition={{ duration: 2, repeat: Infinity, delay: 2 }}
                />
              </motion.div>
              <div className="w-6 h-6 bg-white/20 rounded-full" />
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

function Scene3() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setStep(1), 3500);
    const t2 = setTimeout(() => setStep(2), 7000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <motion.div
      className="absolute inset-0 z-10 flex items-center justify-center"
      initial={{ opacity: 0, x: "10vw" }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, filter: "blur(20px)", scale: 1.2 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="flex w-full max-w-6xl items-center justify-center space-x-16">
        
        {/* Left Side: Dynamic Text */}
        <div className="w-[40%] relative h-[200px] flex items-center">
          <AnimatePresence mode="wait">
            {step === 0 && (
              <motion.div key="s1"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="absolute"
              >
                <div className="inline-block px-4 py-1.5 rounded-full border border-[#00FFC6]/30 bg-[#00FFC6]/10 text-[#00FFC6] font-display text-sm uppercase tracking-widest mb-4">Paso 2</div>
                <h3 className="font-display text-4xl font-bold text-white leading-tight">
                  Toca el botón <span className="text-[#00FFC6]">Compartir</span> <ChevronUp className="inline w-8 h-8 text-[#00FFC6]" />
                  <br/>en la barra inferior
                </h3>
              </motion.div>
            )}
            {step === 1 && (
              <motion.div key="s2"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="absolute"
              >
                <div className="inline-block px-4 py-1.5 rounded-full border border-[#00FFC6]/30 bg-[#00FFC6]/10 text-[#00FFC6] font-display text-sm uppercase tracking-widest mb-4">Paso 3</div>
                <h3 className="font-display text-4xl font-bold text-white leading-tight">
                  Selecciona <br/>
                  <span className="text-[#00FFC6]">"Agregar a pantalla de inicio"</span>
                </h3>
              </motion.div>
            )}
            {step === 2 && (
              <motion.div key="s3"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="absolute"
              >
                <div className="inline-block px-4 py-1.5 rounded-full border border-[#00FFC6]/30 bg-[#00FFC6]/10 text-[#00FFC6] font-display text-sm uppercase tracking-widest mb-4">Listo</div>
                <h3 className="font-display text-5xl font-bold text-white leading-tight">
                  ¡Listo! <br/><span className="text-[#00FFC6]">Toca Agregar</span>
                </h3>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right Side: Phone frame with attached image */}
        <div className="w-[45%] flex justify-center perspective-[1200px]">
          <motion.div
            className="w-[320px] h-[650px] rounded-[3rem] border-8 border-[#1a2a4a] bg-black overflow-hidden relative shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
            animate={{
              rotateY: step === 0 ? -10 : step === 1 ? -5 : 0,
              scale: step === 2 ? 1.05 : 1,
            }}
            transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* The attached asset */}
            <img 
              src="/attached_assets/IMG_6330_1773871334992.png" 
              alt="CoinCash Install"
              className="w-full h-full object-cover"
            />
            
            {/* Overlays / Callouts */}
            <AnimatePresence>
              {step === 0 && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute bottom-[20px] left-1/2 -translate-x-1/2 w-16 h-16 border-4 border-[#00FFC6] rounded-xl shadow-[0_0_20px_#00FFC6]"
                />
              )}
              {step === 1 && (
                <motion.div 
                  initial={{ opacity: 0, x: 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className="absolute bottom-[200px] right-[20px] w-[280px] h-[50px] border-4 border-[#00FFC6] rounded-xl shadow-[0_0_20px_#00FFC6] bg-[#00FFC6]/10"
                />
              )}
              {step === 2 && (
                <motion.div 
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="absolute top-[30px] right-[15px] px-3 py-1 border-2 border-[#00FFC6] rounded-lg shadow-[0_0_20px_#00FFC6] bg-[#00FFC6]/20"
                >
                  <span className="text-[#00FFC6] font-bold text-sm">Agregar</span>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

function Scene4() {
  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="text-center w-full max-w-4xl flex flex-col items-center">
        
        {/* App Icon Reveal */}
        <motion.div
          initial={{ y: 100, scale: 0.5, opacity: 0 }}
          animate={{ y: 0, scale: 1, opacity: 1 }}
          transition={{ duration: 1.5, type: "spring", stiffness: 100, damping: 20 }}
          className="relative mb-12"
        >
          <div className="w-32 h-32 bg-[#1a2a4a] rounded-[2rem] flex items-center justify-center border border-white/10 shadow-[0_20px_50px_rgba(0,255,198,0.3)] overflow-hidden">
            <ShieldCheck className="w-16 h-16 text-[#00FFC6]" strokeWidth={1.5} />
            <motion.div 
              className="absolute inset-0 bg-gradient-to-tr from-transparent via-[#00FFC6]/20 to-transparent"
              animate={{ x: ['-100%', '100%'] }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
            />
          </div>
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.5 }}
          className="font-display text-5xl md:text-6xl font-bold tracking-tight text-white mb-6"
        >
          Ya tienes <span className="text-[#00FFC6]">CoinCash</span>
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.8 }}
          className="text-xl md:text-2xl text-gray-400 font-display tracking-widest uppercase"
        >
          Análisis de seguridad TRON <br/> en tiempo real
        </motion.p>
        
      </div>
    </motion.div>
  );
}
