import { useState } from "react";
import { Lock, X, CheckCheck } from "lucide-react";
import { setupPin, removePin } from "@/lib/security";
import { toast } from "sonner";

const GREEN  = "#19C37D";
const DANGER = "#FF4D4F";
const BORDER = "rgba(255,255,255,0.07)";
const SHEET  = "#0f1923";

interface Props {
  mode: "setup" | "change" | "disable";
  onClose: () => void;
  onSuccess: () => void;
}

const NUMPAD = ["1","2","3","4","5","6","7","8","9","","0","⌫"];

export default function PinSetupModal({ mode, onClose, onSuccess }: Props) {
  const [step, setStep]       = useState<"enter" | "confirm">("enter");
  const [pin, setPin]         = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const current = step === "enter" ? pin : confirm;
  const MAX = 6;

  const press = (key: string) => {
    if (key === "⌫") {
      if (step === "enter")   setPin(p => p.slice(0, -1));
      else                    setConfirm(c => c.slice(0, -1));
      return;
    }
    if (!key) return;
    if (step === "enter" && pin.length < MAX)    setPin(p => p + key);
    if (step === "confirm" && confirm.length < MAX) setConfirm(c => c + key);
  };

  const handleNext = async () => {
    if (step === "enter") {
      if (pin.length < 4) { toast.error("El PIN debe tener al menos 4 dígitos."); return; }
      setStep("confirm");
      return;
    }
    if (pin !== confirm) {
      toast.error("Los PINs no coinciden. Intenta de nuevo.");
      setConfirm(""); setStep("enter"); setPin(""); return;
    }
    setLoading(true);
    try {
      await setupPin(pin);
      toast.success("PIN configurado correctamente.");
      onSuccess();
    } catch {
      toast.error("Error al configurar el PIN.");
    } finally { setLoading(false); }
  };

  const title = mode === "setup" ? "Configurar PIN" : mode === "change" ? "Cambiar PIN" : "Verificar PIN";
  const subtitle = step === "enter"
    ? "Elige un PIN de 4–6 dígitos para proteger tu app."
    : "Repite tu PIN para confirmar.";

  return (
    <div className="fixed inset-0 z-[60] flex items-end"
      style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(6px)" }}
      onClick={onClose}>
      <div className="w-full rounded-t-[20px] flex flex-col"
        style={{ background: SHEET, borderTop: `1px solid ${BORDER}`, maxHeight: "90vh", overflowY: "auto" }}
        onClick={e => e.stopPropagation()}>

        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full" style={{ background: "rgba(255,255,255,0.15)" }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-4 pb-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: "#3B82F618" }}>
              <Lock className="h-4 w-4" style={{ color: "#3B82F6" }} />
            </div>
            <h2 className="text-base font-bold text-white">{title}</h2>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full"
            style={{ background: "rgba(255,255,255,0.06)" }}>
            <X className="h-4 w-4" style={{ color: "rgba(255,255,255,0.4)" }} />
          </button>
        </div>

        <p className="px-6 text-xs mb-6" style={{ color: "rgba(255,255,255,0.4)" }}>{subtitle}</p>

        {/* Step indicator */}
        <div className="flex gap-2 px-6 mb-6">
          {["Ingresar","Confirmar"].map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold"
                style={{ background: step === (i===0?"enter":"confirm") ? GREEN : "rgba(255,255,255,0.08)", color: step === (i===0?"enter":"confirm") ? "black" : "rgba(255,255,255,0.3)" }}>
                {i < (step==="confirm"?1:0) ? <CheckCheck className="h-3 w-3" /> : i+1}
              </div>
              <span className="text-[11px]" style={{ color: step === (i===0?"enter":"confirm") ? GREEN : "rgba(255,255,255,0.3)" }}>{label}</span>
              {i === 0 && <span className="mx-1 text-white/20">›</span>}
            </div>
          ))}
        </div>

        {/* PIN dots */}
        <div className="flex justify-center gap-4 mb-8">
          {Array.from({ length: MAX }).map((_, i) => (
            <div key={i} className="h-3 w-3 rounded-full"
              style={{ background: i < current.length ? GREEN : "rgba(255,255,255,0.12)", transition: "background 0.15s" }} />
          ))}
        </div>

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-3 px-10 mb-6">
          {NUMPAD.map((key, i) => (
            <button key={i} onClick={() => press(key)}
              disabled={!key && key !== "0"}
              className="flex h-14 items-center justify-center rounded-2xl text-lg font-semibold transition-opacity active:opacity-50"
              style={{
                background: key === "⌫" ? `${DANGER}18` : key === "" ? "transparent" : "rgba(255,255,255,0.06)",
                color: key === "⌫" ? DANGER : "white",
              }}>
              {key}
            </button>
          ))}
        </div>

        {/* Continue */}
        <div className="px-6 pb-10">
          <button onClick={handleNext} disabled={loading || current.length < 4}
            className="w-full rounded-2xl py-3.5 text-sm font-bold text-black transition-opacity"
            style={{
              background: current.length >= 4 ? GREEN : "rgba(255,255,255,0.1)",
              color: current.length >= 4 ? "black" : "rgba(255,255,255,0.3)",
              boxShadow: current.length >= 4 ? `0 0 20px ${GREEN}40` : "none",
            }}>
            {loading ? "Guardando..." : step === "enter" ? "Continuar" : "Confirmar PIN"}
          </button>
        </div>
      </div>
    </div>
  );
}
