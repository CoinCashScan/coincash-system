import { useState, useEffect, useRef, useCallback } from "react";
import {
  ArrowLeft, UserPlus, Trash2, Lock, Image, Mic, MicOff, Send, Phone,
  StopCircle, Paperclip,
} from "lucide-react";
import { useDmSocket, type DmMsg } from "@/hooks/useDmSocket";
import { encryptMessage, decryptMessage } from "@/lib/dmCrypto";
import { API_BASE } from "@/lib/apiConfig";

// ── helpers ────────────────────────────────────────────────────────────────────
function getCcId(): string {
  const key = "coincash_user_id";
  let id = localStorage.getItem(key);
  if (!id) {
    const digits = Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");
    id = `CC-${digits}`;
    localStorage.setItem(key, id);
  }
  return id;
}

async function uploadFile(file: File): Promise<string> {
  const r = await fetch(`${API_BASE}/storage/uploads/request-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
  });
  if (!r.ok) throw new Error("No se pudo obtener URL de subida");
  const { uploadURL, objectPath } = await r.json();
  const put = await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!put.ok) throw new Error("Error al subir archivo");
  return objectPath as string;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

// ── types ──────────────────────────────────────────────────────────────────────
interface Contact { owner_id: string; contact_id: string; }

interface DecryptedMsg {
  raw:  DmMsg;
  text: string | null;
  loading: boolean;
  error: boolean;
}

// ── styles ─────────────────────────────────────────────────────────────────────
const TEAL   = "#00FFC6";
const BG     = "#0B0F14";
const CARD   = "#0B1220";
const BORDER = "rgba(255,255,255,0.07)";
const TEXT   = "rgba(255,255,255,0.9)";
const MUTED  = "rgba(255,255,255,0.45)";

// ═══════════════════════════════════════════════════════════════════════════════
// CONTACTS LIST
// ═══════════════════════════════════════════════════════════════════════════════
function ContactsList({
  myId, contacts, onSelect, onRefresh,
}: {
  myId: string;
  contacts: Contact[];
  onSelect: (id: string) => void;
  onRefresh: () => void;
}) {
  const [adding, setAdding]   = useState(false);
  const [input,  setInput]    = useState("");
  const [err,    setErr]      = useState("");
  const [busy,   setBusy]     = useState(false);

  async function addContact() {
    const id = input.trim().toUpperCase();
    if (!/^CC-\d{6}$/.test(id)) { setErr("Formato inválido. Ej: CC-123456"); return; }
    if (id === myId)              { setErr("No puedes agregarte a ti mismo");  return; }
    setBusy(true); setErr("");
    try {
      const r = await fetch(`${API_BASE}/dm/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId: myId, contactId: id }),
      });
      if (!r.ok) { const d = await r.json(); setErr(d.error ?? "Error"); }
      else { setAdding(false); setInput(""); onRefresh(); }
    } catch { setErr("Sin conexión"); }
    finally { setBusy(false); }
  }

  async function deleteContact(contactId: string) {
    await fetch(`${API_BASE}/dm/contacts`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ownerId: myId, contactId }),
    });
    onRefresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: BG }}>
      {/* Header */}
      <div style={{
        padding: "20px 16px 14px",
        borderBottom: `1px solid ${BORDER}`,
        background: CARD,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div>
          <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: TEXT }}>Mensajes</p>
          <p style={{ margin: 0, fontSize: 11, color: MUTED, marginTop: 2 }}>
            <Lock size={10} style={{ marginRight: 4, verticalAlign: "middle" }} />
            Cifrado de extremo a extremo
          </p>
        </div>
        <button
          onClick={() => setAdding(true)}
          style={{
            background: TEAL, border: "none", borderRadius: 10, padding: "8px 14px",
            color: "#0B1220", fontWeight: 700, fontSize: 13, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6,
          }}
        >
          <UserPlus size={14} /> Agregar
        </button>
      </div>

      {/* My ID */}
      <div style={{ padding: "10px 16px", background: "rgba(0,255,198,0.05)", borderBottom: `1px solid ${BORDER}` }}>
        <p style={{ margin: 0, fontSize: 11, color: MUTED }}>Tu ID:</p>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: TEAL, fontFamily: "monospace" }}>{myId}</p>
      </div>

      {/* Add contact modal */}
      {adding && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: CARD, borderRadius: 16, padding: 24, width: 300,
            border: `1px solid ${BORDER}`,
          }}>
            <p style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700, color: TEXT }}>Agregar contacto</p>
            <input
              autoFocus
              placeholder="CC-123456"
              value={input}
              onChange={e => { setInput(e.target.value.toUpperCase()); setErr(""); }}
              onKeyDown={e => e.key === "Enter" && addContact()}
              style={{
                width: "100%", boxSizing: "border-box",
                background: "#0B0F14", border: `1px solid ${err ? "#ff4444" : BORDER}`,
                borderRadius: 8, padding: "10px 12px", color: TEXT, fontSize: 14,
                fontFamily: "monospace", outline: "none",
              }}
            />
            {err && <p style={{ color: "#ff6b6b", fontSize: 12, margin: "6px 0 0" }}>{err}</p>}
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button
                onClick={() => { setAdding(false); setInput(""); setErr(""); }}
                style={{
                  flex: 1, padding: "10px", background: "transparent", border: `1px solid ${BORDER}`,
                  borderRadius: 8, color: MUTED, cursor: "pointer", fontSize: 14,
                }}
              >Cancelar</button>
              <button
                onClick={addContact}
                disabled={busy}
                style={{
                  flex: 1, padding: "10px", background: TEAL, border: "none",
                  borderRadius: 8, color: "#0B1220", fontWeight: 700, cursor: "pointer", fontSize: 14,
                }}
              >{busy ? "..." : "Agregar"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Contacts list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {contacts.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center" }}>
            <Phone size={36} style={{ color: MUTED, marginBottom: 12 }} />
            <p style={{ color: MUTED, fontSize: 14, margin: 0 }}>No tienes contactos aún.</p>
            <p style={{ color: MUTED, fontSize: 12, marginTop: 4 }}>Toca "Agregar" para empezar.</p>
          </div>
        ) : (
          contacts.map(c => (
            <div
              key={c.contact_id}
              style={{
                display: "flex", alignItems: "center", padding: "14px 16px",
                borderBottom: `1px solid ${BORDER}`, cursor: "pointer",
              }}
              onClick={() => onSelect(c.contact_id)}
            >
              <div style={{
                width: 42, height: 42, borderRadius: "50%",
                background: "linear-gradient(135deg, #00FFC6 0%, #0080FF 100%)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 800, fontSize: 14, color: "#0B1220", flexShrink: 0,
              }}>
                {c.contact_id.slice(-2)}
              </div>
              <div style={{ flex: 1, marginLeft: 12 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: TEXT, fontFamily: "monospace" }}>
                  {c.contact_id}
                </p>
                <p style={{ margin: 0, fontSize: 11, color: MUTED, marginTop: 2 }}>
                  <Lock size={9} style={{ marginRight: 3, verticalAlign: "middle" }} />Chat encriptado
                </p>
              </div>
              <button
                onClick={e => { e.stopPropagation(); deleteContact(c.contact_id); }}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 8 }}
              >
                <Trash2 size={16} style={{ color: "rgba(255,80,80,0.6)" }} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DM CHAT
// ═══════════════════════════════════════════════════════════════════════════════
function DmChat({ myId, contactId, onBack }: { myId: string; contactId: string; onBack: () => void }) {
  const [msgs,     setMsgs]     = useState<DecryptedMsg[]>([]);
  const [text,     setText]     = useState("");
  const [sending,  setSending]  = useState(false);
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);

  const bottomRef    = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRef     = useRef<MediaRecorder | null>(null);
  const chunksRef    = useRef<Blob[]>([]);

  // Decrypt and add a message
  const addMsg = useCallback(async (raw: DmMsg) => {
    const placeholder: DecryptedMsg = { raw, text: null, loading: true, error: false };
    setMsgs(prev => {
      if (prev.find(m => m.raw.id === raw.id)) return prev;
      return [...prev, placeholder];
    });

    if (raw.msgType !== "text" || !raw.ciphertext || !raw.iv) {
      setMsgs(prev => prev.map(m =>
        m.raw.id === raw.id ? { ...m, text: null, loading: false } : m,
      ));
      return;
    }

    try {
      const senderId = raw.senderId;
      const otherId  = senderId === myId ? raw.receiverId : raw.senderId;
      const plain = await decryptMessage(raw.ciphertext, raw.iv, myId, otherId);
      setMsgs(prev => prev.map(m =>
        m.raw.id === raw.id ? { ...m, text: plain, loading: false } : m,
      ));
    } catch {
      setMsgs(prev => prev.map(m =>
        m.raw.id === raw.id ? { ...m, text: "[Error al descifrar]", loading: false, error: true } : m,
      ));
    }
  }, [myId]);

  // Load history
  useEffect(() => {
    setMsgs([]);
    fetch(`${API_BASE}/dm/messages?userId1=${myId}&userId2=${contactId}`)
      .then(r => r.json())
      .then(d => { (d.messages as DmMsg[]).forEach(addMsg); })
      .catch(() => {});
  }, [myId, contactId, addMsg]);

  // Socket
  const { sendDm } = useDmSocket({
    myId,
    onReceive: (msg) => {
      const isForUs =
        (msg.senderId === myId && msg.receiverId === contactId) ||
        (msg.senderId === contactId && msg.receiverId === myId);
      if (isForUs) addMsg(msg);
    },
  });

  // Scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length]);

  // Send text
  async function sendText() {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const { ciphertext, iv } = await encryptMessage(text.trim(), myId, contactId);
      sendDm(contactId, "text", { ciphertext, iv });
      setText("");
    } catch { /* ignore */ }
    finally { setSending(false); }
  }

  // Send media file (photo or audio)
  async function sendMedia(file: File, msgType: "image" | "audio") {
    setUploading(true);
    try {
      const objectPath = await uploadFile(file);
      sendDm(contactId, msgType, { objectPath });
    } catch (e: any) {
      alert(e.message ?? "Error al subir archivo");
    } finally { setUploading(false); }
  }

  // Voice recording
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        sendMedia(new File([blob], `voz-${Date.now()}.webm`, { type: "audio/webm" }), "audio");
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
    } catch { alert("Permiso de micrófono denegado"); }
  }

  function stopRecording() {
    mediaRef.current?.stop();
    mediaRef.current = null;
    setRecording(false);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const type = file.type.startsWith("image/") ? "image"
               : file.type.startsWith("audio/") ? "audio"
               : null;
    if (!type) { alert("Solo se permiten imágenes y audios"); return; }
    sendMedia(file, type);
    e.target.value = "";
  }

  const isMine = (msg: DecryptedMsg) => msg.raw.senderId === myId;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: BG }}>
      {/* Header */}
      <div style={{
        padding: "14px 16px", background: CARD, borderBottom: `1px solid ${BORDER}`,
        display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
      }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
          <ArrowLeft size={20} style={{ color: TEAL }} />
        </button>
        <div style={{
          width: 36, height: 36, borderRadius: "50%",
          background: "linear-gradient(135deg,#00FFC6,#0080FF)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 800, color: "#0B1220",
        }}>
          {contactId.slice(-2)}
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: TEXT, fontFamily: "monospace" }}>{contactId}</p>
          <p style={{ margin: 0, fontSize: 10, color: TEAL }}>
            <Lock size={9} style={{ marginRight: 3 }} />Cifrado E2E
          </p>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 12px 0" }}>
        {msgs.map(m => (
          <div
            key={m.raw.id}
            style={{
              display: "flex", flexDirection: "column",
              alignItems: isMine(m) ? "flex-end" : "flex-start",
              marginBottom: 8,
            }}
          >
            <div style={{
              maxWidth: "78%", borderRadius: isMine(m) ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
              background: isMine(m) ? "rgba(0,255,198,0.15)" : "rgba(255,255,255,0.07)",
              border: `1px solid ${isMine(m) ? "rgba(0,255,198,0.25)" : BORDER}`,
              padding: m.raw.msgType === "text" ? "8px 12px" : "6px",
              overflow: "hidden",
            }}>
              {m.raw.msgType === "text" && (
                <p style={{ margin: 0, fontSize: 14, color: m.error ? "#ff6b6b" : TEXT, lineHeight: 1.4 }}>
                  {m.loading ? <span style={{ color: MUTED, fontSize: 12 }}>Descifrando...</span> : m.text}
                </p>
              )}
              {m.raw.msgType === "image" && m.raw.objectPath && (
                <img
                  src={`${API_BASE}/storage${m.raw.objectPath}`}
                  alt="imagen"
                  style={{ maxWidth: 220, maxHeight: 200, borderRadius: 8, display: "block" }}
                />
              )}
              {m.raw.msgType === "audio" && m.raw.objectPath && (
                <audio
                  controls
                  src={`${API_BASE}/storage${m.raw.objectPath}`}
                  style={{ maxWidth: 220, display: "block" }}
                />
              )}
            </div>
            <span style={{ fontSize: 10, color: MUTED, marginTop: 3, paddingLeft: 4, paddingRight: 4 }}>
              {fmtTime(m.raw.createdAt)}
              {isMine(m) && (
                <Lock size={8} style={{ marginLeft: 4, color: TEAL, verticalAlign: "middle" }} />
              )}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Upload progress */}
      {uploading && (
        <div style={{ padding: "6px 16px", background: "rgba(0,255,198,0.08)", textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 12, color: TEAL }}>Subiendo archivo...</p>
        </div>
      )}

      {/* Input area */}
      <div style={{
        padding: "10px 12px",
        borderTop: `1px solid ${BORDER}`,
        background: CARD,
        display: "flex",
        alignItems: "center",
        gap: 8,
        paddingBottom: "max(10px, env(safe-area-inset-bottom))",
        flexShrink: 0,
      }}>
        {/* File attach */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,audio/*"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 6, flexShrink: 0 }}
        >
          <Paperclip size={20} style={{ color: MUTED }} />
        </button>

        {/* Voice record */}
        <button
          onMouseDown={startRecording}
          onMouseUp={stopRecording}
          onTouchStart={startRecording}
          onTouchEnd={stopRecording}
          onClick={recording ? stopRecording : undefined}
          style={{
            background: recording ? "rgba(255,80,80,0.2)" : "none",
            border: recording ? "1px solid rgba(255,80,80,0.5)" : "none",
            borderRadius: 8,
            cursor: "pointer", padding: 6, flexShrink: 0,
          }}
        >
          {recording
            ? <StopCircle size={20} style={{ color: "#ff6b6b" }} />
            : <Mic size={20} style={{ color: MUTED }} />}
        </button>

        {/* Text input */}
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendText()}
          placeholder="Mensaje cifrado..."
          style={{
            flex: 1, background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`,
            borderRadius: 20, padding: "9px 14px", color: TEXT, fontSize: 14, outline: "none",
          }}
        />

        {/* Send */}
        <button
          onClick={sendText}
          disabled={!text.trim() || sending}
          style={{
            width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
            background: text.trim() ? TEAL : "rgba(0,255,198,0.15)",
            border: "none", cursor: text.trim() ? "pointer" : "default",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <Send size={16} style={{ color: text.trim() ? "#0B1220" : MUTED }} />
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN DM PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function DmPage() {
  const [myId]      = useState<string>(getCcId);
  const [contacts,  setContacts]  = useState<Contact[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);

  const loadContacts = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/dm/contacts?ownerId=${myId}`);
      const d = await r.json();
      setContacts(d.contacts ?? []);
    } catch { /* offline */ }
  }, [myId]);

  useEffect(() => { loadContacts(); }, [loadContacts]);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {activeChat ? (
        <DmChat
          myId={myId}
          contactId={activeChat}
          onBack={() => setActiveChat(null)}
        />
      ) : (
        <ContactsList
          myId={myId}
          contacts={contacts}
          onSelect={id => setActiveChat(id)}
          onRefresh={loadContacts}
        />
      )}
    </div>
  );
}
