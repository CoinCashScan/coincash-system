import { useState, useEffect } from "react";
import {
  Lock, Eye, EyeOff, Timer, Smartphone, ChevronRight, Info, Shield,
  CheckCheck, AlertTriangle, X
} from "lucide-react";
import { toast } from "sonner";
import {
  isPinEnabled, setupPin, verifyPin, removePin,
  isBiometricAvailable, registerBiometric, isBiometricRegistered, removeBiometric
} from "@/lib/security";
import PinSetupModal from "@/components/PinSetupModal";

const BG     = "#0B0F14";
const CARD   = "#121821";
const GREEN  = "#19C37D";
const BLUE   = "#3B82F6";
const PURPLE = "#A78BFA";
const AMBER  = "#F59E0B";
const DANGER = "#FF4D4F";
const BORDER = "rgba(255,255,255,0.06)";
const SHADOW = "0 4px 24px rgba(0,0,0,0.45)";
const SHEET  = "#0f1923";

interface Settings { autoLock: "1"|"5"|"15"|"never"; hideBalance: boolean }
const DEFAULT_S: Settings = { autoLock:"5", hideBalance:false };
const S_KEY = "wg_settings";
function loadS(): Settings { try { return {...DEFAULT_S,...JSON.parse(localStorage.getItem(S_KEY)||"{}")}; } catch { return DEFAULT_S; } }

const AUTO_LOCK_LABELS: Record<Settings["autoLock"],string> = { "1":"1 minuto","5":"5 minutos","15":"15 minutos","never":"Nunca" };

const Toggle = ({ value, onChange }: { value:boolean; onChange:(v:boolean)=>void }) => (
  <button onClick={()=>onChange(!value)}
    className="relative flex h-[26px] w-12 shrink-0 items-center rounded-full transition-all duration-200"
    style={{ background:value?GREEN:"rgba(255,255,255,0.1)" }}>
    <span className="absolute h-[22px] w-[22px] rounded-full bg-white shadow-sm transition-all duration-200"
      style={{ left:value?"calc(100% - 24px)":"2px" }} />
  </button>
);

// ── Disable PIN confirmation sheet ────────────────────────────────────────────
function DisablePinSheet({ onClose, onConfirm }: { onClose:()=>void; onConfirm:()=>void }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState(false);

  const confirm = async () => {
    const ok = await verifyPin(pin);
    if (!ok) { setErr(true); setPin(""); setTimeout(()=>setErr(false),1500); return; }
    onConfirm();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end"
      style={{ background:"rgba(0,0,0,0.8)", backdropFilter:"blur(6px)" }} onClick={onClose}>
      <div className="w-full rounded-t-[20px] p-6 pb-10"
        style={{ background:SHEET, borderTop:`1px solid ${BORDER}` }} onClick={e=>e.stopPropagation()}>
        <div className="flex justify-center mb-4"><div className="h-1 w-10 rounded-full" style={{background:"rgba(255,255,255,0.15)"}}/></div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-white">Desactivar PIN</h2>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full"
            style={{background:"rgba(255,255,255,0.06)"}}><X className="h-4 w-4" style={{color:"rgba(255,255,255,0.4)"}}/></button>
        </div>
        <p className="text-xs mb-4" style={{color:"rgba(255,255,255,0.4)"}}>Ingresa tu PIN actual para confirmar.</p>
        <input type="password" inputMode="numeric" maxLength={6} placeholder="••••••"
          value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,""))}
          className="w-full rounded-2xl px-4 py-3.5 text-center text-2xl font-mono text-white outline-none mb-4 tracking-[0.5em]"
          style={{background:err?`${DANGER}15`:"rgba(255,255,255,0.05)",border:`1px solid ${err?DANGER:BORDER}`}} />
        {err && <p className="text-xs text-center mb-3" style={{color:DANGER}}>PIN incorrecto.</p>}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-2xl py-3.5 text-sm font-medium"
            style={{border:`1px solid ${BORDER}`,color:"rgba(255,255,255,0.5)"}}>Cancelar</button>
          <button onClick={confirm} className="flex-1 rounded-2xl py-3.5 text-sm font-bold"
            style={{background:DANGER,color:"white"}}>Desactivar</button>
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const [s, setS]              = useState<Settings>(loadS);
  const [pinActive, setPinActive]   = useState(isPinEnabled);
  const [bioActive, setBioActive]   = useState(isBiometricRegistered);
  const [bioAvail, setBioAvail]     = useState(false);
  const [showAutoLock, setShowAuto] = useState(false);
  const [pinModal, setPinModal]     = useState<"setup"|"change"|null>(null);
  const [disableModal, setDisable]  = useState(false);

  useEffect(() => { isBiometricAvailable().then(setBioAvail); }, []);
  useEffect(() => { localStorage.setItem(S_KEY, JSON.stringify(s)); }, [s]);

  const setK = <K extends keyof Settings>(k:K, v:Settings[K]) => {
    setS(prev=>({...prev,[k]:v})); toast.success("Configuración guardada.");
  };

  const handlePinToggle = () => {
    if (pinActive) { setDisable(true); return; }
    setPinModal("setup");
  };

  const handleBioToggle = async () => {
    if (bioActive) {
      removeBiometric(); setBioActive(false);
      toast.success("Biometría desactivada.");
      return;
    }
    if (!pinActive) { toast.error("Activa el PIN primero para habilitar la biometría."); return; }
    const ok = await registerBiometric();
    if (ok) { setBioActive(true); toast.success("Biometría registrada correctamente."); }
    else toast.error("No se pudo registrar la biometría. Verifica los permisos del dispositivo.");
  };

  const onPinSetupSuccess = () => {
    setPinModal(null); setPinActive(true); toast.success("PIN activado.");
  };

  const onDisablePin = () => {
    removePin(); removeBiometric();
    setPinActive(false); setBioActive(false);
    setDisable(false); toast.success("PIN desactivado.");
  };

  return (
    <div style={{background:BG,minHeight:"100vh"}} className="flex flex-col pb-24">
      <div className="px-5 pt-10 pb-6">
        <h1 className="text-xl font-bold text-white">Configuración</h1>
        <p className="text-xs mt-0.5" style={{color:"rgba(255,255,255,0.4)"}}>Seguridad y preferencias</p>
      </div>

      {/* ── Security status banner ── */}
      <div className="mx-4 mb-5 rounded-2xl p-4 flex items-center gap-3"
        style={{background:pinActive?`${GREEN}0C`:`${AMBER}0C`,border:`1px solid ${pinActive?GREEN+"25":AMBER+"25"}`}}>
        <Shield className="h-5 w-5 shrink-0" style={{color:pinActive?GREEN:AMBER}}/>
        <div className="flex-1">
          <p className="text-xs font-bold mb-0.5" style={{color:pinActive?GREEN:AMBER}}>
            {pinActive?"App protegida":"Seguridad básica"}
          </p>
          <p className="text-[11px]" style={{color:"rgba(255,255,255,0.5)"}}>
            {pinActive
              ? `PIN activo${bioActive?" · Biometría activa":""} · Claves cifradas con AES-256`
              : "Activa el PIN para cifrar tus claves privadas con AES-256-GCM"}
          </p>
        </div>
        {pinActive && <CheckCheck className="h-4 w-4 shrink-0" style={{color:GREEN}}/>}
      </div>

      {/* Security section */}
      <p className="px-5 text-xs font-semibold mb-3 uppercase tracking-widest" style={{color:"rgba(255,255,255,0.35)"}}>Seguridad</p>
      <div className="mx-4 rounded-2xl overflow-hidden mb-6" style={{background:CARD,border:`1px solid ${BORDER}`,boxShadow:SHADOW}}>

        {/* PIN */}
        <div className="flex items-center gap-3 px-4 py-4 cursor-pointer" style={{borderBottom:`1px solid ${BORDER}`}}
          onClick={handlePinToggle}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{background:`${BLUE}18`}}>
            <Lock className="h-4 w-4" style={{color:BLUE}}/>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">Código PIN</p>
            <p className="text-xs mt-0.5" style={{color:"rgba(255,255,255,0.4)"}}>
              {pinActive?"PIN activo · Toca para cambiar":"Protege la app con un PIN de 4-6 dígitos"}
            </p>
          </div>
          <Toggle value={pinActive} onChange={handlePinToggle}/>
        </div>

        {/* Biometrics */}
        <div className="flex items-center gap-3 px-4 py-4 cursor-pointer" style={{borderBottom:`1px solid ${BORDER}`}}
          onClick={bioAvail?handleBioToggle:()=>toast.error("Biometría no disponible en este dispositivo.")}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{background:`${PURPLE}18`}}>
            <Smartphone className="h-4 w-4" style={{color:PURPLE}}/>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">Face ID / Biometría</p>
            <p className="text-xs mt-0.5" style={{color:"rgba(255,255,255,0.4)"}}>
              {!bioAvail?"No disponible en este dispositivo":bioActive?"Biometría activa":"Requiere PIN activo"}
            </p>
          </div>
          <Toggle value={bioActive} onChange={bioAvail?handleBioToggle:()=>{}}/>
        </div>

        {/* Change PIN (only visible when active) */}
        {pinActive && (
          <div className="flex items-center gap-3 px-4 py-4 cursor-pointer" style={{borderBottom:`1px solid ${BORDER}`}}
            onClick={()=>setPinModal("change")}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{background:"rgba(255,255,255,0.05)"}}>
              <Shield className="h-4 w-4" style={{color:"rgba(255,255,255,0.35)"}}/>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">Cambiar PIN</p>
              <p className="text-xs mt-0.5" style={{color:"rgba(255,255,255,0.4)"}}>Actualiza tu código de acceso</p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0" style={{color:"rgba(255,255,255,0.3)"}}/>
          </div>
        )}

        {/* Auto lock */}
        <div className="flex items-center gap-3 px-4 py-4 cursor-pointer" style={{borderBottom:`1px solid ${BORDER}`}}
          onClick={()=>setShowAuto(true)}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{background:`${AMBER}18`}}>
            <Timer className="h-4 w-4" style={{color:AMBER}}/>
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-white">Bloqueo automático</p>
            <p className="text-xs mt-0.5" style={{color:"rgba(255,255,255,0.4)"}}>{AUTO_LOCK_LABELS[s.autoLock]}</p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0" style={{color:"rgba(255,255,255,0.3)"}}/>
        </div>

        {/* Hide balance */}
        <div className="flex items-center gap-3 px-4 py-4 cursor-pointer"
          onClick={()=>setK("hideBalance",!s.hideBalance)}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{background:`${GREEN}18`}}>
            {s.hideBalance?<EyeOff className="h-4 w-4" style={{color:GREEN}}/>:<Eye className="h-4 w-4" style={{color:GREEN}}/>}
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-white">Ocultar balance</p>
            <p className="text-xs mt-0.5" style={{color:"rgba(255,255,255,0.4)"}}>Enmascara saldos en pantalla</p>
          </div>
          <Toggle value={s.hideBalance} onChange={v=>setK("hideBalance",v)}/>
        </div>
      </div>

      {/* About */}
      <p className="px-5 text-xs font-semibold mb-3 uppercase tracking-widest" style={{color:"rgba(255,255,255,0.35)"}}>Acerca de</p>
      <div className="mx-4 rounded-2xl overflow-hidden mb-6" style={{background:CARD,border:`1px solid ${BORDER}`,boxShadow:SHADOW}}>
        {([
          ["App","CoinCash WalletGuard"],["Versión","1.0.0"],["Red","TRON Mainnet"],
          ["Contrato USDT","TR7NHqjeK…Lj6t"],["Cifrado","AES-256-GCM"],
        ] as [string,string][]).map(([label,val],i,arr)=>(
          <div key={label} className="flex justify-between items-center px-4 py-3.5"
            style={{borderBottom:i<arr.length-1?`1px solid ${BORDER}`:"none"}}>
            <span className="text-sm" style={{color:"rgba(255,255,255,0.5)"}}>{label}</span>
            <span className="text-sm font-semibold text-white">{val}</span>
          </div>
        ))}
      </div>

      {/* Disclaimer */}
      <div className="mx-4 rounded-2xl p-4 flex items-start gap-3 mb-4"
        style={{background:"rgba(59,130,246,0.08)",border:"1px solid rgba(59,130,246,0.2)"}}>
        <Info className="h-4 w-4 mt-0.5 shrink-0" style={{color:BLUE}}/>
        <p className="text-xs leading-relaxed" style={{color:"rgba(255,255,255,0.5)"}}>
          CoinCash WalletGuard realiza análisis de seguridad en tiempo real sobre la red TRON.
          Las claves privadas se almacenan únicamente en tu dispositivo, cifradas con AES-256-GCM.
          Los datos de red provienen de TronGrid API y el contrato oficial de USDT TRC20.
        </p>
      </div>

      {/* Auto lock picker */}
      {showAutoLock && (
        <div className="fixed inset-0 z-50 flex items-end" style={{background:"rgba(0,0,0,0.75)"}}
          onClick={()=>setShowAuto(false)}>
          <div className="w-full rounded-t-3xl p-6 pb-10 space-y-3"
            style={{background:"#141c27",borderTop:`1px solid ${BORDER}`}} onClick={e=>e.stopPropagation()}>
            <div className="mx-auto mb-2 h-1 w-10 rounded-full" style={{background:BORDER}}/>
            <p className="text-base font-bold text-white mb-4">Bloqueo automático</p>
            {(Object.entries(AUTO_LOCK_LABELS) as [Settings["autoLock"],string][]).map(([val,label])=>(
              <button key={val} onClick={()=>{setK("autoLock",val);setShowAuto(false);}}
                className="flex w-full items-center justify-between rounded-2xl px-4 py-3.5"
                style={{background:s.autoLock===val?`${GREEN}15`:"rgba(255,255,255,0.04)",border:`1px solid ${s.autoLock===val?GREEN+"40":BORDER}`}}>
                <span className="text-sm text-white">{label}</span>
                {s.autoLock===val && <span className="h-2 w-2 rounded-full" style={{background:GREEN}}/>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* PIN setup / change modal */}
      {pinModal && (
        <PinSetupModal mode={pinModal} onClose={()=>setPinModal(null)} onSuccess={onPinSetupSuccess}/>
      )}

      {/* Disable PIN confirmation */}
      {disableModal && (
        <DisablePinSheet onClose={()=>setDisable(false)} onConfirm={onDisablePin}/>
      )}
    </div>
  );
}
