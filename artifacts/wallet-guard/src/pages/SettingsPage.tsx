import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import { Camera, Bell, BellOff, Check, Copy, Headphones, ChevronRight, Trash2, RotateCcw } from "lucide-react";
import { API_BASE } from "@/lib/apiConfig";
import { resetDeviceId } from "@/lib/identity";
import { useFreemium } from "@/context/FreemiumContext";

const TEAL   = "#00FFC6";
const BG     = "#0B0F14";
const CARD   = "#0B1220";
const BORDER = "rgba(255,255,255,0.07)";
const TEXT   = "rgba(255,255,255,0.9)";
const MUTED  = "rgba(255,255,255,0.45)";

function getCcId(): string {
  let id = localStorage.getItem("coincash-cc-id");
  if (!id) {
    const digits = Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");
    id = `CC-${digits}`;
    localStorage.setItem("coincash-cc-id", id);
  }
  return id;
}

async function uploadFile(file: File): Promise<string> {
  const r = await fetch(`${API_BASE}/storage/uploads/request-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
  });
  if (!r.ok) throw new Error("Error al subir");
  const { uploadURL, objectPath } = await r.json();
  await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
  return objectPath as string;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const arr     = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
  return arr;
}

export default function SettingsPage({ onOpenSupport }: { onOpenSupport?: () => void }) {
  const [photoUrl,     setPhotoUrl]     = useState<string | null>(() => localStorage.getItem("coincash-profile-photo"));
  const [photoStored,  setPhotoStored]  = useState<boolean>(() => !!localStorage.getItem("coincash-profile-photo"));
  const [uploading,    setUploading]    = useState(false);
  const [pushEnabled,  setPushEnabled]  = useState(false);
  const [pushLoading,  setPushLoading]  = useState(false);
  const [pushSupport,  setPushSupport]  = useState(true);
  const [saved,        setSaved]        = useState(false);
  const [copiedId,     setCopiedId]     = useState(false);

  // ── Freemium shared context ───────────────────────────────────────────────
  const { ccId, freemium, paymentStatus, requestPayment } = useFreemium();
  const userPlan = freemium.plan;

  // ── PRO upgrade ──────────────────────────────────────────────────────────
  const PRO_ADDRESS = "TM2cRRegda1gQAQY9hGbg6DMscN7okNVA1";
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
  const [proQr,         setProQr]         = useState<string>("");
  const [copiedAddr,    setCopiedAddr]    = useState(false);
  const [upgradeEmail,  setUpgradeEmail]  = useState("");
  const [upgradeSending, setUpgradeSending] = useState(false);
  const [selectedPlan,  setSelectedPlan]  = useState<{ name: string; price: string }>({ name: "Pro", price: "19.99" });
  const [planToast, setPlanToast] = useState<{ msg: string; type: "pro" | "free" } | null>(null);

  // Show in-page toast banner whenever paymentStatus transitions
  const prevPaymentStatusRef = useRef(paymentStatus);
  useEffect(() => {
    const prev = prevPaymentStatusRef.current;
    prevPaymentStatusRef.current = paymentStatus;
    if (prev === paymentStatus) return;
    if (paymentStatus === "confirmed") {
      setPlanToast({ msg: "🎉 ¡Plan PRO activado! Ya tienes acceso completo.", type: "pro" });
      setTimeout(() => setPlanToast(null), 7000);
    } else if (paymentStatus === "none" && (prev === "pending" || prev === "confirmed")) {
      setPlanToast({ msg: "⚠️ Tu plan PRO ha sido desactivado. Si ya pagaste, presiona \"Ya pagué\" nuevamente.", type: "free" });
      setTimeout(() => setPlanToast(null), 7000);
    }
  }, [paymentStatus]);

  const [visitStats, setVisitStats] = useState<{ total: number; today: number; online: number; countries: { name: string; code: string; count: number }[] } | null>(null);
  const [deviceReset, setDeviceReset] = useState(false);

  // Crop modal state
  const [cropSrc,        setCropSrc]        = useState<string | null>(null);
  const [cropOffset,     setCropOffset]     = useState({ x: 0, y: 0 });
  const [cropScale,      setCropScale]      = useState(1);
  const [cropImgNatural, setCropImgNatural] = useState({ w: 300, h: 300 });

  const fileRef       = useRef<HTMLInputElement>(null);
  const cropCanvasRef = useRef<HTMLCanvasElement>(null);
  const cropDragRef   = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  const cropPinchRef  = useRef<{ dist: number; scale: number } | null>(null);

  // Fetch visit stats
  useEffect(() => {
    fetch(`${API_BASE}/visit/stats`)
      .then(r => r.json())
      .then(d => setVisitStats(d))
      .catch(() => {});
  }, []);

  // Generate PRO payment QR
  useEffect(() => {
    QRCode.toDataURL(PRO_ADDRESS, { width: 200, margin: 2, color: { dark: "#000000", light: "#FFFFFF" } })
      .then(setProQr).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch daysRemaining (extra field not in context) whenever ccId is ready
  useEffect(() => {
    if (!ccId) return;
    const fetch30 = () => {
      fetch(`${API_BASE}/freemium/status?ccId=${encodeURIComponent(ccId)}`)
        .then(r => r.json())
        .then(d => setDaysRemaining(typeof d.daysRemaining === "number" ? d.daysRemaining : null))
        .catch(() => {});
    };
    fetch30();
    const t = setInterval(fetch30, 30_000);
    return () => clearInterval(t);
  }, [ccId]);

  // Check push permission on mount
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushSupport(false);
      return;
    }
    const stored = localStorage.getItem("coincash-push-enabled");
    if (stored === "true") setPushEnabled(true);
  }, []);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { alert("Solo se permiten imágenes"); return; }
    if (fileRef.current) fileRef.current.value = "";
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const CROP = 260;
        const minDim = Math.min(img.naturalWidth, img.naturalHeight);
        setCropImgNatural({ w: img.naturalWidth, h: img.naturalHeight });
        setCropScale(CROP / minDim);
        setCropOffset({ x: 0, y: 0 });
        setCropSrc(src);
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  }

  async function confirmCrop() {
    if (!cropSrc) return;
    const CROP = 260;
    const canvas = cropCanvasRef.current!;
    canvas.width = CROP;
    canvas.height = CROP;
    const ctx = canvas.getContext("2d")!;
    const img = new Image();
    img.onload = async () => {
      ctx.clearRect(0, 0, CROP, CROP);
      ctx.save();
      ctx.beginPath();
      ctx.arc(CROP / 2, CROP / 2, CROP / 2, 0, Math.PI * 2);
      ctx.clip();
      const drawW = cropImgNatural.w * cropScale;
      const drawH = cropImgNatural.h * cropScale;
      ctx.drawImage(img, CROP / 2 + cropOffset.x - drawW / 2, CROP / 2 + cropOffset.y - drawH / 2, drawW, drawH);
      ctx.restore();
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        setCropSrc(null);
        setUploading(true);
        try {
          const f = new File([blob], "profile.jpg", { type: "image/jpeg" });
          const objectPath = await uploadFile(f);
          const url = `${API_BASE}/storage${objectPath}`;
          localStorage.setItem("coincash-profile-photo", url);
          setPhotoUrl(url);
          setPhotoStored(true);
          flashSaved();
          // Sync photo to backend so admin can see it in the chat
          const storedCcId = localStorage.getItem("coincash-cc-id");
          if (storedCcId) {
            fetch(`${API_BASE}/chat/update-photo`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ coincashId: storedCcId, photoUrl: url }),
            }).catch(() => {});
          }
        } catch { alert("No se pudo subir la foto"); }
        finally { setUploading(false); }
      }, "image/jpeg", 0.9);
    };
    img.src = cropSrc;
  }

  function onCropTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 1) {
      cropDragRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, ox: cropOffset.x, oy: cropOffset.y };
      cropPinchRef.current = null;
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      cropPinchRef.current = { dist: Math.hypot(dx, dy), scale: cropScale };
      cropDragRef.current = null;
    }
  }
  function onCropTouchMove(e: React.TouchEvent) {
    e.preventDefault();
    if (e.touches.length === 1 && cropDragRef.current) {
      setCropOffset({ x: cropDragRef.current.ox + e.touches[0].clientX - cropDragRef.current.startX, y: cropDragRef.current.oy + e.touches[0].clientY - cropDragRef.current.startY });
    } else if (e.touches.length === 2 && cropPinchRef.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      setCropScale(Math.max(0.3, Math.min(6, cropPinchRef.current.scale * (Math.hypot(dx, dy) / cropPinchRef.current.dist))));
    }
  }
  function onCropTouchEnd() { cropDragRef.current = null; cropPinchRef.current = null; }
  function onCropMouseDown(e: React.MouseEvent) { cropDragRef.current = { startX: e.clientX, startY: e.clientY, ox: cropOffset.x, oy: cropOffset.y }; }
  function onCropMouseMove(e: React.MouseEvent) {
    if (!cropDragRef.current) return;
    setCropOffset({ x: cropDragRef.current.ox + e.clientX - cropDragRef.current.startX, y: cropDragRef.current.oy + e.clientY - cropDragRef.current.startY });
  }
  function onCropMouseUp() { cropDragRef.current = null; }
  function onCropWheel(e: React.WheelEvent) { e.preventDefault(); setCropScale(s => Math.max(0.3, Math.min(6, s - e.deltaY * 0.002))); }

  function removePhoto() {
    localStorage.removeItem("coincash-profile-photo");
    setPhotoUrl(null);
    setPhotoStored(false);
    flashSaved();
  }

  function flashSaved() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function togglePush() {
    if (pushLoading) return;
    setPushLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;

      if (pushEnabled) {
        // Unsubscribe
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await fetch(`${API_BASE}/push/subscribe`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ccId, endpoint: sub.endpoint }),
          });
          await sub.unsubscribe();
        }
        localStorage.setItem("coincash-push-enabled", "false");
        setPushEnabled(false);
      } else {
        // Subscribe — first get VAPID public key
        const keyRes = await fetch(`${API_BASE}/push/vapid-key`);
        const { publicKey } = await keyRes.json();

        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          alert("Permiso de notificaciones denegado. Actívalo en la configuración del navegador.");
          return;
        }

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly:      true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });

        await fetch(`${API_BASE}/push/subscribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ccId, subscription: sub.toJSON() }),
        });
        localStorage.setItem("coincash-push-enabled", "true");
        setPushEnabled(true);
        flashSaved();
      }
    } catch (err: any) {
      console.error("Push toggle error:", err);
      alert("No se pudo configurar las notificaciones: " + (err?.message ?? "error desconocido"));
    } finally {
      setPushLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: BG, color: TEXT, fontFamily: "'Inter',sans-serif", paddingBottom: 80 }}>

      {/* ── Plan-change toast ── */}
      {planToast && (
        <div style={{
          position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
          zIndex: 9999, maxWidth: 340, width: "calc(100% - 32px)",
          background: planToast.type === "pro" ? "#0D2D1F" : "#1A0D0D",
          border: `1px solid ${planToast.type === "pro" ? "rgba(0,255,198,0.4)" : "rgba(255,80,80,0.4)"}`,
          borderRadius: 14, padding: "13px 16px",
          boxShadow: `0 8px 40px ${planToast.type === "pro" ? "rgba(0,255,198,0.15)" : "rgba(255,80,80,0.15)"}`,
          display: "flex", alignItems: "flex-start", gap: 10,
          animation: "slideDown 0.3s ease",
        }}>
          <span style={{ fontSize: 15, lineHeight: 1 }}>{planToast.type === "pro" ? "🎉" : "⚠️"}</span>
          <p style={{ margin: 0, fontSize: 12, color: planToast.type === "pro" ? "#00FFC6" : "#FF6B6B", lineHeight: 1.6, flex: 1 }}>
            {planToast.msg}
          </p>
          <button
            onClick={() => setPlanToast(null)}
            style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 16, cursor: "pointer", padding: 0, lineHeight: 1 }}
          >×</button>
        </div>
      )}

      {/* Crop modal */}
      {cropSrc && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.93)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
          <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#fff" }}>Ajusta tu foto</p>
          <p style={{ margin: "-12px 0 0", fontSize: 12, color: MUTED }}>Arrastra · Pellizca para hacer zoom</p>

          {/* Circular crop area */}
          <div
            style={{ width: 260, height: 260, borderRadius: "50%", overflow: "hidden", border: `3px solid ${TEAL}`, position: "relative", cursor: "grab", userSelect: "none", touchAction: "none", boxShadow: `0 0 0 9999px rgba(0,0,0,0.6)` }}
            onTouchStart={onCropTouchStart}
            onTouchMove={onCropTouchMove}
            onTouchEnd={onCropTouchEnd}
            onMouseDown={onCropMouseDown}
            onMouseMove={onCropMouseMove}
            onMouseUp={onCropMouseUp}
            onMouseLeave={onCropMouseUp}
            onWheel={onCropWheel}
          >
            <img
              src={cropSrc}
              alt="crop"
              draggable={false}
              style={{
                position: "absolute", top: "50%", left: "50%",
                transform: `translate(-50%, -50%) translate(${cropOffset.x}px, ${cropOffset.y}px) scale(${cropScale})`,
                transformOrigin: "center", pointerEvents: "none", maxWidth: "none",
              }}
            />
          </div>

          {/* Zoom slider */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, width: 240 }}>
            <span style={{ fontSize: 12, color: MUTED }}>−</span>
            <input type="range" min={0.3} max={6} step={0.01} value={cropScale}
              onChange={e => setCropScale(parseFloat(e.target.value))}
              style={{ flex: 1, accentColor: TEAL }} />
            <span style={{ fontSize: 12, color: MUTED }}>+</span>
          </div>

          {/* Buttons */}
          <div style={{ display: "flex", gap: 12 }}>
            <button onClick={() => setCropSrc(null)} style={{ padding: "12px 28px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.2)", background: "transparent", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
              Cancelar
            </button>
            <button onClick={confirmCrop} style={{ padding: "12px 28px", borderRadius: 12, border: "none", background: TEAL, color: "#0B1220", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
              Confirmar
            </button>
          </div>
          <canvas ref={cropCanvasRef} style={{ display: "none" }} />
        </div>
      )}

      {/* Header */}
      <div style={{ background: CARD, borderBottom: `1px solid ${BORDER}`, padding: "20px 16px 16px" }}>
        <p style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Ajustes</p>
      </div>

      {/* Profile photo */}
      <div style={{ padding: "24px 16px 0" }}>
        <p style={{ margin: "0 0 12px", fontSize: 12, color: MUTED, textTransform: "uppercase", letterSpacing: "0.08em" }}>Foto de perfil</p>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* Avatar */}
          <div
            onClick={() => fileRef.current?.click()}
            style={{ position: "relative", width: 72, height: 72, borderRadius: "50%", cursor: "pointer", flexShrink: 0, border: `2px solid ${TEAL}` }}
          >
            {photoUrl ? (
              <img src={photoUrl} alt="Perfil" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} onError={() => { setPhotoUrl(null); }} />
            ) : (
              <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: "linear-gradient(135deg,#00FFC6,#0080FF)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 800, color: "#0B1220" }}>
                {ccId.slice(-2)}
              </div>
            )}
            <div style={{ position: "absolute", bottom: 0, right: 0, width: 22, height: 22, borderRadius: "50%", background: TEAL, display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${BG}` }}>
              <Camera size={12} style={{ color: "#0B1220" }} />
            </div>
          </div>

          <div style={{ flex: 1 }}>
            {/* CC-ID prominently shown in the user section */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 800, color: TEAL, letterSpacing: "0.04em" }}>
                {ccId}
              </span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(ccId).then(() => {
                    setCopiedId(true);
                    setTimeout(() => setCopiedId(false), 2000);
                  });
                }}
                style={{
                  background: copiedId ? "rgba(0,255,198,0.15)" : "rgba(255,255,255,0.06)",
                  border: `1px solid ${copiedId ? "rgba(0,255,198,0.4)" : BORDER}`,
                  borderRadius: 6, padding: "4px 9px", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 4,
                  color: copiedId ? TEAL : MUTED, fontSize: 11, fontWeight: 600,
                  transition: "all 0.2s", flexShrink: 0,
                }}
              >
                {copiedId ? <Check size={11} /> : <Copy size={11} />}
                {copiedId ? "Copiado" : "Copiar"}
              </button>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: MUTED }}>
              Toca el círculo para cambiar tu foto
            </p>
            {uploading && <p style={{ margin: "4px 0 0", fontSize: 12, color: TEAL }}>Subiendo...</p>}

            {/* Delete button — visible when there's a stored photo (even if broken) */}
            {photoStored && !uploading && (
              <button
                onClick={removePhoto}
                style={{
                  marginTop: 8, display: "flex", alignItems: "center", gap: 6,
                  background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
                  borderRadius: 8, padding: "6px 12px", cursor: "pointer",
                  color: "rgb(248,113,113)", fontSize: 12, fontWeight: 600,
                }}
              >
                <Trash2 size={13} />
                Eliminar foto
              </button>
            )}
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhotoChange} />
      </div>

      {/* ── CoinCash PRO upgrade card ── */}
      <div style={{ margin: "16px 16px 0", border: `1px solid ${userPlan === "pro" ? "rgba(0,255,198,0.3)" : "rgba(0,255,198,0.18)"}`, borderRadius: 14, overflow: "hidden", background: CARD }}>

        {/* Header */}
        <div style={{
          background: userPlan === "pro"
            ? "linear-gradient(135deg,rgba(0,255,198,0.14),rgba(0,128,255,0.08))"
            : "linear-gradient(135deg,rgba(0,255,198,0.07),rgba(0,128,255,0.04))",
          borderBottom: `1px solid rgba(0,255,198,0.12)`,
          padding: "12px 16px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#fff" }}>
              CoinCash PRO
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 11, color: MUTED }}>
              Scans ilimitados · Sin restricciones diarias
            </p>
          </div>
          <div style={{
            background: userPlan === "pro" ? "rgba(0,255,198,0.15)" : "rgba(0,255,198,0.08)",
            border: `1px solid ${userPlan === "pro" ? "rgba(0,255,198,0.5)" : "rgba(0,255,198,0.25)"}`,
            borderRadius: 8, padding: "4px 10px",
            fontSize: 13, fontWeight: 800, color: TEAL,
          }}>
            {userPlan === "pro" ? "✓ Activo" : "Pago único"}
          </div>
        </div>

        {/* Content */}
        {userPlan === "pro" ? (
          <div style={{ padding: "16px" }}>
            {/* Success header */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 24 }}>🎉</span>
              <div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: TEAL }}>¡Eres usuario PRO!</p>
                <p style={{ margin: "2px 0 0", fontSize: 11, color: MUTED }}>Scans ilimitados activos</p>
              </div>
            </div>

            {/* Days remaining block */}
            {daysRemaining !== null && (() => {
              const pct    = Math.round((daysRemaining / 30) * 100);
              const urgent = daysRemaining <= 5;
              const barColor = urgent ? "#F59E0B" : TEAL;
              return (
                <div style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${urgent ? "rgba(245,158,11,0.3)" : "rgba(0,255,198,0.15)"}`, borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: urgent ? "#F59E0B" : MUTED, fontWeight: 600 }}>
                      {urgent ? "⚠ Vence pronto" : "⏱ Próximo pago"}
                    </span>
                    <span style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 800, color: barColor }}>
                      {daysRemaining}
                      <span style={{ fontSize: 11, fontWeight: 400, color: MUTED, marginLeft: 4 }}>días</span>
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div style={{ height: 6, background: "rgba(255,255,255,0.07)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{
                      height: "100%",
                      width: `${pct}%`,
                      background: urgent
                        ? "linear-gradient(90deg,#F59E0B,#FBBF24)"
                        : "linear-gradient(90deg,#00FFC6,#00B8A9)",
                      borderRadius: 3,
                      transition: "width 0.5s ease",
                    }} />
                  </div>

                  <p style={{ margin: "8px 0 0", fontSize: 11, color: MUTED, lineHeight: 1.4 }}>
                    {urgent
                      ? `Renueva antes de que expire para no perder el acceso PRO.`
                      : `Acceso PRO activo · ${daysRemaining} días restantes.`}
                  </p>

                  {/* Renewal reminder */}
                  {urgent && (
                    <p style={{ margin: "8px 0 0", fontSize: 11, color: "#F59E0B", fontWeight: 600 }}>
                      Dirección de renovación: <span style={{ fontFamily: "monospace", color: TEAL }}>{PRO_ADDRESS}</span>
                    </p>
                  )}
                </div>
              );
            })()}
          </div>
        ) : (
          <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>

            {/* ── Plans section ── */}
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#F9FAFB", textAlign: "center" }}>
              💳 Planes disponibles
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>

              {/* Plan Básico */}
              <div style={{
                background: selectedPlan.name === "Básico" ? "rgba(0,255,198,0.07)" : "rgba(255,255,255,0.03)",
                border: selectedPlan.name === "Básico" ? "2px solid rgba(0,255,198,0.7)" : "1px solid rgba(255,255,255,0.09)",
                borderRadius: 14, padding: "14px 12px",
                display: "flex", flexDirection: "column", gap: 7,
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
                    fontSize: 8, fontWeight: 800, color: "#0B0F14",
                    letterSpacing: "0.04em", whiteSpace: "nowrap",
                  }}>✔ Seleccionado</div>
                )}
                <div style={{ fontSize: 13, fontWeight: 700, color: "#E5E7EB", marginTop: selectedPlan.name === "Básico" ? 4 : 0 }}>💳 Básico</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", lineHeight: 1 }}>$9.99</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {["100 análisis", "✔ $0.099 por análisis"].map((f, i) => (
                    <div key={i} style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", lineHeight: 1.4 }}>{f}</div>
                  ))}
                </div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.28)", textAlign: "center" }}>
                  Pago único · sin suscripción
                </div>
                <button
                  onClick={() => {
                    setSelectedPlan({ name: "Básico", price: "9.99" });
                    const el = document.getElementById("settings-payment-section");
                    el?.scrollIntoView({ behavior: "smooth" });
                  }}
                  style={{
                    padding: "7px 0", border: selectedPlan.name === "Básico" ? "none" : "1px solid rgba(0,255,198,0.3)",
                    borderRadius: 9,
                    background: selectedPlan.name === "Básico"
                      ? "linear-gradient(135deg,rgba(0,200,150,0.85),rgba(0,255,198,0.75))"
                      : "rgba(0,255,198,0.06)",
                    color: selectedPlan.name === "Básico" ? "#0B1220" : "#00FFC6",
                    fontSize: 11, fontWeight: 700,
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >{selectedPlan.name === "Básico" ? "✓ Seleccionado" : "Seleccionar plan"}</button>
              </div>

              {/* Plan Pro */}
              <div style={{
                background: selectedPlan.name === "Pro" ? "rgba(245,158,11,0.09)" : "rgba(255,255,255,0.03)",
                border: selectedPlan.name === "Pro" ? "2px solid #F59E0B" : "1.5px solid rgba(245,158,11,0.4)",
                borderRadius: 14, padding: "14px 12px",
                display: "flex", flexDirection: "column", gap: 7,
                position: "relative",
                boxShadow: selectedPlan.name === "Pro" ? "0 0 22px rgba(245,158,11,0.35)" : "0 0 10px rgba(245,158,11,0.08)",
                transform: "scale(1.02)", transformOrigin: "center",
                transition: "all 0.22s ease",
              }}>
                {/* Badge — changes on selection */}
                <div style={{
                  position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)",
                  background: selectedPlan.name === "Pro"
                    ? "linear-gradient(90deg,#F59E0B,#FBBF24)"
                    : "linear-gradient(90deg,#d97706,#F59E0B)",
                  borderRadius: 20, padding: "2px 9px",
                  fontSize: 8, fontWeight: 800, color: "#0B0F14",
                  letterSpacing: "0.05em", whiteSpace: "nowrap",
                }}>{selectedPlan.name === "Pro" ? "✔ Seleccionado" : "⭐ MÁS VENDIDO"}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#E5E7EB", marginTop: 4 }}>🔥 PRO</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: "#F59E0B", lineHeight: 1 }}>$19.99</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {["250 análisis", "✔ $0.079 por análisis", "✔ Análisis avanzado"].map((f, i) => (
                    <div key={i} style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", lineHeight: 1.4 }}>{f}</div>
                  ))}
                </div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.28)", textAlign: "center" }}>
                  Pago único · sin suscripción
                </div>
                <button
                  onClick={() => {
                    setSelectedPlan({ name: "Pro", price: "19.99" });
                    const el = document.getElementById("settings-payment-section");
                    el?.scrollIntoView({ behavior: "smooth" });
                  }}
                  style={{
                    padding: "7px 0", border: "none", borderRadius: 9,
                    background: selectedPlan.name === "Pro"
                      ? "linear-gradient(135deg,#F59E0B,#FBBF24)"
                      : "rgba(245,158,11,0.15)",
                    color: selectedPlan.name === "Pro" ? "#0B0F14" : "#F59E0B",
                    fontSize: 11, fontWeight: 800,
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >{selectedPlan.name === "Pro" ? "✓ Seleccionado" : "Seleccionar plan"}</button>
              </div>

            </div>

            {/* Divider */}
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }} />

            {/* Network badge */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }} id="settings-payment-section">
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
                background: "rgba(255,50,50,0.12)", border: "1px solid rgba(255,50,50,0.3)",
                color: "#FF6B6B", borderRadius: 6, padding: "3px 8px",
              }}>TRC20</span>
              <span style={{ fontSize: 11, color: MUTED }}>Red TRON · USDT</span>
            </div>

            {/* Plan seleccionado indicator */}
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
            {proQr && (
              <div style={{ display: "flex", justifyContent: "center" }}>
                <div style={{ background: "#fff", borderRadius: 12, padding: 8, display: "inline-block" }}>
                  <img src={proQr} alt="QR dirección de pago" style={{ width: 160, height: 160, display: "block" }} />
                </div>
              </div>
            )}

            {/* Address + copy */}
            <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "10px 12px" }}>
              <p style={{ margin: "0 0 4px", fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Dirección de pago
              </p>
              <p style={{ margin: "0 0 8px", fontFamily: "monospace", fontSize: 11, color: TEAL, wordBreak: "break-all", lineHeight: 1.5 }}>
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
                  display: "flex", alignItems: "center", gap: 6, width: "100%",
                  justifyContent: "center",
                  background: copiedAddr ? "rgba(0,255,198,0.12)" : "rgba(255,255,255,0.05)",
                  border: `1px solid ${copiedAddr ? "rgba(0,255,198,0.4)" : "rgba(255,255,255,0.1)"}`,
                  borderRadius: 8, padding: "8px 12px", cursor: "pointer",
                  color: copiedAddr ? TEAL : MUTED,
                  fontSize: 12, fontWeight: 600, transition: "all 0.2s",
                }}
              >
                {copiedAddr ? <Check size={13} /> : <Copy size={13} />}
                {copiedAddr ? "¡Dirección copiada!" : "Copiar dirección"}
              </button>
            </div>

            {/* Instructions */}
            <div style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.22)", borderRadius: 10, padding: "10px 12px" }}>
              <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.7)", lineHeight: 1.6 }}>
                Envía <strong style={{ color: "#F59E0B" }}>{selectedPlan.price} USDT (TRC20)</strong> a la dirección anterior.<br />
                Luego presiona <strong style={{ color: TEAL }}>"Ya pagué"</strong> para activar tu plan.
              </p>
            </div>

            {/* "Ya pagué" / Pending — driven by shared paymentStatus */}
            {paymentStatus === "pending" ? (
              <div style={{ background: "rgba(0,255,198,0.07)", border: "1px solid rgba(0,255,198,0.28)", borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: TEAL }}>✓ Pago en verificación.</p>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: MUTED }}>Activación en pocos minutos.</p>
              </div>
            ) : userPlan !== "pro" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <p style={{ margin: 0, fontSize: 12, color: MUTED, lineHeight: 1.5 }}>
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
                    fontSize: 13, fontWeight: 800,
                    cursor: upgradeSending ? "not-allowed" : "pointer", width: "100%",
                  }}
                >
                  {upgradeSending ? "Enviando…" : "💳 Ya pagué — Activar PRO"}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Push notifications */}
      <div style={{ margin: "20px 16px 0", padding: 16, background: CARD, borderRadius: 12, border: `1px solid ${BORDER}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              {pushEnabled ? <Bell size={16} style={{ color: TEAL }} /> : <BellOff size={16} style={{ color: MUTED }} />}
              <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Notificaciones</p>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: MUTED }}>
              {!pushSupport
                ? "Tu navegador no soporta notificaciones push"
                : pushEnabled
                  ? "Recibirás alertas cuando lleguen mensajes nuevos"
                  : "Activa para recibir alertas de nuevos mensajes"}
            </p>
          </div>
          <button
            onClick={togglePush}
            disabled={!pushSupport || pushLoading}
            style={{
              width: 52, height: 28, borderRadius: 14, border: "none",
              background: pushEnabled ? TEAL : "rgba(255,255,255,0.12)",
              cursor: pushSupport && !pushLoading ? "pointer" : "not-allowed",
              position: "relative", transition: "background 0.2s", flexShrink: 0,
            }}
          >
            <div style={{
              width: 22, height: 22, borderRadius: "50%", background: "#fff",
              position: "absolute", top: 3,
              left: pushEnabled ? 27 : 3,
              transition: "left 0.2s",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {pushLoading ? <div style={{ width: 10, height: 10, borderRadius: "50%", border: "2px solid #ccc", borderTopColor: "#666", animation: "spin 0.6s linear infinite" }} /> : null}
            </div>
          </button>
        </div>
      </div>

      {/* Contador de visitas — oculto temporalmente */}
      {false && visitStats && (
        <div style={{ margin: "20px 16px 0", background: CARD, borderRadius: 14, border: `1px solid rgba(0,255,198,0.18)`, overflow: "hidden" }}>
          {/* Hoy / Total */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: `1px solid ${BORDER}` }}>
            {[{ label: "Hoy", value: visitStats.today }, { label: "Total", value: visitStats.total }].map((item, i) => (
              <div key={i} style={{ padding: "12px 16px", borderRight: i === 0 ? `1px solid ${BORDER}` : "none" }}>
                <p style={{ margin: 0, fontSize: 11, color: MUTED, textTransform: "uppercase", letterSpacing: "0.07em" }}>{item.label}</p>
                <p style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 800, color: TEAL, fontFamily: "monospace", letterSpacing: "-0.03em" }}>
                  {item.value.toLocaleString()}
                </p>
              </div>
            ))}
          </div>

          {/* En línea */}
          <div style={{ padding: "10px 16px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }}>🌐</span>
            <div>
              <p style={{ margin: 0, fontSize: 11, color: MUTED, textTransform: "uppercase", letterSpacing: "0.07em" }}>En línea</p>
              <p style={{ margin: "2px 0 0", fontSize: 18, fontWeight: 700, color: "#fff", fontFamily: "monospace" }}>
                {visitStats.online}
              </p>
            </div>
          </div>

          {/* Países */}
          {visitStats.countries.filter(c => c.code !== "xx").slice(0, 5).map((c) => {
            const flag = c.code.toUpperCase().replace(/./g, ch =>
              String.fromCodePoint(ch.charCodeAt(0) + 127397)
            );
            return (
              <div key={c.code} style={{ padding: "8px 16px", display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${BORDER}` }}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>{flag}</span>
                <span style={{ fontSize: 13, color: TEXT, flex: 1 }}>{c.name}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: TEAL, fontFamily: "monospace" }}>{c.count}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Dispositivo ── */}
      <div style={{ margin: "20px 16px 0" }}>
        <p style={{ margin: "0 0 10px", fontSize: 12, color: MUTED, textTransform: "uppercase", letterSpacing: "0.08em" }}>Dispositivo</p>
        <div style={{ background: CARD, borderRadius: 12, border: `1px solid ${BORDER}`, padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#fff" }}>Restablecer dispositivo</p>
              <p style={{ margin: "3px 0 0", fontSize: 11, color: MUTED, lineHeight: 1.5 }}>
                Genera un nuevo ID de dispositivo. Útil si compartes red con otros.
                <br/>No reinicia tu límite diario ni tu CC-ID.
              </p>
            </div>
            <button
              onClick={() => {
                resetDeviceId();
                setDeviceReset(true);
                setTimeout(() => setDeviceReset(false), 2500);
              }}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "9px 14px", borderRadius: 10, border: `1px solid ${BORDER}`,
                background: deviceReset ? "rgba(0,255,198,0.1)" : "rgba(255,255,255,0.05)",
                color: deviceReset ? TEAL : MUTED, fontSize: 12, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit", flexShrink: 0, whiteSpace: "nowrap",
                transition: "all 0.2s",
              }}
            >
              {deviceReset ? <Check size={14} /> : <RotateCcw size={14} />}
              {deviceReset ? "Restablecido" : "Restablecer"}
            </button>
          </div>
        </div>
      </div>

      {/* Soporte */}
      <div style={{ margin: "20px 16px 0" }}>
        <p style={{ margin: "0 0 10px", fontSize: 12, color: MUTED, textTransform: "uppercase", letterSpacing: "0.08em" }}>Ayuda</p>
        <button
          onClick={onOpenSupport}
          style={{
            width: "100%", padding: "14px 16px",
            background: CARD, borderRadius: 12,
            border: "1px solid rgba(0,255,198,0.18)",
            display: "flex", alignItems: "center", gap: 14,
            cursor: "pointer", textAlign: "left",
          }}
        >
          <div style={{
            width: 40, height: 40, borderRadius: 11, flexShrink: 0,
            background: "linear-gradient(135deg,rgba(0,255,198,0.2) 0%,rgba(0,184,169,0.1) 100%)",
            border: "1px solid rgba(0,255,198,0.25)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Headphones size={18} style={{ color: TEAL }} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#fff" }}>Soporte</p>
            <p style={{ margin: "3px 0 0", fontSize: 12, color: MUTED }}>Chatea con el equipo CoinCash</p>
          </div>
          <ChevronRight size={18} style={{ color: MUTED, flexShrink: 0 }} />
        </button>

      </div>

      {/* Save feedback */}
      {saved && (
        <div style={{ margin: "16px 16px 0", padding: "10px 16px", background: "rgba(0,255,198,0.1)", borderRadius: 10, border: `1px solid rgba(0,255,198,0.25)`, display: "flex", alignItems: "center", gap: 8 }}>
          <Check size={14} style={{ color: TEAL }} />
          <span style={{ fontSize: 13, color: TEAL }}>Cambios guardados</span>
        </div>
      )}

      {/* Legal links */}
      <div style={{ margin: "24px 16px 32px", display: "flex", justifyContent: "center", gap: 6, flexWrap: "wrap" }}>
        {[
          { label: "Términos",    hash: "#legal" },
          { label: "Privacidad", hash: "#legal" },
          { label: "Aviso legal", hash: "#legal" },
        ].map((l) => (
          <a
            key={l.label}
            href={l.hash}
            style={{
              fontSize: 11, color: MUTED, textDecoration: "none",
              padding: "4px 10px", borderRadius: 20,
              border: `1px solid ${BORDER}`,
              background: "rgba(255,255,255,0.03)",
              transition: "color 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = TEAL)}
            onMouseLeave={(e) => (e.currentTarget.style.color = MUTED)}
          >
            {l.label}
          </a>
        ))}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
