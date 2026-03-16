import { useState, useRef, useEffect } from "react";
import { Send } from "lucide-react";

interface Message {
  id: number;
  text: string;
  sender: "user" | "system";
  timestamp: Date;
}

const INITIAL: Message[] = [
  {
    id: 1,
    text: "Bienvenido al Chat Privado de CoinCash. ¿En qué podemos ayudarte?",
    sender: "system",
    timestamp: new Date(),
  },
];

function fmt(date: Date): string {
  return date.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

const ChatPage = () => {
  const [messages, setMessages] = useState<Message[]>(INITIAL);
  const [input, setInput]       = useState("");
  const bottomRef               = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function send() {
    const text = input.trim();
    if (!text) return;

    const userMsg: Message = { id: Date.now(), text, sender: "user", timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");

    // Auto-reply
    setTimeout(() => {
      const reply: Message = {
        id:        Date.now() + 1,
        text:      "Gracias por tu mensaje. Un agente de soporte se pondrá en contacto contigo pronto.",
        sender:    "system",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, reply]);
    }, 900);
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  return (
    <div
      style={{
        display:       "flex",
        flexDirection: "column",
        height:        "100dvh",
        background:    "#0B0F14",
        paddingBottom: "64px",   // height of bottom nav
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          flexShrink:    0,
          padding:       "52px 20px 16px",
          background:    "#0e1520",
          borderBottom:  "1px solid rgba(255,255,255,0.07)",
        }}
      >
        <h1 style={{ color: "#fff", fontSize: "18px", fontWeight: 700, margin: 0 }}>
          Chat Privado
        </h1>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "12px", margin: "2px 0 0" }}>
          Soporte CoinCash · En línea
        </p>
      </div>

      {/* ── Message list ── */}
      <div
        style={{
          flex:       1,
          overflowY:  "auto",
          padding:    "16px 16px 8px",
          display:    "flex",
          flexDirection: "column",
          gap:        "10px",
        }}
      >
        {messages.map(msg => {
          const isUser = msg.sender === "user";
          return (
            <div
              key={msg.id}
              style={{
                display:        "flex",
                flexDirection:  "column",
                alignItems:     isUser ? "flex-end" : "flex-start",
              }}
            >
              <div
                style={{
                  maxWidth:     "78%",
                  padding:      "10px 13px",
                  borderRadius: isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                  background:   isUser ? "#19C37D" : "#1a2332",
                  color:        isUser ? "#000" : "rgba(255,255,255,0.88)",
                  fontSize:     "14px",
                  lineHeight:   "1.5",
                  wordBreak:    "break-word",
                }}
              >
                {msg.text}
              </div>
              <span
                style={{
                  fontSize:    "10px",
                  color:       "rgba(255,255,255,0.28)",
                  marginTop:   "3px",
                  marginLeft:  isUser ? 0 : "4px",
                  marginRight: isUser ? "4px" : 0,
                }}
              >
                {fmt(msg.timestamp)}
              </span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* ── Input bar ── */}
      <div
        style={{
          flexShrink:   0,
          display:      "flex",
          alignItems:   "center",
          gap:          "10px",
          padding:      "10px 14px",
          background:   "#0e1520",
          borderTop:    "1px solid rgba(255,255,255,0.07)",
        }}
      >
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Escribe un mensaje…"
          style={{
            flex:          1,
            background:    "#1a2332",
            border:        "1px solid rgba(255,255,255,0.10)",
            borderRadius:  "22px",
            padding:       "10px 16px",
            color:         "#fff",
            fontSize:      "14px",
            outline:       "none",
          }}
        />
        <button
          onClick={send}
          disabled={!input.trim()}
          style={{
            flexShrink:    0,
            width:         "42px",
            height:        "42px",
            borderRadius:  "50%",
            background:    input.trim() ? "#19C37D" : "rgba(255,255,255,0.08)",
            border:        "none",
            display:       "flex",
            alignItems:    "center",
            justifyContent:"center",
            cursor:        input.trim() ? "pointer" : "default",
            transition:    "background 0.15s",
          }}
        >
          <Send size={17} color={input.trim() ? "#000" : "rgba(255,255,255,0.3)"} />
        </button>
      </div>
    </div>
  );
};

export default ChatPage;
