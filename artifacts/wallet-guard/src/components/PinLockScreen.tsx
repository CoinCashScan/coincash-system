import { useState, useEffect } from "react";
import { Fingerprint } from "lucide-react";
import { verifyPin, authenticateBiometric, isBiometricRegistered } from "@/lib/security";
import { toast } from "sonner";

const GREEN  = "#19C37D";
const DANGER = "#FF4D4F";
const BG     = "#0B0F14";

interface Props { onUnlock: () => void }

const NUMPAD = ["1","2","3","4","5","6","7","8","9","⌫","0","→"];

export default function PinLockScreen({ onUnlock }: Props) {
  const [pin, setPin]       = useState("");
  const [shake, setShake]   = useState(false);
  const [hasBio, setHasBio] = useState(false);
  const MAX = 6;

  useEffect(() => { setHasBio(isBiometricRegistered()); }, []);

  const press = (key: string) => {
    if (key === "⌫") { setPin(p => p.slice(0, -1)); return; }
    if (key === "→") { if (pin.length >= 4) tryUnlock(pin); return; }
    if (pin.length < MAX) setPin(p => p + key);
  };

  const tryUnlock = async (p: string) => {
    if (p.length < 4) return;
    const ok = await verifyPin(p);
    if (ok) { onUnlock(); return; }
    setShake(true);
    setPin("");
    setTimeout(() => setShake(false), 600);
    toast.error("PIN incorrecto.");
  };

  useEffect(() => {
    if (pin.length === MAX) tryUnlock(pin);
  }, [pin]);

  const tryBiometric = async () => {
    const ok = await authenticateBiometric();
    if (ok) { onUnlock(); return; }
    toast.error("Autenticación biométrica fallida.");
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-between"
      style={{ background: BG, paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      {/* ── Top section: logo + subtitle ── */}
      <div className="flex flex-col items-center pt-16 pb-2">
        {/* CoinCash logo */}
        <img
          src={`${import.meta.env.BASE_URL}coincash-logo.png`}
          alt="CoinCash"
          draggable={false}
          style={{ width: 180, height: "auto", userSelect: "none" }}
        />

        {/* Subtitle */}
        <p
          className="mt-5 text-sm font-medium tracking-wide"
          style={{ color: "rgba(255,255,255,0.45)" }}
        >
          Ingresa tu PIN para continuar
        </p>
      </div>

      {/* ── Middle section: dots ── */}
      <div className="flex flex-col items-center gap-3">
        <div
          className={`flex gap-5 transition-all duration-100 ${shake ? "animate-[shake_0.5s_ease-in-out]" : ""}`}
          style={shake ? { transform: "translateX(0)", animation: "shake 0.5s ease-in-out" } : {}}
        >
          {Array.from({ length: MAX }).map((_, i) => (
            <div
              key={i}
              style={{
                width: 13,
                height: 13,
                borderRadius: "50%",
                background: i < pin.length ? GREEN : "rgba(255,255,255,0.14)",
                boxShadow: i < pin.length ? `0 0 10px ${GREEN}90` : "none",
                transition: "background 0.15s, box-shadow 0.15s",
                transform: i < pin.length ? "scale(1.1)" : "scale(1)",
              }}
            />
          ))}
        </div>
      </div>

      {/* ── Bottom section: numpad + bio ── */}
      <div className="flex flex-col items-center w-full pb-10 px-6" style={{ maxWidth: 360 }}>
        {/* Numpad */}
        <div className="grid grid-cols-3 gap-3 w-full mb-5">
          {NUMPAD.map((key, i) => (
            <button
              key={i}
              onClick={() => press(key)}
              className="flex h-[68px] items-center justify-center rounded-[22px] text-[22px] font-semibold transition-all active:scale-95"
              style={{
                background:
                  key === "⌫" ? `${DANGER}18`
                  : key === "→" ? (pin.length >= 4 ? `${GREEN}22` : "rgba(255,255,255,0.03)")
                  : "rgba(255,255,255,0.065)",
                color:
                  key === "⌫" ? DANGER
                  : key === "→" ? (pin.length >= 4 ? GREEN : "rgba(255,255,255,0.2)")
                  : "rgba(255,255,255,0.92)",
                border:
                  key === "→" ? `1px solid ${pin.length >= 4 ? GREEN + "55" : "rgba(255,255,255,0.04)"}`
                  : key === "⌫" ? `1px solid ${DANGER}22`
                  : "1px solid rgba(255,255,255,0.06)",
                boxShadow: key === "→" && pin.length >= 4 ? `0 0 14px ${GREEN}30` : "none",
                fontSize: key === "→" ? 20 : undefined,
                letterSpacing: "0.01em",
              }}
            >
              {key}
            </button>
          ))}
        </div>

        {/* Biometric button */}
        {hasBio ? (
          <button
            onClick={tryBiometric}
            className="flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium transition-opacity active:opacity-70"
            style={{
              background: "rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.65)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <Fingerprint className="h-4 w-4" style={{ color: GREEN }} />
            Usar Face ID / Biometría
          </button>
        ) : (
          /* Empty spacer so layout stays stable when no biometric */
          <div style={{ height: 44 }} />
        )}
      </div>

      {/* Shake keyframe */}
      <style>{`
        @keyframes shake {
          0%,100% { transform: translateX(0); }
          20%      { transform: translateX(-10px); }
          40%      { transform: translateX(10px); }
          60%      { transform: translateX(-6px); }
          80%      { transform: translateX(6px); }
        }
      `}</style>
    </div>
  );
}
