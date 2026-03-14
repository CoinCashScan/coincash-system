import { useState, useEffect } from "react";
import { Plus, Eye, Download, Trash2, ScanSearch, Copy, CheckCheck, Wallet, Key, AlertTriangle, Sparkles, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { generateTronWallet, type TronWallet } from "@/lib/tronWallet";

export interface SavedWallet {
  id: string;
  name: string;
  address: string;
  type: "watch" | "imported" | "created";
  addedAt: number;
}

const STORAGE_KEY = "wg_wallets";

const BG     = "#0B0F14";
const CARD   = "#121821";
const GREEN  = "#19C37D";
const BLUE   = "#3B82F6";
const PURPLE = "#A78BFA";
const DANGER = "#FF4D4F";
const BORDER = "rgba(255,255,255,0.06)";
const SHADOW = "0 4px 24px rgba(0,0,0,0.45)";
const SHEET  = "#0f1923";

function loadWallets(): SavedWallet[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
}
function saveWallets(wallets: SavedWallet[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(wallets));
}


interface WalletsPageProps {
  onScan: (address: string) => void;
}

type ModalType = "watch" | "import" | "create" | null;


const avatarBg = (type: SavedWallet["type"]) => {
  if (type === "created") return PURPLE;
  if (type === "imported") return BLUE;
  return GREEN;
};

const typeBadge = (type: SavedWallet["type"]) => {
  if (type === "created") return { label: "Creada", color: PURPLE };
  if (type === "imported") return { label: "Importada", color: BLUE };
  return { label: "Watch", color: GREEN };
};

const WalletsPage = ({ onScan }: WalletsPageProps) => {
  const [wallets, setWallets]         = useState<SavedWallet[]>(loadWallets);
  const [modal, setModal]             = useState<ModalType>(null);
  const [name, setName]               = useState("");
  const [address, setAddress]         = useState("");
  const [copied, setCopied]           = useState<string | null>(null);
  const [generated, setGenerated]     = useState<TronWallet | null>(null);
  const [keyVisible, setKeyVisible]   = useState(false);
  const [savedGen, setSavedGen]       = useState(false);

  useEffect(() => { saveWallets(wallets); }, [wallets]);

  const closeModal = () => {
    setModal(null); setName(""); setAddress("");
    setGenerated(null); setKeyVisible(false); setSavedGen(false);
  };

  const isValidTron = (a: string) => /^T[A-Za-z0-9]{33}$/.test(a.trim());

  const addWallet = (type: "watch" | "imported") => {
    const trimAddr = address.trim();
    const trimName = name.trim() || `Wallet ${wallets.length + 1}`;
    if (!isValidTron(trimAddr)) { toast.error("Dirección TRON inválida."); return; }
    if (wallets.find(w => w.address === trimAddr)) { toast.error("Esta dirección ya está guardada."); return; }
    setWallets(prev => [{ id: crypto.randomUUID(), name: trimName, address: trimAddr, type, addedAt: Date.now() }, ...prev]);
    closeModal();
    toast.success(`Wallet "${trimName}" añadida.`);
  };

  const openCreate = async () => {
    const wallet = await generateTronWallet();
    setGenerated(wallet);
    setModal("create");
    setSavedGen(false);
    setKeyVisible(false);
  };

  const saveGenerated = () => {
    if (!generated) return;
    const trimName = name.trim() || `Mi Wallet ${wallets.length + 1}`;
    setWallets(prev => [{ id: crypto.randomUUID(), name: trimName, address: generated.address, type: "created", addedAt: Date.now() }, ...prev]);
    closeModal();
    toast.success(`Wallet "${trimName}" guardada.`);
  };

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 1500);
    toast.success(`${label} copiado.`);
  };

  const short = (addr: string) => `${addr.slice(0, 10)}…${addr.slice(-6)}`;

  const remove = (id: string) => { setWallets(prev => prev.filter(w => w.id !== id)); toast.success("Wallet eliminada."); };

  return (
    <div style={{ background: BG, minHeight: "100vh" }} className="flex flex-col pb-28">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 pt-11 pb-5">
        <div>
          <h1 className="text-xl font-bold text-white">Wallets</h1>
          <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
            {wallets.length} dirección{wallets.length !== 1 ? "es" : ""} guardada{wallets.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button onClick={() => setModal("watch")}
          className="flex h-9 w-9 items-center justify-center rounded-full"
          style={{ background: GREEN, boxShadow: `0 0 16px ${GREEN}44` }}>
          <Plus className="h-4 w-4 text-black" />
        </button>
      </div>

      {/* ── Action buttons ── */}
      <div className="px-4 grid grid-cols-3 gap-3 mb-6">
        {[
          { label: "Watch",         icon: Eye,       color: GREEN,  action: () => setModal("watch") },
          { label: "Importar",      icon: Download,  color: BLUE,   action: () => setModal("import") },
          { label: "Crear Wallet",  icon: Sparkles,  color: PURPLE, action: openCreate },
        ].map(({ label, icon: Icon, color, action }) => (
          <button key={label} onClick={action}
            className="flex flex-col items-center gap-2.5 rounded-2xl py-5 px-2 transition-opacity active:opacity-70"
            style={{ background: CARD, border: `1px solid ${BORDER}`, boxShadow: SHADOW }}>
            <div className="flex h-11 w-11 items-center justify-center rounded-full" style={{ background: `${color}18` }}>
              <Icon className="h-5 w-5" style={{ color }} />
            </div>
            <span className="text-[11px] font-medium text-white text-center leading-tight">{label}</span>
          </button>
        ))}
      </div>

      {/* ── Wallet list ── */}
      {wallets.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center px-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-full"
            style={{ background: CARD, border: `1px solid ${BORDER}` }}>
            <Wallet className="h-7 w-7" style={{ color: "rgba(255,255,255,0.2)" }} />
          </div>
          <p className="text-sm font-semibold text-white">Sin wallets guardadas</p>
          <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.35)" }}>
            Añade una dirección TRON o genera una nueva wallet para monitorear tu seguridad
          </p>
          <div className="flex gap-2 mt-2">
            <button onClick={() => setModal("watch")}
              className="rounded-full px-5 py-2.5 text-sm font-semibold"
              style={{ background: `${GREEN}18`, color: GREEN, border: `1px solid ${GREEN}30` }}>
              + Watch
            </button>
            <button onClick={openCreate}
              className="rounded-full px-5 py-2.5 text-sm font-semibold text-black"
              style={{ background: GREEN }}>
              Crear Wallet
            </button>
          </div>
        </div>
      ) : (
        <div className="mx-4 rounded-2xl overflow-hidden"
          style={{ background: CARD, border: `1px solid ${BORDER}`, boxShadow: SHADOW }}>
          {wallets.map((w, i) => {
            const badge = typeBadge(w.type);
            const color = avatarBg(w.type);
            return (
              <div key={w.id} className="flex items-center gap-3 px-4 py-4"
                style={{ borderBottom: i < wallets.length - 1 ? `1px solid ${BORDER}` : "none" }}>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                  style={{ background: `${color}22`, color }}>
                  {w.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-semibold text-white truncate max-w-[120px]">{w.name}</span>
                    <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase"
                      style={{ background: `${badge.color}20`, color: badge.color }}>
                      {badge.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[11px] font-mono truncate" style={{ color: "rgba(255,255,255,0.38)" }}>{short(w.address)}</span>
                    <button onClick={() => copyText(w.address, "Dirección")}>
                      {copied === w.address
                        ? <CheckCheck className="h-3 w-3" style={{ color: GREEN }} />
                        : <Copy className="h-3 w-3" style={{ color: "rgba(255,255,255,0.25)" }} />}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => onScan(w.address)}
                    className="flex h-8 w-8 items-center justify-center rounded-xl active:opacity-60"
                    style={{ background: `${GREEN}18` }}>
                    <ScanSearch className="h-4 w-4" style={{ color: GREEN }} />
                  </button>
                  <button onClick={() => remove(w.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-xl active:opacity-60"
                    style={{ background: `${DANGER}15` }}>
                    <Trash2 className="h-4 w-4" style={{ color: DANGER }} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ══════════════════════════════════════════════
          BOTTOM SHEET — Watch / Import
      ══════════════════════════════════════════════ */}
      {(modal === "watch" || modal === "import") && (
        <div className="fixed inset-0 z-50 flex items-end"
          style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)" }}
          onClick={closeModal}>
          <div
            className="w-full flex flex-col"
            style={{
              height: "80vh",
              background: SHEET,
              borderRadius: "20px 20px 0 0",
              borderTop: `1px solid ${BORDER}`,
              overflowY: "auto",
            }}
            onClick={e => e.stopPropagation()}>

            {/* drag handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="h-1 w-10 rounded-full" style={{ background: "rgba(255,255,255,0.15)" }} />
            </div>

            <div className="px-6 py-4 flex-1">
              <h2 className="text-lg font-bold text-white mb-1">
                {modal === "watch" ? "Watch Wallet" : "Importar Wallet"}
              </h2>
              <p className="text-xs mb-6" style={{ color: "rgba(255,255,255,0.4)" }}>
                {modal === "watch"
                  ? "Monitorea cualquier dirección TRON sin importar claves privadas. Solo lectura."
                  : "Añade la dirección pública de tu wallet para análisis de seguridad."}
              </p>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium mb-1.5 block" style={{ color: "rgba(255,255,255,0.5)" }}>Nombre (opcional)</label>
                  <input type="text" placeholder="Mi Wallet"
                    value={name} onChange={e => setName(e.target.value)}
                    className="w-full rounded-2xl px-4 py-3.5 text-sm text-white outline-none"
                    style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}` }} />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1.5 block" style={{ color: "rgba(255,255,255,0.5)" }}>Dirección TRON</label>
                  <input type="text" placeholder="T..."
                    value={address} onChange={e => setAddress(e.target.value)}
                    className="w-full rounded-2xl px-4 py-3.5 text-sm text-white outline-none font-mono"
                    style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}` }} />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button onClick={closeModal}
                  className="flex-1 rounded-2xl py-3.5 text-sm font-medium"
                  style={{ border: `1px solid ${BORDER}`, color: "rgba(255,255,255,0.5)" }}>
                  Cancelar
                </button>
                <button onClick={() => addWallet(modal === "import" ? "imported" : "watch")}
                  className="flex-1 rounded-2xl py-3.5 text-sm font-bold text-black"
                  style={{ background: GREEN, boxShadow: `0 0 20px ${GREEN}40` }}>
                  Añadir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          BOTTOM SHEET — Create Wallet
      ══════════════════════════════════════════════ */}
      {modal === "create" && generated && (
        <div className="fixed inset-0 z-50 flex items-end"
          style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)" }}
          onClick={closeModal}>
          <div
            className="w-full flex flex-col"
            style={{
              height: "80vh",
              background: SHEET,
              borderRadius: "20px 20px 0 0",
              borderTop: `1px solid ${BORDER}`,
              overflowY: "auto",
            }}
            onClick={e => e.stopPropagation()}>

            {/* drag handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="h-1 w-10 rounded-full" style={{ background: "rgba(255,255,255,0.15)" }} />
            </div>

            <div className="px-6 py-4">
              {/* Title */}
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="h-4 w-4" style={{ color: PURPLE }} />
                <h2 className="text-lg font-bold text-white">Nueva Wallet TRON</h2>
              </div>
              <p className="text-xs mb-5" style={{ color: "rgba(255,255,255,0.4)" }}>
                Wallet generada localmente en tu dispositivo. Nunca se transmite a ningún servidor.
              </p>

              {/* ⚠ Backup warning */}
              <div className="rounded-2xl p-4 mb-5 flex gap-3"
                style={{ background: `${DANGER}10`, border: `1px solid ${DANGER}35` }}>
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: DANGER }} />
                <div>
                  <p className="text-xs font-bold mb-1" style={{ color: DANGER }}>Guarda tu clave privada</p>
                  <p className="text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
                    Si pierdes tu clave privada perderás acceso permanente a tus fondos. Guárdala offline, nunca la compartas.
                  </p>
                </div>
              </div>

              {/* Wallet name */}
              <div className="mb-4">
                <label className="text-xs font-medium mb-1.5 block" style={{ color: "rgba(255,255,255,0.5)" }}>Nombre de la wallet</label>
                <input type="text" placeholder={`Mi Wallet ${wallets.length + 1}`}
                  value={name} onChange={e => setName(e.target.value)}
                  className="w-full rounded-2xl px-4 py-3.5 text-sm text-white outline-none"
                  style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}` }} />
              </div>

              {/* Address */}
              <div className="rounded-2xl p-4 mb-3"
                style={{ background: `${GREEN}0C`, border: `1px solid ${GREEN}25` }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-3.5 w-3.5" style={{ color: GREEN }} />
                    <span className="text-xs font-semibold" style={{ color: GREEN }}>Dirección pública</span>
                  </div>
                  <button onClick={() => copyText(generated.address, "Dirección")}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium"
                    style={{ background: `${GREEN}18`, color: GREEN }}>
                    {copied === generated.address ? <CheckCheck className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    Copiar
                  </button>
                </div>
                <p className="text-xs font-mono break-all" style={{ color: "rgba(255,255,255,0.8)" }}>
                  {generated.address}
                </p>
              </div>

              {/* Private key */}
              <div className="rounded-2xl p-4 mb-5"
                style={{ background: `${DANGER}0A`, border: `1px solid ${DANGER}30` }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Key className="h-3.5 w-3.5" style={{ color: DANGER }} />
                    <span className="text-xs font-semibold" style={{ color: DANGER }}>Clave privada</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setKeyVisible(v => !v)}
                      className="text-[10px] font-medium rounded-lg px-2 py-1"
                      style={{ background: `${DANGER}18`, color: DANGER }}>
                      {keyVisible ? "Ocultar" : "Mostrar"}
                    </button>
                    <button onClick={() => copyText(generated.privateKey, "Clave privada")}
                      className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium"
                      style={{ background: `${DANGER}18`, color: DANGER }}>
                      {copied === generated.privateKey ? <CheckCheck className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      Copiar
                    </button>
                  </div>
                </div>
                <p className="text-xs font-mono break-all"
                  style={{ color: "rgba(255,255,255,0.7)", filter: keyVisible ? "none" : "blur(5px)", userSelect: keyVisible ? "text" : "none", transition: "filter 0.2s" }}>
                  {generated.privateKey}
                </p>
              </div>

              {/* Confirm + Save */}
              <label className="flex items-start gap-3 mb-5 cursor-pointer" onClick={() => setSavedGen(v => !v)}>
                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
                  style={{ background: savedGen ? GREEN : "rgba(255,255,255,0.07)", border: `1px solid ${savedGen ? GREEN : BORDER}` }}>
                  {savedGen && <CheckCheck className="h-3 w-3 text-black" />}
                </div>
                <span className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>
                  He guardado mi clave privada de forma segura y entiendo que no podré recuperarla si la pierdo.
                </span>
              </label>

              <div className="flex gap-3">
                <button onClick={closeModal}
                  className="flex-1 rounded-2xl py-3.5 text-sm font-medium"
                  style={{ border: `1px solid ${BORDER}`, color: "rgba(255,255,255,0.5)" }}>
                  Cancelar
                </button>
                <button onClick={saveGenerated} disabled={!savedGen}
                  className="flex-1 rounded-2xl py-3.5 text-sm font-bold text-black transition-opacity"
                  style={{ background: savedGen ? GREEN : "rgba(255,255,255,0.1)", color: savedGen ? "black" : "rgba(255,255,255,0.3)", boxShadow: savedGen ? `0 0 20px ${GREEN}40` : "none" }}>
                  Guardar Wallet
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WalletsPage;
