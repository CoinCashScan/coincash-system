import { useState, useEffect, useRef } from "react";
import html2canvas from "html2canvas";
import QRCode from "qrcode";
import { API_BASE } from "@/lib/apiConfig";
import { getDeviceId } from "@/lib/identity";
import { ScanSearch, Loader2, QrCode, X, CheckCircle2, AlertTriangle, ShieldAlert,
         Copy, Check, CheckCheck, Activity, Zap, Hash, Shield } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import TronAnalysisReport from "@/components/TronAnalysisReport";
import ScanningAnimation from "@/components/ScanningAnimation";
import QRScannerDialog from "@/components/QRScannerDialog";
import { toast } from "sonner";
import { useFreemium } from "@/context/FreemiumContext";

const GREEN  = "#19C37D";
const AMBER  = "#F59E0B";
const ORANGE = "#FF6B35";
const DANGER = "#FF4D4F";
const BLUE   = "#3B82F6";
const CARD   = "#121821";
const BORDER = "rgba(255,255,255,0.07)";

// ── Compute risk score from report data (mirrors TronAnalysisReport logic) ──────
function computeRiskScore(d: ReportData): number {
  const daysSinceCreation = (Date.now() - d.dateCreated) / 86_400_000;
  let score = 0;
  if (daysSinceCreation < 30)        score += 20;
  else if (daysSinceCreation <= 180) score += 10;
  const totalVolumeUSDT = d.totalInUSDT + d.totalOutUSDT;
  if (totalVolumeUSDT > 1_000_000)      score += 25;
  else if (totalVolumeUSDT > 100_000)   score += 15;
  if (d.uniqueWalletsCount > 200)       score += 20;
  else if (d.uniqueWalletsCount > 50)   score += 10;
  if (d.totalTx > 500)                  score += 20;
  else if (d.totalTx > 100)            score += 10;
  if (d.transfersAnalyzed > 0 && d.exchangeInteractions > d.transfersAnalyzed * 0.5) score -= 10;
  if (d.suspiciousInteractions >= 5)    score += 40;
  else if (d.suspiciousInteractions >= 2) score += 25;
  else if (d.suspiciousInteractions >= 1) score += 15;
  score = Math.max(0, Math.min(100, score));
  if (d.isFrozen) score = 100;
  return score;
}

function getScoreCardConfig(score: number, isLatente = false): { label: string; color: string; bg: string } {
  if (score >= 80) return { label: "Riesgo severo",    color: DANGER,  bg: "linear-gradient(135deg,#200808 0%,#120404 100%)" };
  if (score >= 60) return { label: "Riesgo detectado", color: ORANGE,  bg: "linear-gradient(135deg,#1E0E04 0%,#120804 100%)" };
  if (isLatente)   return { label: "Riesgo latente",   color: AMBER,   bg: "linear-gradient(135deg,#1A1000 0%,#0F0A00 100%)" };
  if (score >= 30) return { label: "Riesgo moderado",  color: AMBER,   bg: "linear-gradient(135deg,#1A1000 0%,#0F0A00 100%)" };
  return             { label: "Bajo riesgo",           color: GREEN,   bg: "linear-gradient(135deg,#001A0E 0%,#000F08 100%)" };
}

function getRiskStatusConfig(score: number, isLatente = false): { msg: string; color: string; Icon: React.ElementType } {
  if (score >= 80) return { msg: "Riesgo severo detectado",           color: DANGER,  Icon: ShieldAlert  };
  if (score >= 60) return { msg: "Riesgos detectados",                color: ORANGE,  Icon: ShieldAlert  };
  if (isLatente)   return { msg: "Riesgo latente detectado",          color: AMBER,   Icon: AlertTriangle };
  if (score >= 30) return { msg: "Actividad moderada detectada",      color: AMBER,   Icon: AlertTriangle };
  return             { msg: "Patrones de riesgo potencial detectados", color: GREEN,   Icon: CheckCircle2 };
}

// ── Predicción de riesgo de congelamiento ────────────────────────────────────
interface CongelamientoInput {
  walletAgeDays: number;
  totalVolume: number;
  txCount: number;
  exchangeInteraction: number;
  isLinkedToRiskWallet: boolean;
}
interface CongelamientoResult {
  score: number;
  nivel: "ALTO" | "MEDIO" | "LATENTE" | "BAJO";
  motivos: string[];
}
function calcularRiesgoCongelamiento(data: Partial<CongelamientoInput>): CongelamientoResult {
  const walletAgeDays        = data.walletAgeDays        ?? 0;
  const totalVolume          = data.totalVolume          ?? 0;
  const txCount              = data.txCount              ?? 0;
  const exchangeInteraction  = data.exchangeInteraction  ?? 0;
  const isLinkedToRiskWallet = data.isLinkedToRiskWallet ?? false;

  let score = 0;
  const motivos: string[] = [];

  const esReciente      = walletAgeDays > 0 && walletAgeDays < 30;
  const esAltoVolumen   = totalVolume > 50_000;
  const sinExchanges    = exchangeInteraction === 0;

  if (esReciente) {
    score += 25;
    motivos.push("Wallet reciente (menos de 30 días)");
  }
  if (esAltoVolumen) {
    score += 25;
    motivos.push("Alto volumen de USDT");
  }
  if (txCount > 50) {
    score += 15;
    motivos.push("Alta actividad transaccional");
  }
  if (sinExchanges) {
    score += 15;
    motivos.push("Sin interacción con exchanges");
  }
  if (isLinkedToRiskWallet) {
    score += 20;
    motivos.push("Conexión con wallets riesgosas");
  }

  // ── Categoría "Riesgo latente": combinación de perfil sospechoso sin señales directas
  const esLatente = esReciente && esAltoVolumen && sinExchanges && !isLinkedToRiskWallet;

  let nivel: CongelamientoResult["nivel"] = "BAJO";
  if (score >= 80)      nivel = "ALTO";
  else if (score >= 50) nivel = esLatente ? "LATENTE" : "MEDIO";
  else if (esLatente)   nivel = "LATENTE";

  return { score, nivel, motivos };
}

function getRiskMessage(score: number, isLatente = false): { nivel: string; mensaje: string; color: string; icono: string } {
  if (score >= 81) return {
    nivel:   "Severo",
    mensaje: "Patrones asociados a riesgo detectados. Se recomienda evitar interactuar con esta dirección.",
    color:   DANGER,
    icono:   "⛔",
  };
  if (score >= 61) return {
    nivel:   "Alto",
    mensaje: "Interacción con direcciones de riesgo detectada. Podría existir exposición a actividad no verificada.",
    color:   ORANGE,
    icono:   "🚨",
  };
  if (isLatente) return {
    nivel:   "Latente",
    mensaje: "Perfil de riesgo latente detectado. Combinación de wallet reciente, alto volumen y ausencia de exchanges aumenta el riesgo de congelamiento futuro.",
    color:   AMBER,
    icono:   "🔆",
  };
  if (score >= 31) return {
    nivel:   "Moderado",
    mensaje: "Actividad inusual detectada. Se recomienda precaución antes de interactuar con esta dirección.",
    color:   AMBER,
    icono:   "⚠️",
  };
  return {
    nivel:   "Bajo",
    mensaje: "Patrones de riesgo potencial detectados. Posible congelamiento futuro si el perfil evoluciona.",
    color:   GREEN,
    icono:   "✅",
  };
}

// Daily stats helpers (localStorage)
interface DailyStats { date: string; analyzed: number; highRisk: number; }
function getDailyStats(): DailyStats {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const raw = localStorage.getItem("wg_daily_stats");
    if (raw) {
      const parsed: DailyStats = JSON.parse(raw);
      if (parsed.date === today) return parsed;
    }
  } catch {}
  return { date: today, analyzed: 0, highRisk: 0 };
}
function saveDailyStats(s: DailyStats) {
  try { localStorage.setItem("wg_daily_stats", JSON.stringify(s)); } catch {}
}

export interface RiskyCounterparty {
  address: string;
  value: number;
  label: "BLACKLISTED" | "STOLEN FUNDS" | "MONEY LAUNDERING" | "SANCTIONED WALLET" | "USDT BLACKLIST INTERACTION";
  level: "critical" | "high" | "medium";
}

interface ReportData {
  address: string;
  accountType: string;
  isFrozen: boolean;
  isInBlacklistDB: boolean;
  balanceTRX: number;
  balanceUSDT: number;
  totalTx: number;
  txIn: number;
  txOut: number;
  dateCreated: number;
  lastTxDate: number;
  totalInUSDT: number;
  totalOutUSDT: number;
  uniqueWalletsCount: number;
  transfersAnalyzed: number;
  exchangeInteractions: number;
  suspiciousInteractions: number;
  riskyCounterparties: RiskyCounterparty[];
  detectedViaTRC20?: boolean;
}

// Risk database: address → { label, level }
const RISK_DATABASE: Record<string, { label: RiskyCounterparty["label"]; level: RiskyCounterparty["level"] }> = {
  "TDCLbZMHJJYNVMLMBBf63tKRgRGUhSQMmk": { label: "MONEY LAUNDERING",  level: "critical" },
  "THFgNEBXCmXnprDRaEf4bArVLphCwN7xNh": { label: "STOLEN FUNDS",       level: "critical" },
  "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW": { label: "BLACKLISTED",        level: "critical" },
  "TUFMa4D3j3S8rWB4hWMerGJqDcNEpBjNNT": { label: "SANCTIONED WALLET",  level: "high"     },
  "TNaRAoLUyYEV2uF7GUrzSjRQTU3v6CHdXM": { label: "BLACKLISTED",        level: "critical" },
  "TXrkRCGqMjRhSfsFGr8bPxr7xHLGJFGJ2V": { label: "MONEY LAUNDERING",  level: "high"     },
  "TMuA6YqfCeX8EhbfYEg5y7S4DqzSJireY9": { label: "STOLEN FUNDS",       level: "critical" },
  "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7": { label: "SANCTIONED WALLET",  level: "high"     },
  "TYukBQZ2XXCcRCReAUgCiWScMT6SLFRFAs": { label: "MONEY LAUNDERING",  level: "medium"   },
  "TKVTdDBFUQH7FMnSQYELipCBYPegDhQwRJ": { label: "BLACKLISTED",        level: "critical" },
  "TUea3MVQCWrYmKpBHe7aWAzSHHQHBGMQqz": { label: "STOLEN FUNDS",       level: "high"     },
  "TVj7RNbeogwmasTB3fjnv75eV7teYmn74R": { label: "SANCTIONED WALLET",  level: "critical" },
  "TAPVF93s8dysXY8MzvqMoRdawoNMAPf7tL": { label: "MONEY LAUNDERING",  level: "high"     },
  "TWd4WrZ9wn84f5x1hZhL4DHvk738ns5jwH": { label: "BLACKLISTED",        level: "critical" },
  "TXmVpin9hDD7YJAuaECRiEJVXPDnuGSo9f": { label: "STOLEN FUNDS",       level: "critical" },
};

// ── TronGrid Rate Limiter ─────────────────────────────────────────────────────
// Max 10 requests/second. Each call reserves a 100 ms slot and waits its turn.
// Concurrent callers naturally queue behind each other without extra overhead.
let _nextSlot = 0;
function acquireRateLimit(): Promise<void> {
  const now = Date.now();
  const slot = Math.max(now, _nextSlot);
  _nextSlot = slot + 100; // 100 ms gap = 10 req/s
  const wait = slot - now;
  return wait > 0 ? new Promise((r) => setTimeout(r, wait)) : Promise.resolve();
}

// All TronGrid calls go through the backend proxy — API key stays on server,
// results are cached 30 s, so repeated scans never hit the rate limit.
const TRON_PROXY = `${API_BASE}/tron`;

const TRON_RETRY_DELAY_MS = 3_000; // 3 s between retries (server caches help a lot)
const TRON_MAX_RETRIES    = 3;

async function tronRequest(
  url: string,
  options: RequestInit = {},
  onWaiting?: (msg: string | null) => void,
): Promise<any> {
  const baseHeaders: Record<string, string> = {
    Accept: "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };

  for (let attempt = 0; attempt <= TRON_MAX_RETRIES; attempt++) {
    await acquireRateLimit();
    const res = await fetch(url, { ...options, headers: baseHeaders });

    if (res.status === 429) {
      if (attempt < TRON_MAX_RETRIES) {
        onWaiting?.("Esperando respuesta de blockchain...");
        await new Promise((r) => setTimeout(r, TRON_RETRY_DELAY_MS));
        onWaiting?.(null);
        continue;
      }
      throw new Error("Límite de velocidad alcanzado. Intente nuevamente en unos segundos.");
    }

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`Error de API TronGrid (${res.status}): ${text}`);
    }

    return res.json();
  }
}

// Decode a TRON base58 address to Ethereum-style hex (0x + 20 bytes)
// Used to look up addresses in the blacklist DB which stores 0x-format from TronGrid events
const tronBase58ToEthHex = (address: string): string => {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let n = 0n;
  for (const c of address) {
    const idx = ALPHABET.indexOf(c);
    if (idx < 0) throw new Error("Invalid base58 character");
    n = n * 58n + BigInt(idx);
  }
  const hex = n.toString(16).padStart(50, "0");
  return "0x" + hex.slice(2, 42);
};

// Decode a base58-encoded TRON address into a 64-char ABI-encoded hex parameter
const tronBase58ToAbiParam = (address: string): string => {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let n = 0n;
  for (const c of address) {
    const idx = ALPHABET.indexOf(c);
    if (idx < 0) throw new Error("Invalid base58 character");
    n = n * 58n + BigInt(idx);
  }
  // 25 bytes: [0x41 prefix][20-byte address][4-byte checksum]
  const hex = n.toString(16).padStart(50, "0");
  const addressHex = hex.slice(2, 42);
  return addressHex.padStart(64, "0");
};

interface WalletAnalyzerProps {
  prefillAddress?: string;
  onAddressConsumed?: () => void;
}

// ── Freemium helpers ─────────────────────────────────────────────────────────

const FREE_SCAN_LIMIT = 5;

interface FreemiumStatus {
  plan:       "free" | "pro";
  scansToday: number;
  limit:      number;
  canScan:    boolean;
  remaining:  number | null;
  blocked?:   "evasion" | "limit_reached" | string;
  ipHash?:    string;
}

const DEFAULT_FREEMIUM: FreemiumStatus = { plan: "free", scansToday: 0, limit: 5, canScan: true, remaining: 5 };

async function fetchFreemiumStatus(ccId: string): Promise<FreemiumStatus> {
  try {
    const deviceId = getDeviceId();
    const params = new URLSearchParams({ ccId, ...(deviceId ? { deviceId } : {}) });
    const res = await fetch(`${API_BASE}/freemium/status?${params}`);
    if (!res.ok) return DEFAULT_FREEMIUM;
    return await res.json();
  } catch {
    return DEFAULT_FREEMIUM;
  }
}

// Unified scan call: validates limit backend-side + records tracking + returns updated status.
async function recordScanUnified(ccId: string, wallet: string): Promise<FreemiumStatus> {
  try {
    const deviceId = getDeviceId();
    const res = await fetch(`${API_BASE}/scan`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ wallet, ccId, ...(deviceId ? { deviceId } : {}) }),
    });
    const data = await res.json();
    if (data.blocked === "evasion") {
      return { plan: "free", scansToday: data.scansToday ?? 0, limit: FREE_SCAN_LIMIT, canScan: false, remaining: 0, blocked: "evasion", ipHash: data.ipHash };
    }
    if (res.status === 429 || data.error === "limit_reached") {
      return { plan: "free", scansToday: data.scansToday ?? 5, limit: FREE_SCAN_LIMIT, canScan: false, remaining: 0, blocked: "limit_reached" };
    }
    if (data.plan === "pro") {
      return { plan: "pro", scansToday: 0, limit: FREE_SCAN_LIMIT, canScan: true, remaining: null };
    }
    return {
      plan:       "free",
      scansToday: data.scansToday ?? 0,
      limit:      FREE_SCAN_LIMIT,
      canScan:    data.canScan ?? true,
      remaining:  data.remaining ?? FREE_SCAN_LIMIT,
    };
  } catch {
    return DEFAULT_FREEMIUM;
  }
}

const WalletAnalyzer = ({ prefillAddress, onAddressConsumed }: WalletAnalyzerProps = {}) => {
  const [address, setAddress] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [dailyStats, setDailyStats] = useState<DailyStats>(() => getDailyStats());
  const [rateLimitMessage, setRateLimitMessage] = useState<string | null>(null);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const {
    ccId, freemium, freemiumLoaded,
    paymentStatus, requestPayment, applyFreemiumUpdate, refreshFreemium,
  } = useFreemium();

  const [upgradeEmail,  setUpgradeEmail]  = useState("");
  const [upgradeSending, setUpgradeSending] = useState(false);
  const [qrDataUrl,      setQrDataUrl]      = useState<string>("");
  const [copiedAddr,     setCopiedAddr]     = useState(false);
  const [selectedPlan,   setSelectedPlan]   = useState<{ name: string; price: string }>({ name: "Pro", price: "19.99" });
  const resultRef    = useRef<HTMLDivElement>(null);
  const shareCardRef = useRef<HTMLDivElement>(null);
  const [sharingImage, setSharingImage] = useState(false);

  const PRO_ADDRESS = "TM2cRRegda1gQAQY9hGbg6DMscN7okNVA1";

  // Generate QR code for payment address on mount
  useEffect(() => {
    QRCode.toDataURL(PRO_ADDRESS, {
      width: 200, margin: 2,
      color: { dark: "#000000", light: "#FFFFFF" },
    }).then(setQrDataUrl).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Show Sonner toast when plan status changes (socket handled by context)
  const prevPaymentStatusRef = useRef(paymentStatus);
  useEffect(() => {
    const prev = prevPaymentStatusRef.current;
    prevPaymentStatusRef.current = paymentStatus;
    if (prev === paymentStatus) return;
    if (paymentStatus === "confirmed") {
      toast.success("🎉 ¡Plan PRO activado! Ya puedes usar análisis ilimitados.", {
        duration: 6000,
        style: { background: "#0D2D1F", border: "1px solid rgba(0,255,198,0.35)", color: "#00FFC6" },
      });
    } else if (paymentStatus === "none" && (prev === "pending" || prev === "confirmed")) {
      toast.error("⚠️ No pudimos verificar tu pago. Si ya lo realizaste, puedes intentarlo nuevamente con 'Ya pagué'.", {
        duration: 8000,
        style: { background: "#1A0D0D", border: "1px solid rgba(255,80,80,0.35)", color: "#FF6B6B" },
      });
    }
  }, [paymentStatus]);

  // Sync daily stats from localStorage on mount
  useEffect(() => {
    setDailyStats(getDailyStats());
  }, []);

  // Pre-fill address from Wallets tab and auto-trigger analysis
  useEffect(() => {
    if (!prefillAddress) return;
    setAddress(prefillAddress);
    setShowReport(false);
    setReportData(null);
    onAddressConsumed?.();
    // Small delay so the input renders before we trigger the form
    setTimeout(() => {
      const btn = document.getElementById("wg-analyze-btn") as HTMLButtonElement | null;
      btn?.click();
    }, 100);
  }, [prefillAddress]); // eslint-disable-line react-hooks/exhaustive-deps

  const isValidTronAddress = (addr: string) => {
    return /^T[a-zA-Z0-9]{33}$/.test(addr);
  };

  // Rate-limited GET wrapper — all TronGrid reads go through here
  const tronGridFetch = (url: string) =>
    tronRequest(url, { method: "GET" }, setRateLimitMessage);

  const checkUsdtBlacklist = async (addr: string): Promise<boolean> => {
    try {
      const usdtContract = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
      const param = tronBase58ToAbiParam(addr);
      const data = await tronRequest(
        `${TRON_PROXY}/wallet/triggerconstantcontract`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            owner_address: addr,
            contract_address: usdtContract,
            function_selector: "isBlackListed(address)",
            parameter: param,
            visible: true,
          }),
        },
        setRateLimitMessage,
      );
      if (!data?.result?.result) return false;
      const result: string = data.constant_result?.[0] ?? "";
      return result.length === 64 && /[^0]/.test(result);
    } catch {
      return false;
    }
  };

  const fetchTronData = async (addr: string): Promise<ReportData> => {
    if (!isValidTronAddress(addr)) {
      throw new Error("Formato de dirección TRON inválido");
    }
    const usdtContract = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

    // Helper: check DB blacklist (Ethereum hex format stored from TronGrid events)
    const checkBlacklistDB = async (): Promise<boolean> => {
      try {
        const ethHex = tronBase58ToEthHex(addr);
        const res = await fetch(`/api/blacklist/check/${encodeURIComponent(ethHex)}`);
        if (!res.ok) return false;
        const data = await res.json();
        return data.found === true;
      } catch {
        return false;
      }
    };

    // 1. Account info + blacklist checks in parallel
    const [accountData, isFrozen, isInBlacklistDB] = await Promise.all([
      tronGridFetch(`${TRON_PROXY}/v1/accounts/${encodeURIComponent(addr)}`),
      checkUsdtBlacklist(addr),
      checkBlacklistDB(),
    ]);
    const account = accountData.data?.[0];

    // Helper: query TRC20 balanceOf via triggerconstantcontract
    const fetchTRC20BalanceFallback = async (contractAddr: string): Promise<number> => {
      try {
        const param = tronBase58ToAbiParam(addr);
        const data = await tronRequest(
          `${TRON_PROXY}/wallet/triggerconstantcontract`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              owner_address: addr,
              contract_address: contractAddr,
              function_selector: "balanceOf(address)",
              parameter: param,
              visible: true,
            }),
          },
          setRateLimitMessage,
        );
        const hex: string = data?.constant_result?.[0] ?? "";
        if (!hex || hex.length !== 64) return 0;
        return Number(BigInt("0x" + hex)) / 1_000_000;
      } catch {
        return 0;
      }
    };

    const accountTypeMap: Record<number, string> = {
      0: "Normal",
      1: "Emisor de Token",
      2: "Contrato",
    };

    let accountType  = "Normal";
    let balanceTRX   = 0;
    let balanceUSDT  = 0;
    let dateCreated: number = Date.now();
    let detectedViaTRC20 = false;

    if (account) {
      // Standard path — account found via TronGrid /v1/accounts
      accountType = accountTypeMap[account.account_type as number] ?? "Normal";
      dateCreated = account.create_time || Date.now();

      // TRX balance: account.balance is in SUN (1 TRX = 1,000,000 SUN)
      balanceTRX = typeof account.balance === "number" ? account.balance / 1_000_000 : 0;

      const trc20Map: Record<string, string> = {};
      if (Array.isArray(account.trc20)) {
        account.trc20.forEach((entry: Record<string, string>) => {
          Object.assign(trc20Map, entry);
        });
      }
      const rawUsdt = trc20Map[usdtContract];
      balanceUSDT = rawUsdt ? parseFloat(rawUsdt) / 1e6 : 0;
    } else {
      // Fallback — wallet may hold USDT without any TRX history.
      // Query both known USDT contracts directly.
      const [b1, b2] = await Promise.all([
        fetchTRC20BalanceFallback("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"),
        fetchTRC20BalanceFallback("TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj"),
      ]);
      balanceUSDT = Math.max(b1, b2);
      // Even with 0 balance, the address is a valid TRON format — proceed to show the report.
      // A zero balance just means the wallet is new or has no recorded activity.
      detectedViaTRC20 = balanceUSDT > 0;
    }

    // 2. Transaction counts via TronGrid
    //    txIn  = transactions where addr is RECEIVER (only_to=true)
    //    txOut = transactions where addr is SENDER   (only_from=true)
    let totalTx = 0;
    let txIn = 0;
    let txOut = 0;
    try {
      const base = `${TRON_PROXY}/v1/accounts/${encodeURIComponent(addr)}/transactions?limit=1&only_confirmed=true`;
      const [txTotalData, txInData, txOutData] = await Promise.all([
        tronGridFetch(base),
        tronGridFetch(`${base}&only_to=true`),
        tronGridFetch(`${base}&only_from=true`),
      ]);
      totalTx = txTotalData.meta?.total || 0;
      txIn    = txInData.meta?.total   || 0;   // receiver = wallet → incoming (green)
      txOut   = txOutData.meta?.total  || 0;   // sender   = wallet → outgoing (red)
    } catch {
      // Non-fatal; continue with zeros
    }

    // 3. Latest TRC20 transfer timestamp for lastTxDate
    let lastTxDate = Date.now();
    try {
      const latestData = await tronGridFetch(
        `${TRON_PROXY}/v1/accounts/${encodeURIComponent(addr)}/transactions/trc20?limit=1&contract_address=${usdtContract}&only_confirmed=true`
      );
      const first = latestData.data?.[0];
      if (first?.block_timestamp) lastTxDate = first.block_timestamp;
    } catch {
      // Non-fatal; keep default
    }

    // 4. Fetch up to 3 pages of TRC20 USDT transfers
    let totalInUSDT = 0;
    let totalOutUSDT = 0;
    const uniqueWallets = new Set<string>();
    let transfers: any[] = [];
    let exchangeInteractions = 0;
    const riskyCounterparties: RiskyCounterparty[] = [];

    let fingerprint: string | null = null;
    const maxPages = 3;
    for (let i = 0; i < maxPages; i++) {
      let url = `${TRON_PROXY}/v1/accounts/${encodeURIComponent(addr)}/transactions/trc20?limit=50&contract_address=${usdtContract}&only_confirmed=true`;
      if (fingerprint) url += `&fingerprint=${encodeURIComponent(fingerprint)}`;
      try {
        const data = await tronGridFetch(url);
        const batch: any[] = data.data || [];
        transfers = transfers.concat(batch);
        fingerprint = data.meta?.fingerprint || null;
        if (batch.length < 50 || !fingerprint) break;
      } catch {
        break;
      }
    }

    // Derive TRC20-based tx counts — more accurate than the TRX endpoint for
    // TRC20-only wallets (which have 0 on the /transactions endpoint).
    let trc20TxIn  = 0;
    let trc20TxOut = 0;

    transfers.forEach((t: any) => {
      // USDT TRC20 always uses 6 decimals. Hardcode the divisor so we never
      // display raw uint256 blockchain values regardless of token_info content.
      const raw    = parseFloat(t.value || "0");
      const amount = Number.isFinite(raw) ? raw / 1_000_000 : 0;

      if (t.to === addr) {
        totalInUSDT  += amount;
        trc20TxIn    += 1;
      } else if (t.from === addr) {
        totalOutUSDT += amount;
        trc20TxOut   += 1;
      }
      if (t.from) uniqueWallets.add(t.from);
      if (t.to)   uniqueWallets.add(t.to);

      // Counterparty risk: check the other party against the static risk database
      const counterparty = t.to === addr ? t.from : t.to;
      if (counterparty && counterparty !== addr && RISK_DATABASE[counterparty]) {
        const risk = RISK_DATABASE[counterparty];
        const signedValue = t.to === addr ? amount : -amount;
        riskyCounterparties.push({
          address: counterparty,
          value: signedValue,
          label: risk.label,
          level: risk.level,
        });
      }
    });

    // Override TRX-based counters with TRC20 counts when the TRC20 data is
    // more informative (avoids showing "0 Transacciones" on USDT-only wallets).
    if (trc20TxIn + trc20TxOut > 0) {
      txIn    = trc20TxIn;
      txOut   = trc20TxOut;
      totalTx = trc20TxIn + trc20TxOut;
    }

    // Safety cap: prevent astronomical numbers from slipping through if the
    // blockchain ever returns unexpected raw values.
    totalInUSDT  = Number.isFinite(totalInUSDT)  ? Math.min(totalInUSDT,  1e12) : 0;
    totalOutUSDT = Number.isFinite(totalOutUSDT) ? Math.min(totalOutUSDT, 1e12) : 0;

    // Derive USDT balance from transfer sums so all 4 display values are
    // computed from the same source (prevents chain-field vs. transfer-sum drift).
    // Only override when we have actual transfer data; otherwise keep the
    // on-chain trc20 field value (accurate for wallets with no recent transfers).
    if (trc20TxIn + trc20TxOut > 0) {
      balanceUSDT = Math.max(0, totalInUSDT - totalOutUSDT);
    }

    // 5. Live USDT blacklist check for unique counterparties not already flagged
    try {
      const alreadyFlagged = new Set(riskyCounterparties.map((r) => r.address));
      const uniqueCounterparties = Array.from(
        new Set(
          transfers
            .map((t: any) => (t.to === addr ? t.from : t.to))
            .filter((cp: string) => cp && cp !== addr && !alreadyFlagged.has(cp))
        )
      ).slice(0, 30) as string[]; // cap at 30 to respect API rate limits

      const blacklistResults = await Promise.allSettled(
        uniqueCounterparties.map(async (cp) => {
          const isBl = await checkUsdtBlacklist(cp);
          return { cp, isBl };
        })
      );

      blacklistResults.forEach((result) => {
        if (result.status === "fulfilled" && result.value.isBl) {
          const cpAddr = result.value.cp;
          // Sum signed values across all transfers involving this counterparty
          let totalValue = 0;
          transfers.forEach((t: any) => {
            const cp = t.to === addr ? t.from : t.to;
            if (cp === cpAddr) {
              const raw    = parseFloat(t.value || "0");
              const amount = Number.isFinite(raw) ? raw / 1_000_000 : 0;
              totalValue += t.to === addr ? amount : -amount;
            }
          });
          riskyCounterparties.push({
            address: cpAddr,
            value: totalValue,
            label: "USDT BLACKLIST INTERACTION",
            level: "high",
          });
        }
      });
    } catch {
      // Non-fatal: continue with whatever was already collected
    }

    return {
      address: addr,
      accountType,
      isFrozen,
      isInBlacklistDB,
      balanceTRX,
      balanceUSDT,
      totalTx,
      txIn,
      txOut,
      dateCreated,
      lastTxDate,
      totalInUSDT,
      totalOutUSDT,
      uniqueWalletsCount: uniqueWallets.size,
      transfersAnalyzed: transfers.length,
      exchangeInteractions,
      suspiciousInteractions: riskyCounterparties.length,
      riskyCounterparties,
      detectedViaTRC20,
    };
  };

  const handleAnalyze = async (e?: React.FormEvent | React.MouseEvent, overrideAddr?: string) => {
    e?.preventDefault();
    const trimmed = (overrideAddr ?? address).trim();
    if (!trimmed) {
      toast.error("Por favor ingresa una dirección de billetera TRON");
      return;
    }
    if (!isValidTronAddress(trimmed)) {
      toast.error("Formato de dirección TRON inválido. Debe comenzar con T y tener 34 caracteres.");
      return;
    }

    // ── Freemium gate: check limit before running the scan ──────────────────
    // Must have the plan confirmed from DB before allowing any scan
    if (!freemiumLoaded || !ccId) return;
    const latestStatus = await fetchFreemiumStatus(ccId);
    applyFreemiumUpdate(latestStatus);
    if (!latestStatus.canScan) return; // UI already shows the limit message

    setIsAnalyzing(true);
    setShowReport(false);
    setRateLimitMessage(null);
    try {
      const data = await fetchTronData(trimmed);
      setReportData(data);
      setShowReport(true);

      // Unified call: validates limit backend-side + records tracking + returns updated freemium status
      recordScanUnified(ccId, trimmed).then(applyFreemiumUpdate);

      // Smooth-scroll to results so mobile users see them immediately
      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);

      // Update daily stats
      const current = getDailyStats();
      const isHighRisk = data.isFrozen || data.isInBlacklistDB || data.riskyCounterparties.length > 0;
      const updated: DailyStats = {
        ...current,
        analyzed: current.analyzed + 1,
        highRisk: current.highRisk + (isHighRisk ? 1 : 0),
      };
      saveDailyStats(updated);
      setDailyStats(updated);
    } catch (error: any) {
      toast.error(error.message || "Error al analizar la dirección");
    } finally {
      setIsAnalyzing(false);
      setRateLimitMessage(null);
    }
  };

  const handleClear = () => {
    setAddress("");
    setReportData(null);
    setShowReport(false);
  };

  const handleScanSuccess = (result: string) => {
    setAddress(result);
    handleAnalyze(undefined, result);
  };

  const handleCopyAddress = (addr: string) => {
    navigator.clipboard.writeText(addr).then(() => {
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
    });
  };

  // ── Share analysis as image ───────────────────────────────────────────────
  const generarImagen = useCallback(async () => {
    const el = shareCardRef.current;
    if (!el || !reportData) return;
    setSharingImage(true);
    try {
      const canvas = await html2canvas(el, {
        backgroundColor: null,
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const dataUrl = canvas.toDataURL("image/png");

      // Try Web Share API first (mobile native sheet)
      if (navigator.share && navigator.canShare) {
        try {
          const res = await fetch(dataUrl);
          const blob = await res.blob();
          const file = new File([blob], "coincash-analisis.png", { type: "image/png" });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              title: "CoinCash — Análisis TRON",
              text: "🔐 Esta wallet ha sido verificada en www.hardsoftcomputer.com ✔️",
              files: [file],
            });
            return;
          }
        } catch {
          // Fall through to download
        }
      }

      // Fallback: download PNG
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `coincash-${reportData.address.slice(0, 8)}.png`;
      link.click();
    } catch (err) {
      console.error("Share error:", err);
    } finally {
      setSharingImage(false);
    }
  }, [reportData]);

  const isPro = freemiumLoaded && freemium.plan === "pro";

  return (
    <div className="flex flex-col w-full px-4 mx-auto" style={{ maxWidth: "640px" }}>

      {/* ── PRO badge row ── */}
      {isPro && (
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
          <span className="pro-badge">⭐ PRO</span>
        </div>
      )}

      {/* ── Input card ── */}
      <div className={`rounded-2xl p-4 mb-4${isPro ? " scanner-card-pro" : ""}`}
        style={{
          background: "linear-gradient(160deg,#141A24 0%,#0D1117 100%)",
          border: `1px solid ${isPro ? "rgba(255,215,0,0.45)" : BORDER}`,
          boxShadow: isPro
            ? "0 8px 32px rgba(0,0,0,0.5), 0 0 28px rgba(255,215,0,0.18)"
            : "0 8px 32px rgba(0,0,0,0.5)",
        }}>

        {/* Address input row */}
        <div className="relative flex items-center mb-3">
          <ScanSearch className="absolute left-3.5 pointer-events-none"
            style={{ color: "rgba(255,255,255,0.3)", width: 17, height: 17 }} />
          <input
            value={address}
            onChange={e => setAddress(e.target.value)}
            placeholder="Dirección TRON (T...)"
            disabled={isAnalyzing}
            className="w-full rounded-xl text-sm text-white outline-none font-mono"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${address ? BLUE + "60" : BORDER}`,
              padding: "12px 36px 12px 38px",
              transition: "border-color 0.2s",
              letterSpacing: "0.02em",
            }}
          />
          {address && (
            <button type="button" onClick={handleClear} disabled={isAnalyzing}
              className="absolute right-3 flex items-center justify-center rounded-full"
              style={{ color: "rgba(255,255,255,0.3)", width: 20, height: 20 }}>
              <X style={{ width: 14, height: 14 }} />
            </button>
          )}
        </div>

        {/* Action buttons — stacked */}
        <div className="flex flex-col gap-2.5">
          {/* ── Evasion detected: multiple devices on same network ── */}
          {freemiumLoaded && !freemium.canScan && freemium.blocked === "evasion" && (
            <div style={{
              background: "rgba(11,18,32,0.95)",
              border: "1px solid rgba(245,158,11,0.35)",
              borderRadius: 16, overflow: "hidden",
            }}>
              <div style={{
                background: "linear-gradient(135deg,rgba(245,158,11,0.1),rgba(255,107,53,0.06))",
                borderBottom: "1px solid rgba(245,158,11,0.2)",
                padding: "12px 16px",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#F59E0B" }}>
                    ⚠️ Red compartida detectada
                  </p>
                  <p style={{ margin: "2px 0 0", fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                    Detectamos múltiples dispositivos en esta red
                  </p>
                </div>
                <div style={{
                  background: "rgba(0,255,198,0.12)", border: "1px solid rgba(0,255,198,0.3)",
                  borderRadius: 8, padding: "4px 10px", fontSize: 13, fontWeight: 800, color: "#00FFC6",
                }}>
                  10 USDT
                </div>
              </div>
              <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>
                  Hay más de 2 dispositivos activos en tu red hoy. Para evitar abusos, el límite gratuito se comparte por IP.
                  <br/>Actualiza a <strong style={{ color: "#00FFC6" }}>CoinCash PRO</strong> para scans ilimitados sin restricciones de red.
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={async () => {
                      if (!ccId) return;
                      const status = await fetchFreemiumStatus(ccId);
                      // If backend no longer blocks (admin whitelisted IP), clear evasion state
                      if (status.canScan) {
                        applyFreemiumUpdate(status);
                      } else {
                        // Still blocked — try a scan call to get the real reason
                        applyFreemiumUpdate({ ...freemium, blocked: "limit_reached" });
                      }
                    }}
                    style={{
                      padding: "11px 14px", borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.05)",
                      color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: 600,
                      cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    🔄 Reintentar
                  </button>
                  <button
                    onClick={() => applyFreemiumUpdate({ ...freemium, blocked: "limit_reached" })}
                    style={{
                      flex: 1, padding: "11px 0", borderRadius: 12, border: "none",
                      background: "linear-gradient(135deg,#00FFC6,#00B8A9)",
                      color: "#0B0F14", fontSize: 13, fontWeight: 800, cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    🚀 Activar PRO — 10 USDT
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Freemium limit → Payment card (only after plan confirmed from DB) ── */}
          {freemiumLoaded && !freemium.canScan && freemium.blocked !== "evasion" && (
            <div style={{
              background: "rgba(11,18,32,0.95)",
              border: "1px solid rgba(0,255,198,0.2)",
              borderRadius: 16, overflow: "hidden",
            }}>
              {/* Header */}
              <div style={{
                background: "linear-gradient(135deg,rgba(0,255,198,0.1),rgba(0,128,255,0.06))",
                borderBottom: "1px solid rgba(0,255,198,0.15)",
                padding: "12px 16px",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#fff" }}>
                    ⛔ Límite gratuito alcanzado
                  </p>
                  <p style={{ margin: "2px 0 0", fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                    Elige un plan para continuar
                  </p>
                </div>
                <div style={{
                  background: "rgba(0,255,198,0.12)", border: "1px solid rgba(0,255,198,0.3)",
                  borderRadius: 8, padding: "4px 10px", fontSize: 11, fontWeight: 800, color: "#00FFC6",
                }}>
                  TRC20
                </div>
              </div>

              <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>

                {/* ── Plans header tagline ── */}
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#F9FAFB", textAlign: "center" }}>
                  🛡️ Protege tu dinero antes de enviar USDT
                </p>

                {/* ── Plan cards ── */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>

                  {/* Plan Básico */}
                  <div style={{
                    background: selectedPlan.name === "Básico" ? "rgba(0,255,198,0.07)" : "rgba(255,255,255,0.04)",
                    border: selectedPlan.name === "Básico" ? "2px solid rgba(0,255,198,0.7)" : "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 14, padding: "14px 12px",
                    display: "flex", flexDirection: "column", gap: 8,
                    position: "relative",
                    boxShadow: selectedPlan.name === "Básico" ? "0 0 18px rgba(0,255,198,0.22)" : "none",
                    transform: selectedPlan.name === "Básico" ? "scale(1.02)" : "scale(1)",
                    transformOrigin: "center",
                    transition: "all 0.22s ease",
                  }}>
                    {/* Selected badge */}
                    {selectedPlan.name === "Básico" && (
                      <div style={{
                        position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)",
                        background: "linear-gradient(90deg,#00C896,#00FFC6)",
                        borderRadius: 20, padding: "2px 10px",
                        fontSize: 9, fontWeight: 800, color: "#0B0F14",
                        letterSpacing: "0.04em", whiteSpace: "nowrap",
                      }}>✔ Seleccionado</div>
                    )}
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#E5E7EB", marginTop: selectedPlan.name === "Básico" ? 4 : 0 }}>💳 Básico</div>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, lineHeight: 1 }}>
                      <span style={{ fontSize: 24, fontWeight: 900, color: "#fff" }}>$9.99</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {["100 análisis", "$0.099 por análisis", "🔍 Verifica wallets antes de enviar USDT"].map((f, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 5 }}>
                          <span style={{ color: "#00FFC6", fontSize: 10, flexShrink: 0, marginTop: 1 }}>✓</span>
                          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", lineHeight: 1.4 }}>{f}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 2, fontSize: 9, color: "rgba(255,255,255,0.3)", textAlign: "center" }}>
                      Pago único · sin suscripción
                    </div>
                    <button
                      onClick={() => {
                        setSelectedPlan({ name: "Básico", price: "9.99" });
                        const el = document.getElementById("wg-payment-section");
                        el?.scrollIntoView({ behavior: "smooth" });
                      }}
                      style={{
                        marginTop: 2, padding: "8px 0",
                        border: selectedPlan.name === "Básico" ? "none" : "1px solid rgba(0,255,198,0.3)",
                        borderRadius: 9,
                        background: selectedPlan.name === "Básico"
                          ? "linear-gradient(135deg,rgba(0,200,150,0.9),rgba(0,255,198,0.8))"
                          : "rgba(0,255,198,0.07)",
                        color: selectedPlan.name === "Básico" ? "#0B1220" : "#00FFC6",
                        fontSize: 11, fontWeight: 700,
                        cursor: "pointer", fontFamily: "inherit",
                      }}
                    >{selectedPlan.name === "Básico" ? "✓ Seleccionado" : "Seleccionar plan"}</button>
                  </div>

                  {/* Plan Pro — MÁS POPULAR */}
                  <div style={{
                    background: selectedPlan.name === "Pro"
                      ? "rgba(245,158,11,0.09)"
                      : "linear-gradient(155deg,rgba(0,255,198,0.06),rgba(0,128,255,0.04))",
                    border: selectedPlan.name === "Pro" ? "2px solid #F59E0B" : "1.5px solid rgba(245,158,11,0.4)",
                    borderRadius: 14, padding: "14px 12px",
                    display: "flex", flexDirection: "column", gap: 8,
                    transform: "scale(1.03)", transformOrigin: "center",
                    boxShadow: selectedPlan.name === "Pro"
                      ? "0 0 22px rgba(245,158,11,0.35)"
                      : "0 0 12px rgba(245,158,11,0.08)",
                    position: "relative",
                    transition: "all 0.22s ease",
                  }}>
                    {/* Badge — changes on selection */}
                    <div style={{
                      position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)",
                      background: selectedPlan.name === "Pro"
                        ? "linear-gradient(90deg,#F59E0B,#FBBF24)"
                        : "linear-gradient(90deg,#d97706,#F59E0B)",
                      borderRadius: 20, padding: "2px 10px",
                      fontSize: 9, fontWeight: 800, color: "#0B0F14",
                      letterSpacing: "0.04em", whiteSpace: "nowrap",
                    }}>{selectedPlan.name === "Pro" ? "✔ Seleccionado" : "🔥 MÁS POPULAR"}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#E5E7EB", marginTop: 6 }}>⚡ Pro</div>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, lineHeight: 1 }}>
                      <span style={{ fontSize: 24, fontWeight: 900, color: "#F59E0B" }}>$19.99</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {["250 análisis", "$0.079 por análisis", "🚀 Análisis avanzado + detección de congelamiento"].map((f, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 5 }}>
                          <span style={{ color: "#F59E0B", fontSize: 10, flexShrink: 0, marginTop: 1 }}>✓</span>
                          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.65)", lineHeight: 1.4 }}>{f}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 2, fontSize: 9, color: "rgba(255,255,255,0.3)", textAlign: "center" }}>
                      Pago único · sin suscripción
                    </div>
                    <button
                      onClick={() => {
                        setSelectedPlan({ name: "Pro", price: "19.99" });
                        const el = document.getElementById("wg-payment-section");
                        el?.scrollIntoView({ behavior: "smooth" });
                      }}
                      style={{
                        marginTop: 2, padding: "8px 0", border: "none",
                        borderRadius: 9,
                        background: selectedPlan.name === "Pro"
                          ? "linear-gradient(135deg,#F59E0B,#FBBF24)"
                          : "rgba(245,158,11,0.18)",
                        color: selectedPlan.name === "Pro" ? "#0B0F14" : "#F59E0B",
                        fontSize: 11, fontWeight: 800,
                        cursor: "pointer", fontFamily: "inherit",
                      }}
                    >{selectedPlan.name === "Pro" ? "✓ Seleccionado" : "Seleccionar plan"}</button>
                  </div>

                </div>

                {/* ── Divider ── */}
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }} />

                {/* Network badge */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }} id="wg-payment-section">
                  <span style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
                    background: "rgba(255,50,50,0.12)", border: "1px solid rgba(255,50,50,0.3)",
                    color: "#FF6B6B", borderRadius: 6, padding: "3px 8px",
                  }}>TRC20</span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Red TRON · USDT</span>
                </div>

                {/* Plan seleccionado */}
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  background: "rgba(0,255,198,0.06)", border: "1px solid rgba(0,255,198,0.2)",
                  borderRadius: 10, padding: "8px 14px",
                }}>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>Plan seleccionado:</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: selectedPlan.name === "Pro" ? "#F59E0B" : "#00FFC6" }}>
                    {selectedPlan.name === "Pro" ? "⚡" : "💳"} {selectedPlan.name}
                  </span>
                  <span style={{
                    fontSize: 11, fontWeight: 700,
                    color: selectedPlan.name === "Pro" ? "#F59E0B" : "#00FFC6",
                    background: selectedPlan.name === "Pro" ? "rgba(245,158,11,0.12)" : "rgba(0,255,198,0.12)",
                    border: `1px solid ${selectedPlan.name === "Pro" ? "rgba(245,158,11,0.35)" : "rgba(0,255,198,0.3)"}`,
                    borderRadius: 6, padding: "1px 7px",
                  }}>${selectedPlan.price}</span>
                </div>

                {/* QR code */}
                {qrDataUrl && (
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <div style={{ background: "#fff", borderRadius: 12, padding: 8, display: "inline-block" }}>
                      <img src={qrDataUrl} alt="QR dirección de pago" style={{ width: 160, height: 160, display: "block" }} />
                    </div>
                  </div>
                )}

                {/* Address + copy */}
                <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 12px" }}>
                  <p style={{ margin: "0 0 6px", fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Dirección de pago
                  </p>
                  <p style={{
                    margin: "0 0 8px", fontFamily: "monospace", fontSize: 11,
                    color: "#00FFC6", wordBreak: "break-all", lineHeight: 1.5,
                  }}>
                    {PRO_ADDRESS}
                  </p>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(PRO_ADDRESS).then(() => {
                        setCopiedAddr(true);
                        setTimeout(() => setCopiedAddr(false), 2500);
                      });
                    }}
                    style={{
                      display: "flex", alignItems: "center", gap: 5, width: "100%",
                      background: copiedAddr ? "rgba(0,255,198,0.12)" : "rgba(255,255,255,0.06)",
                      border: `1px solid ${copiedAddr ? "rgba(0,255,198,0.4)" : "rgba(255,255,255,0.12)"}`,
                      borderRadius: 8, padding: "7px 12px", cursor: "pointer",
                      color: copiedAddr ? "#00FFC6" : "rgba(255,255,255,0.6)",
                      fontSize: 12, fontWeight: 600, justifyContent: "center",
                      transition: "all 0.2s",
                    }}
                  >
                    {copiedAddr ? <Check size={13} /> : <Copy size={13} />}
                    {copiedAddr ? "¡Dirección copiada!" : "Copiar dirección"}
                  </button>
                </div>

                {/* Instructions */}
                <div style={{
                  background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.25)",
                  borderRadius: 10, padding: "10px 12px",
                }}>
                  <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.7)", lineHeight: 1.6 }}>
                    Envía <strong style={{ color: "#F59E0B" }}>{selectedPlan.price} USDT (TRC20)</strong> a la dirección anterior.<br />
                    Luego presiona <strong style={{ color: "#00FFC6" }}>"Ya pagué"</strong> para activar tu plan.
                  </p>
                </div>

                {/* "Ya pagué" button / verification message — driven by shared paymentStatus */}
                {paymentStatus === "pending" ? (
                  <div style={{
                    background: "rgba(0,255,198,0.07)", border: "1px solid rgba(0,255,198,0.3)",
                    borderRadius: 10, padding: "12px 14px", textAlign: "center",
                  }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#00FFC6" }}>
                      ✓ Pago en verificación.
                    </p>
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                      Activación en pocos minutos.
                    </p>
                  </div>
                ) : freemium.plan !== "pro" ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.5 }}>
                      📩 Envía el capture de tu pago a soporte para agilizar la activación PRO.
                    </p>
                    <button
                      disabled={upgradeSending}
                      onClick={async () => {
                        setUpgradeSending(true);
                        try {
                          await requestPayment(upgradeEmail);
                        } catch { /* ignore */ } finally { setUpgradeSending(false); }
                      }}
                      style={{
                        background: upgradeSending
                          ? "rgba(0,255,198,0.08)"
                          : "linear-gradient(135deg,rgba(0,200,150,0.9),rgba(0,255,198,0.8))",
                        border: "none", borderRadius: 10, padding: "12px 0",
                        color: upgradeSending ? "rgba(0,255,198,0.5)" : "#0B1220",
                        fontSize: 13, fontWeight: 800, cursor: upgradeSending ? "not-allowed" : "pointer",
                        width: "100%", letterSpacing: "0.02em",
                      }}
                    >
                      {upgradeSending ? "Enviando…" : "💳 Ya pagué — Activar PRO"}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          )}

          <button
            id="wg-analyze-btn"
            type="button"
            onClick={() => handleAnalyze()}
            disabled={isAnalyzing || !freemiumLoaded || !freemium.canScan}
            className={`flex w-full items-center justify-center gap-2 rounded-xl py-3.5 px-4 text-sm font-bold transition-opacity active:opacity-80${isPro && freemium.canScan && !isAnalyzing && freemiumLoaded ? " btn-pro-golden" : " text-white"}`}
            style={{
              background: !freemiumLoaded
                ? "rgba(255,255,255,0.07)"
                : !freemium.canScan
                  ? "rgba(255,75,79,0.2)"
                  : isAnalyzing
                    ? (isPro ? "rgba(255,165,0,0.4)" : "rgba(59,130,246,0.4)")
                    : isPro
                      ? "linear-gradient(135deg,#FFD700 0%,#FFA500 100%)"
                      : "linear-gradient(135deg,#2563EB 0%,#1D4ED8 100%)",
              boxShadow: isAnalyzing || !freemium.canScan || !freemiumLoaded
                ? "none"
                : isPro
                  ? "0 0 22px rgba(255,215,0,0.5)"
                  : "0 0 20px rgba(59,130,246,0.35)",
              cursor: !freemiumLoaded || !freemium.canScan ? "not-allowed" : "pointer",
              color: isPro && freemium.canScan && !isAnalyzing && freemiumLoaded ? "#000" : undefined,
            }}>
            {!freemiumLoaded ? (
              <>
                <Loader2 style={{ width: 16, height: 16 }} className="animate-spin" />
                <span>Verificando plan...</span>
              </>
            ) : isAnalyzing ? (
              <>
                <Loader2 style={{ width: 16, height: 16 }} className="animate-spin" />
                <span>Analizando...</span>
              </>
            ) : !freemium.canScan ? (
              <>
                <Shield style={{ width: 16, height: 16 }} />
                <span>Límite diario alcanzado</span>
              </>
            ) : isPro ? (
              <>
                <ScanSearch style={{ width: 16, height: 16 }} />
                <span>⭐ Analizar Wallet PRO</span>
              </>
            ) : (
              <>
                <ScanSearch style={{ width: 16, height: 16 }} />
                <span>Analizar Wallet</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setIsScannerOpen(true)}
            disabled={isAnalyzing}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 px-4 text-sm font-semibold transition-opacity active:opacity-70"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${BORDER}`,
              color: "rgba(255,255,255,0.65)",
            }}>
            <QrCode style={{ width: 16, height: 16 }} />
            <span>Scan QR</span>
          </button>
        </div>

        {/* Scan counter badge — visible for free users once plan is confirmed from DB */}
        {freemiumLoaded && freemium.plan === "free" && freemium.canScan && (() => {
          const used      = freemium.scansToday ?? 0;
          const remaining = freemium.remaining  ?? Math.max(0, freemium.limit - used);
          const color     = remaining === 0 ? "#FF4D4F"
                          : remaining === 1 ? "#F59E0B"
                          : "#00FFC6";
          return (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              gap: 8, marginTop: 10,
            }}>
              {/* Mini progress dots */}
              <div style={{ display: "flex", gap: 4 }}>
                {Array.from({ length: freemium.limit }).map((_, i) => (
                  <div key={i} style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: i < used
                      ? "rgba(255,255,255,0.15)"
                      : color,
                    transition: "background 0.3s",
                  }} />
                ))}
              </div>
              <span style={{
                fontSize: 11, fontWeight: 600,
                color,
                letterSpacing: "0.02em",
              }}>
                {remaining}/{freemium.limit} scans gratuitos hoy
              </span>
            </div>
          );
        })()}

        {/* Discrete legal note */}
        <p style={{ textAlign: "center", fontSize: 10, color: "rgba(255,255,255,0.22)", marginTop: 8, lineHeight: 1.5 }}>
          Análisis informativo basado en datos públicos. No constituye asesoramiento financiero.{" "}
          <a href="#legal" style={{ color: "rgba(0,255,198,0.45)", textDecoration: "none" }}>Aviso legal</a>
        </p>
      </div>

      {/* ── Results (only shown after analysis) ── */}
      <div ref={resultRef} className="w-full scroll-mt-4">
        {isAnalyzing ? (
          <ScanningAnimation isAnalyzing={isAnalyzing} waitingMessage={rateLimitMessage} />
        ) : showReport && reportData ? (
          <AnimatePresence>
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            >
              {/* ── Premium Risk Score Card ── */}
              {(() => {
                // ── Priority: BLACKLIST/FROZEN > FREEZE PREDICTION >= 60 > RAW
                const isConfirmedFrozen = !!(reportData.isFrozen || reportData.isInBlacklistDB);
                const rawScore = computeRiskScore(reportData);

                // Compute freeze prediction only when not confirmed frozen
                let freeze: CongelamientoResult | null = null;
                if (!isConfirmedFrozen) {
                  const dateCreated = reportData.dateCreated ?? Date.now();
                  const walletAgeDays = (Date.now() - dateCreated) / 86_400_000;
                  freeze = calcularRiesgoCongelamiento({
                    walletAgeDays,
                    totalVolume:         (reportData.totalInUSDT  + reportData.totalOutUSDT) || 0,
                    txCount:              reportData.totalTx              || 0,
                    exchangeInteraction:  reportData.exchangeInteractions || 0,
                    isLinkedToRiskWallet: (reportData.suspiciousInteractions || 0) > 0,
                  });
                }

                const isLatente = !isConfirmedFrozen && freeze?.nivel === "LATENTE";

                // Unified final score
                let score: number;
                if (isConfirmedFrozen) {
                  score = 100;
                } else if (freeze && freeze.score >= 60) {
                  score = Math.max(rawScore, freeze.score);
                } else {
                  score = rawScore;
                }

                const { label, color, bg } = getScoreCardConfig(score, isLatente);
                return (
                  <div className="rounded-3xl p-6 mb-4"
                    style={{
                      background: bg,
                      border: `1px solid ${color}30`,
                      boxShadow: `0 8px 40px ${color}18`,
                    }}>

                    {/* Shield + score centred */}
                    <div className="flex flex-col items-center text-center mb-5">
                      {/* Icon container */}
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl mb-4"
                        style={{
                          background: `${color}18`,
                          border: `1px solid ${color}40`,
                          boxShadow: `0 0 24px ${color}22`,
                        }}>
                        <Shield style={{ color, width: 26, height: 26 }} />
                      </div>

                      {/* Label */}
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] mb-2.5"
                        style={{ color: "rgba(255,255,255,0.38)" }}>
                        RISK SCORE
                      </p>

                      {/* Big number */}
                      <div className="flex items-end leading-none mb-4">
                        <span className="font-black" style={{ fontSize: 72, color, lineHeight: 1 }}>
                          {score}
                        </span>
                        <span className="font-bold mb-1 ml-0.5" style={{ fontSize: 24, color: "rgba(255,255,255,0.28)" }}>
                          /100
                        </span>
                      </div>

                      {/* Badge */}
                      <span className="inline-flex items-center px-4 py-1.5 rounded-full text-sm font-bold"
                        style={{
                          background: `${color}1A`,
                          border: `1px solid ${color}50`,
                          color,
                          letterSpacing: "0.01em",
                        }}>
                        {label}
                      </span>
                    </div>

                    {/* ── Risk recommendation inline ── */}
                    {(() => {
                      const rm = getRiskMessage(score, isLatente);
                      return (
                        <div
                          className="rounded-xl px-4 py-3 mb-5"
                          style={{
                            background: `${rm.color}18`,
                            border: `1px solid ${rm.color}55`,
                            borderLeft: `4px solid ${rm.color}`,
                          }}
                        >
                          <div className="flex items-start gap-2.5">
                            <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>{rm.icono}</span>
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: rm.color }}>
                                Recomendación · Nivel {rm.nivel}
                              </p>
                              <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.8)" }}>
                                {rm.mensaje}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Divider */}
                    <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", marginBottom: 16 }} />

                    {/* Wallet Address row */}
                    <p className="text-[9px] font-bold uppercase tracking-[0.18em] mb-2"
                      style={{ color: "rgba(255,255,255,0.28)" }}>
                      WALLET ADDRESS
                    </p>
                    <div className="flex items-center justify-between rounded-xl px-4 py-3"
                      style={{
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}>
                      <span className="text-sm font-mono text-white" style={{ letterSpacing: "0.04em" }}>
                        {reportData.address.slice(0, 8)}...{reportData.address.slice(-4)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyAddress(reportData.address)}
                        className="flex items-center justify-center rounded-lg transition-opacity active:opacity-60"
                        style={{
                          width: 32, height: 32,
                          background: "rgba(255,255,255,0.06)",
                          border: "1px solid rgba(255,255,255,0.1)",
                        }}>
                        {copiedAddress
                          ? <CheckCheck style={{ width: 14, height: 14, color: GREEN }} />
                          : <Copy style={{ width: 14, height: 14, color: "rgba(255,255,255,0.5)" }} />}
                      </button>
                    </div>

                    {/* ── Share button ── */}
                    <button
                      type="button"
                      onClick={generarImagen}
                      disabled={sharingImage}
                      className="flex items-center justify-center gap-2 w-full rounded-xl mt-3 font-bold transition-opacity active:opacity-70"
                      style={{
                        padding: "11px 0",
                        background: sharingImage
                          ? "rgba(0,255,198,0.06)"
                          : "linear-gradient(135deg,rgba(0,255,198,0.14) 0%,rgba(0,184,169,0.08) 100%)",
                        border: "1px solid rgba(0,255,198,0.3)",
                        color: "#00FFC6",
                        fontSize: 13,
                        letterSpacing: "0.03em",
                        cursor: sharingImage ? "not-allowed" : "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      {sharingImage ? (
                        <>
                          <Loader2 style={{ width: 15, height: 15, animation: "spin 1s linear infinite" }} />
                          Generando imagen…
                        </>
                      ) : (
                        <>📤 Compartir análisis</>
                      )}
                    </button>
                  </div>
                );
              })()}

              {/* ── 2×2 Detail cards ── */}
              {(() => {
                const isActive = reportData.totalTx > 0 || reportData.balanceTRX > 0 || reportData.balanceUSDT > 0;
                const cards = [
                  {
                    Icon: Activity,
                    label: "NETWORK",
                    value: "TRON",
                    valueColor: "rgba(255,255,255,0.9)",
                  },
                  {
                    Icon: Activity,
                    label: "STATUS",
                    value: isActive ? "Activo" : "Inactivo",
                    valueColor: isActive ? GREEN : AMBER,
                    dot: true,
                    dotColor: isActive ? GREEN : AMBER,
                  },
                  {
                    Icon: Zap,
                    label: "TRX BALANCE",
                    value: `${reportData.balanceTRX.toFixed(2)} TRX`,
                    valueColor: "rgba(255,255,255,0.9)",
                  },
                  {
                    Icon: Hash,
                    label: "TX COUNT",
                    value: String(reportData.totalTx),
                    valueColor: "rgba(255,255,255,0.9)",
                  },
                ];
                return (
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    {cards.map(({ Icon, label, value, valueColor, dot, dotColor }) => (
                      <div key={label} className="rounded-2xl p-4"
                        style={{
                          background: "linear-gradient(135deg,#141A24 0%,#0D1117 100%)",
                          border: "1px solid rgba(255,255,255,0.07)",
                          boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
                        }}>
                        {/* Icon + label row */}
                        <div className="flex items-center gap-1.5 mb-2.5">
                          <Icon style={{ width: 11, height: 11, color: "rgba(255,255,255,0.35)" }} />
                          <span className="text-[9px] font-bold uppercase tracking-[0.16em]"
                            style={{ color: "rgba(255,255,255,0.35)" }}>
                            {label}
                          </span>
                        </div>
                        {/* Value */}
                        <div className="flex items-center gap-1.5">
                          {dot && (
                            <span className="inline-block rounded-full"
                              style={{ width: 7, height: 7, background: dotColor, boxShadow: `0 0 6px ${dotColor}` }} />
                          )}
                          <span className="text-base font-bold" style={{ color: valueColor }}>
                            {value}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* ── Full analysis report ── */}
              <TronAnalysisReport reportData={reportData} />

              {/* ── Predicción / Estado de congelamiento ── */}
              {(() => {
                // ── PRIORIDAD MÁXIMA: Wallet ya congelada o en blacklist ─────────
                const isConfirmedFrozen = !!(reportData?.isFrozen || reportData?.isInBlacklistDB);

                if (isConfirmedFrozen) {
                  // Mostrar estado confirmado — NO mostrar predicción
                  return (
                    <div style={{
                      margin: "16px 0 0",
                      borderRadius: 16,
                      border: "1px solid rgba(255,77,79,0.4)",
                      background: "rgba(255,77,79,0.07)",
                      overflow: "hidden",
                    }}>
                      {/* Header */}
                      <div style={{
                        padding: "14px 18px",
                        borderBottom: "1px solid rgba(255,77,79,0.25)",
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                      }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.92)" }}>
                          🔴 Estado de congelamiento
                        </span>
                        <span style={{
                          padding: "3px 12px", borderRadius: 20,
                          background: "#ff4d4f", color: "#fff",
                          fontSize: 12, fontWeight: 800, letterSpacing: "0.06em",
                        }}>
                          SEVERO
                        </span>
                      </div>

                      {/* Cuerpo confirmado */}
                      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
                        <div style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          background: "rgba(255,77,79,0.12)", borderRadius: 10, padding: "10px 14px",
                        }}>
                          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.75)" }}>Estado</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#ff4d4f" }}>
                            🔒 Wallet bloqueada
                          </span>
                        </div>
                        <div style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          background: "rgba(255,77,79,0.12)", borderRadius: 10, padding: "10px 14px",
                        }}>
                          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.75)" }}>Riesgo de congelamiento</span>
                          <span style={{
                            fontFamily: "monospace", fontSize: 13, fontWeight: 800, color: "#ff4d4f",
                          }}>
                            100/100 — Confirmado
                          </span>
                        </div>
                        <p style={{
                          margin: 0, fontSize: 12, color: "rgba(255,255,255,0.5)",
                          lineHeight: 1.55,
                        }}>
                          Esta wallet {reportData?.isFrozen ? "está congelada en la red TRON" : "figura en la lista negra de TRON"}. Los fondos pueden estar bloqueados permanentemente. No interactúes con ella.
                        </p>
                      </div>
                    </div>
                  );
                }

                // ── Solo calcular predicción si NO está congelada ni en blacklist ─
                const dateCreated          = reportData?.dateCreated          ?? Date.now();
                const totalInUSDT          = reportData?.totalInUSDT          ?? 0;
                const totalOutUSDT         = reportData?.totalOutUSDT         ?? 0;
                const totalTx              = reportData?.totalTx              ?? 0;
                const exchangeInteractions = reportData?.exchangeInteractions ?? 0;
                const suspiciousInteractions = reportData?.suspiciousInteractions ?? 0;

                const walletAgeDays = (Date.now() - dateCreated) / 86_400_000;
                const prediccion = calcularRiesgoCongelamiento({
                  walletAgeDays:        walletAgeDays        || 0,
                  totalVolume:          (totalInUSDT + totalOutUSDT) || 0,
                  txCount:              totalTx              || 0,
                  exchangeInteraction:  exchangeInteractions || 0,
                  isLinkedToRiskWallet: suspiciousInteractions > 0,
                });

                const nivelColor =
                  prediccion.nivel === "ALTO"  ? "#ff4d4f" :
                  prediccion.nivel === "MEDIO" ? "#fa8c16" :
                                                 "#52c41a";
                const nivelBg =
                  prediccion.nivel === "ALTO"  ? "rgba(255,77,79,0.08)"  :
                  prediccion.nivel === "MEDIO" ? "rgba(250,140,22,0.08)" :
                                                 "rgba(82,196,26,0.08)";
                const nivelBorder =
                  prediccion.nivel === "ALTO"  ? "rgba(255,77,79,0.25)"  :
                  prediccion.nivel === "MEDIO" ? "rgba(250,140,22,0.25)" :
                                                 "rgba(82,196,26,0.25)";

                return (
                  <div style={{
                    margin: "16px 0 0",
                    borderRadius: 16,
                    border: `1px solid ${nivelBorder}`,
                    background: nivelBg,
                    overflow: "hidden",
                  }}>
                    {/* Header */}
                    <div style={{
                      padding: "14px 18px",
                      borderBottom: `1px solid ${nivelBorder}`,
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                    }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.92)" }}>
                        ⚠️ Predicción de congelamiento
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{
                          fontFamily: "monospace", fontSize: 13, fontWeight: 700,
                          color: "rgba(255,255,255,0.45)",
                        }}>
                          {prediccion.score}/100
                        </span>
                        <span style={{
                          padding: "3px 12px", borderRadius: 20,
                          background: nivelColor, color: "#fff",
                          fontSize: 12, fontWeight: 800, letterSpacing: "0.06em",
                        }}>
                          {prediccion.nivel}
                        </span>
                      </div>
                    </div>

                    {/* Motivos */}
                    <div style={{ padding: "14px 18px" }}>
                      {prediccion.motivos.length === 0 ? (
                        <p style={{ margin: 0, fontSize: 13, color: "#52c41a" }}>
                          ✓ Sin factores de riesgo de congelamiento detectados
                        </p>
                      ) : (
                        <>
                          <p style={{ margin: "0 0 10px", fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                            Factores detectados
                          </p>
                          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 7 }}>
                            {prediccion.motivos.map((m, i) => (
                              <li key={i} style={{
                                display: "flex", alignItems: "center", gap: 9,
                                fontSize: 13, color: "rgba(255,255,255,0.82)",
                              }}>
                                <span style={{
                                  width: 6, height: 6, borderRadius: "50%",
                                  background: nivelColor, flexShrink: 0,
                                }} />
                                {m}
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  </div>
                );
              })()}
            </motion.div>
          </AnimatePresence>
        ) : null}
      </div>

      <QRScannerDialog
        open={isScannerOpen}
        onOpenChange={setIsScannerOpen}
        onScanSuccess={handleScanSuccess}
      />

      {/* ── Hidden Share Card (rendered off-screen for html2canvas capture) ── */}
      {reportData && (() => {
        const isConfirmedFrozen = !!(reportData.isFrozen || reportData.isInBlacklistDB);
        const rawScore = computeRiskScore(reportData);
        let freeze: CongelamientoResult | null = null;
        if (!isConfirmedFrozen) {
          const dateCreated = reportData.dateCreated ?? Date.now();
          const walletAgeDays = (Date.now() - dateCreated) / 86_400_000;
          freeze = calcularRiesgoCongelamiento({
            walletAgeDays,
            totalVolume:         (reportData.totalInUSDT  + reportData.totalOutUSDT) || 0,
            txCount:              reportData.totalTx              || 0,
            exchangeInteraction:  reportData.exchangeInteractions || 0,
            isLinkedToRiskWallet: (reportData.suspiciousInteractions || 0) > 0,
          });
        }
        const isLatente = !isConfirmedFrozen && freeze?.nivel === "LATENTE";
        let sc = isConfirmedFrozen ? 100 : freeze && freeze.score >= 60 ? Math.max(rawScore, freeze.score) : rawScore;
        const { label: scLabel, color: scColor } = getScoreCardConfig(sc, isLatente);

        // Derived display values
        const freezeNivel   = isConfirmedFrozen ? "ALTO" : (freeze?.nivel ?? "BAJO");
        const freezeScore   = isConfirmedFrozen ? 100    : (freeze?.score ?? 0);
        const motivosList   = isConfirmedFrozen
          ? ["Wallet congelada o en lista negra"]
          : (freeze?.motivos ?? []).slice(0, 3);

        const ultimaActividad = reportData.lastTxDate
          ? new Date(reportData.lastTxDate).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })
          : "Sin actividad registrada";

        const confianzaRaw = (reportData.transfersAnalyzed ?? 0) > 50
          ? "Alta" : (reportData.transfersAnalyzed ?? 0) > 10
          ? "Media" : "Baja";
        const confianzaColor = confianzaRaw === "Alta" ? GREEN : confianzaRaw === "Media" ? AMBER : ORANGE;

        const freezeColor =
          freezeNivel === "ALTO"    ? DANGER  :
          freezeNivel === "MEDIO"   ? ORANGE  :
          freezeNivel === "LATENTE" ? AMBER   : GREEN;

        const cardBg = sc >= 80 ? "#130303" : sc >= 60 ? "#140b02" : sc >= 30 ? "#111000" : "#001510";
        const accentColor = scColor;

        return (
          <div
            ref={shareCardRef}
            style={{
              position: "fixed", left: "-9999px", top: 0, zIndex: -1,
              width: 380, padding: "26px 22px 22px",
              background: cardBg, borderRadius: 24,
              border: `1.5px solid ${accentColor}35`,
              fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
              overflow: "hidden",
            }}
          >
            {/* Corner glow */}
            <div style={{
              position: "absolute", top: -50, right: -50,
              width: 180, height: 180, borderRadius: "50%",
              background: `radial-gradient(circle, ${accentColor}1E 0%, transparent 68%)`,
              pointerEvents: "none",
            }} />

            {/* ── HEADER ── */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 19, fontWeight: 800, color: "#FFFFFF", letterSpacing: "-0.01em" }}>
                  Coin<span style={{ color: "#00FFC6" }}>Cash</span>
                </div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.32)", fontWeight: 600, letterSpacing: "0.17em", marginTop: 2 }}>
                  TRON WALLET SECURITY
                </div>
              </div>
              <div style={{
                background: `${accentColor}18`, border: `1px solid ${accentColor}48`,
                borderRadius: 10, padding: "4px 11px",
                fontSize: 9, fontWeight: 700, color: accentColor, letterSpacing: "0.06em",
              }}>SCAN RESULT</div>
            </div>

            {/* ── CRITICAL ALERT banner (score > 80) ── */}
            {sc > 80 && (
              <div style={{
                background: "rgba(220,20,20,0.13)", border: "1.5px solid rgba(255,60,60,0.45)",
                borderRadius: 12, padding: "10px 14px", marginBottom: 16,
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>🚫</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 900, color: "#FF4040", letterSpacing: "0.04em" }}>
                    NO ENVÍES FONDOS
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", marginTop: 2, lineHeight: 1.4 }}>
                    Esta wallet presenta riesgo severo confirmado
                  </div>
                </div>
              </div>
            )}

            {/* ── SCORE ── */}
            <div style={{ textAlign: "center", marginBottom: 18 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: "0.22em", marginBottom: 6 }}>
                RISK SCORE
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", lineHeight: 1, marginBottom: 10 }}>
                <span style={{ fontSize: 82, fontWeight: 900, color: accentColor, lineHeight: 1 }}>{sc}</span>
                <span style={{ fontSize: 26, fontWeight: 700, color: "rgba(255,255,255,0.22)", marginBottom: 5, marginLeft: 2 }}>/100</span>
              </div>
              <div style={{
                display: "inline-flex", alignItems: "center",
                padding: "6px 16px", borderRadius: 28,
                background: `${accentColor}18`, border: `1px solid ${accentColor}50`,
                color: accentColor, fontSize: 13, fontWeight: 700, letterSpacing: "0.02em",
              }}>{scLabel}</div>
            </div>

            {/* ── DIVIDER ── */}
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", margin: "0 0 14px" }} />

            {/* ── WALLET ADDRESS ── */}
            <div style={{
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 11, padding: "10px 13px", marginBottom: 14,
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.28)", letterSpacing: "0.18em", marginBottom: 4 }}>
                WALLET · TRON TRC20
              </div>
              <div style={{ fontSize: 11, fontFamily: "monospace", color: "#D1D5DB", letterSpacing: "0.04em", wordBreak: "break-all" }}>
                {reportData.address}
              </div>
            </div>

            {/* ── STATS ROW ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 7, marginBottom: 14 }}>
              {[
                { label: "TX TOTAL",  value: String(reportData.totalTx) },
                { label: "USDT IN",   value: `$${(reportData.totalInUSDT  || 0).toFixed(0)}` },
                { label: "USDT OUT",  value: `$${(reportData.totalOutUSDT || 0).toFixed(0)}` },
              ].map((item, i) => (
                <div key={i} style={{
                  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 9, padding: "9px 0", textAlign: "center",
                }}>
                  <div style={{ fontSize: 8, color: "rgba(255,255,255,0.28)", fontWeight: 700, letterSpacing: "0.13em", marginBottom: 4 }}>
                    {item.label}
                  </div>
                  <div style={{ fontSize: 13, color: "#F3F4F6", fontWeight: 700 }}>{item.value}</div>
                </div>
              ))}
            </div>

            {/* ── DIVIDER ── */}
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", margin: "0 0 14px" }} />

            {/* ── FREEZE RISK + MOTIVOS ── */}
            <div style={{
              background: `${freezeColor}0E`, border: `1px solid ${freezeColor}30`,
              borderRadius: 11, padding: "11px 13px", marginBottom: 12,
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: "0.15em" }}>
                  RIESGO CONGELAMIENTO
                </div>
                <div style={{
                  background: `${freezeColor}22`, border: `1px solid ${freezeColor}50`,
                  borderRadius: 6, padding: "2px 8px",
                  fontSize: 9, fontWeight: 800, color: freezeColor, letterSpacing: "0.06em",
                }}>
                  {freezeNivel} · {freezeScore}/100
                </div>
              </div>
              {motivosList.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {motivosList.map((m, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 5, height: 5, borderRadius: "50%", background: freezeColor, flexShrink: 0 }} />
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.62)", lineHeight: 1.4 }}>{m}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── LAST ACTIVITY + CONFIDENCE ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 14 }}>
              <div style={{
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 10, padding: "10px 12px",
              }}>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.28)", fontWeight: 700, letterSpacing: "0.12em", marginBottom: 5 }}>
                  ÚLTIMA ACTIVIDAD
                </div>
                <div style={{ fontSize: 11, color: "#E5E7EB", fontWeight: 600, lineHeight: 1.3 }}>{ultimaActividad}</div>
              </div>
              <div style={{
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 10, padding: "10px 12px",
              }}>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.28)", fontWeight: 700, letterSpacing: "0.12em", marginBottom: 5 }}>
                  NIVEL CONFIANZA
                </div>
                <div style={{ fontSize: 11, color: confianzaColor, fontWeight: 700 }}>● {confianzaRaw}</div>
              </div>
            </div>

            {/* ── FOOTER ── */}
            <div style={{
              background: sc > 80 ? "rgba(220,20,20,0.08)" : "rgba(0,255,198,0.06)",
              border: `1px solid ${sc > 80 ? "rgba(255,60,60,0.2)" : "rgba(0,255,198,0.18)"}`,
              borderRadius: 11, padding: "10px 14px", textAlign: "center",
            }}>
              <div style={{ fontSize: 11, color: sc > 80 ? "#FF5555" : "#00FFC6", fontWeight: 700, marginBottom: 2 }}>
                {sc > 80 ? "🚫 Verifica antes de interactuar con esta wallet" : "✅ Verifica siempre antes de enviar fondos"}
              </div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.32)", letterSpacing: "0.05em" }}>
                coincash.app · Seguridad TRON en tiempo real
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default WalletAnalyzer;
