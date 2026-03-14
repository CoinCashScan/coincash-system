import { useState, useEffect } from "react";
import { Fingerprint, Lock } from "lucide-react";
import { verifyPin, authenticateBiometric, isBiometricRegistered } from "@/lib/security";
import { toast } from "sonner";

const GREEN  = "#19C37D";
const DANGER = "#FF4D4F";
const BG     = "#0B0F14";

interface Props { onUnlock: () => void }

const NUMPAD = ["1","2","3","4","5","6","7","8","9","","0","⌫"];

export default function PinLockScreen({ onUnlock }: Props) {
  const [pin, setPin]         = useState("");
  const [shake, setShake]     = useState(false);
  const [hasBio, setHasBio]   = useState(false);
  const MAX = 6;

  useEffect(() => { setHasBio(isBiometricRegistered()); }, []);

  const press = (key: string) => {
    if (key === "⌫") { setPin(p => p.slice(0, -1)); return; }
    if (!key) return;
    if (pin.length < MAX) setPin(p => p + key);
  };

  const tryUnlock = async (p: string) => {
    const ok = await verifyPin(p);
    if (ok) { onUnlock(); return; }
    setShake(true);
    setPin("");
    setTimeout(() => setShake(false), 500);
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
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-start pt-20 pb-10"
      style={{ background: BG }}>

      {/* Logo area */}
      <div className="flex h-16 w-16 items-center justify-center rounded-full mb-6"
        style={{ background: "#121821", border: "1px solid rgba(255,255,255,0.08)" }}>
        <Lock className="h-7 w-7" style={{ color: GREEN }} />
      </div>
      <h1 className="text-xl font-bold text-white mb-1">CoinCash WalletGuard</h1>
      <p className="text-xs mb-10" style={{ color: "rgba(255,255,255,0.4)" }}>Ingresa tu PIN para continuar</p>

      {/* PIN dots */}
      <div className={`flex gap-4 mb-10 ${shake ? "animate-bounce" : ""}`}>
        {Array.from({ length: MAX }).map((_, i) => (
          <div key={i} className="h-3 w-3 rounded-full"
            style={{
              background: i < pin.length ? GREEN : "rgba(255,255,255,0.12)",
              boxShadow: i < pin.length ? `0 0 8px ${GREEN}80` : "none",
              transition: "all 0.15s",
            }} />
        ))}
      </div>

      {/* Numpad */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-xs px-6 mb-6">
        {NUMPAD.map((key, i) => (
          <button key={i} onClick={() => press(key)}
            disabled={!key && key !== "0"}
            className="flex h-16 items-center justify-center rounded-2xl text-xl font-semibold transition-all active:scale-95"
            style={{
              background: key === "⌫" ? `${DANGER}18` : key === "" ? "transparent" : "rgba(255,255,255,0.06)",
              color: key === "⌫" ? DANGER : "white",
              border: key === "" ? "none" : "1px solid rgba(255,255,255,0.05)",
            }}>
            {key}
          </button>
        ))}
      </div>

      {/* Biometric button */}
      {hasBio && (
        <button onClick={tryBiometric}
          className="flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium"
          style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" }}>
          <Fingerprint className="h-4 w-4" style={{ color: GREEN }} />
          Usar Face ID / Biometría
        </button>
      )}
    </div>
  );
}
