// @ts-nocheck
// Telegram integration endpoints
//
// POST /api/send-telegram     — Send a message to the admin's Telegram chat
// POST /api/telegram-webhook  — Receive updates from Telegram; route admin replies to app chat
// POST /api/reply-to-app      — Internal: deliver a support reply to a user's in-app chat

import { Router }          from "express";
import { saveChatMessage } from "../lib/db";

const router = Router();

const BOT_TOKEN  = process.env.TELEGRAM_BOT_TOKEN ?? "";
const CHAT_ID    = process.env.TELEGRAM_CHAT_ID   ?? "";
const SUPPORT_ID = "CC-SUPPORT";
const CC_RE      = /CC-\d{6}/i;

// ── Last-active user tracking ─────────────────────────────────────────────────
const lastActiveUser = new Map<string | number, string>(); // chatId → CC-XXXXXX

// ── Keywords that signal purchase intent → skip AI, activate human mode ───────
const INTEREST_KEYWORDS = [
  "quiero",
  "iniciar",
  "me interesa",
  "cómo pago",
  "como pago",
  "ok",
  "okay",
  "si quiero",
  "sí quiero",
  "acepto",
  "empezar",
  "empezamos",
  "proceder",
];

function isInterestedClient(text: string): boolean {
  const lower = text.toLowerCase();
  return INTEREST_KEYWORDS.some((kw) => lower.includes(kw));
}

// ── Fixed messages ─────────────────────────────────────────────────────────────

const HUMAN_MODE_REPLY = `Perfecto 👌 ya iniciamos el proceso.

Uno de nuestros especialistas revisará tu caso y te contactará en breve para continuar con la investigación.

Por favor mantente atento a este chat.`;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format a message from CC-SUPPORT and push it to the user via Socket.io. */
async function deliverSupportReply(
  io:      any,
  userId:  string,
  message: string,
): Promise<void> {
  const saved = await saveChatMessage(SUPPORT_ID, userId, message.trim());
  if (io) {
    const msg = {
      id:           saved.id,
      senderCcId:   saved.sender_coincash_id ?? SUPPORT_ID,
      receiverCcId: saved.receiver_coincash_id ?? userId,
      message:      saved.message,
      timestamp:    saved.timestamp,
    };
    io.to(userId).emit("receive_message", msg);
    io.to(SUPPORT_ID).emit("receive_message", msg);
  }
}

/** Extract CC-XXXXXX from a string, or return null. Always returns uppercase. */
function extractCcId(text: string): string | null {
  const m = CC_RE.exec(text ?? "");
  return m ? m[0].toUpperCase() : null;
}

// ── POST /api/send-telegram ───────────────────────────────────────────────────

router.post("/send-telegram", async (req, res) => {
  const message = (req.body?.message ?? "").trim();

  if (!message) {
    return res.status(400).json({ success: false, error: "message required" });
  }
  if (!BOT_TOKEN || !CHAT_ID) {
    console.error("[telegram] Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID");
    return res.status(500).json({ success: false, error: "Telegram not configured" });
  }

  try {
    // 1. Forward notification to admin's Telegram chat
    const url  = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const resp = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ chat_id: CHAT_ID, text: message }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.error("[telegram] API error:", err);
      return res.status(502).json({ success: false, error: "Telegram API error" });
    }

    // Track which user triggered this notification
    const notifUserId = extractCcId(message);
    if (notifUserId && CHAT_ID) {
      lastActiveUser.set(parseInt(CHAT_ID, 10) || CHAT_ID, notifUserId);
      console.log(`[telegram] Último usuario activo actualizado → ${notifUserId}`);
    }

    // 2. Extract the user's actual message text from the notification
    //    Notification format: "🟢 Nuevo mensaje CoinCash\n\n👤 Usuario: CC-XXXXXX\n💬 <texto>"
    const userTextMatch = message.match(/💬\s*(.+)$/s);
    const userText      = userTextMatch ? userTextMatch[1].trim() : null;

    if (notifUserId && userText) {
      const io = req.app.get("io");

      // 3a. PURCHASE INTENT DETECTED → skip AI, activate human mode
      if (isInterestedClient(userText)) {
        console.log(`[telegram] 🛒 Cliente interesado detectado → ${notifUserId}: "${userText.slice(0, 60)}"`);

        // Deliver human-mode reply to user's in-app chat
        await deliverSupportReply(io, notifUserId, HUMAN_MODE_REPLY);

        // Notify admin on Telegram
        const alert = `🚨 NUEVO CLIENTE INTERESADO\n\n👤 Usuario: ${notifUserId}\n💬 Mensaje: ${userText}`;
        await sendToTelegram(CHAT_ID, alert);

        return res.json({ success: true, mode: "human" });
      }

      // 3b. Normal message → call OpenAI and auto-respond
      askOpenAI(userText).then(async (aiReply) => {
        if (!aiReply) return;

        // Send AI reply to admin's Telegram so they can see it
        await sendToTelegram(CHAT_ID, `🤖 IA → ${notifUserId}:\n${aiReply}`);

        // Also deliver the AI reply directly to the user's in-app chat
        await deliverSupportReply(io, notifUserId, aiReply);

        console.log(`[openai] ✅ Respuesta automática → ${notifUserId}: "${aiReply.slice(0, 80)}"`);
      }).catch((err) => console.error("[openai] auto-reply error:", err?.message));
    }

    return res.json({ success: true });
  } catch (err: any) {
    console.error("[telegram] fetch error:", err?.message);
    return res.status(500).json({ success: false, error: "Internal error" });
  }
});

// ── POST /api/reply-to-app ────────────────────────────────────────────────────
// Delivers a message from CC-SUPPORT to a specific user's in-app chat.
// Body: { userId: "CC-XXXXXX", mensaje: "text" }

router.post("/reply-to-app", async (req, res) => {
  const userId  = (req.body?.userId  ?? "").trim();
  const mensaje = (req.body?.mensaje ?? "").trim();

  if (!CC_RE.test(userId)) {
    return res.status(400).json({ ok: false, error: "userId inválido (debe ser CC-XXXXXX)" });
  }
  if (!mensaje) {
    return res.status(400).json({ ok: false, error: "mensaje requerido" });
  }

  try {
    const io = req.app.get("io");
    await deliverSupportReply(io, userId, mensaje);
    console.log(`[telegram] Respuesta enviada → ${userId}: ${mensaje.slice(0, 60)}`);
    return res.json({ ok: true });
  } catch (err: any) {
    console.error("[telegram] reply-to-app error:", err?.message);
    return res.status(500).json({ ok: false, error: "Error interno" });
  }
});

// ── OpenAI helper ─────────────────────────────────────────────────────────────

async function askOpenAI(userText: string): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("[openai] OPENAI_API_KEY no configurada");
    return null;
  }

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Eres el soporte oficial de CoinCash.

FUNCION:
Responder dudas sobre análisis de wallets, planes y servicios.

PLANES:
- Básico: $9.99 → 100 análisis
- PRO: $19.99 → 250 análisis + análisis avanzado

REGLAS LEGALES:
- NO afirmar delitos
- NO decir que una wallet está bloqueada como hecho absoluto
- NO decir que CoinCash bloquea wallets
- NO dar asesoría legal o financiera

SIEMPRE usar lenguaje:
- "según el análisis"
- "en la imagen se observa"
- "posible riesgo"
- "no podemos confirmar directamente"

RESPUESTAS:
- Cortas (máx 2-3 líneas)
- Claras
- Profesionales
- Sin repetir

CASOS:

Si dicen "me bloquearon":
→ "CoinCash no bloquea wallets. Solo analizamos posibles riesgos según datos disponibles."

Si preguntan precios:
→ "Plan Básico: $9.99 (100 análisis). Plan PRO: $19.99 (250 análisis + análisis avanzado)."

ANÁLISIS DE IMÁGENES:

Si detecta riesgo:
→ "Según la imagen, la dirección muestra posibles indicadores de riesgo o blacklist. CoinCash no realiza bloqueos."

VENTA DE SERVICIO:

Si el usuario muestra interés o pregunta cómo investigar más a fondo:
→ "Podemos realizar una investigación avanzada para identificar el origen y la plataforma relacionada. Este servicio tiene un costo de $100.

Según la imagen, la dirección presenta indicadores de posible riesgo o blacklist.

CoinCash no realiza bloqueos, pero podemos ayudarte a investigar el origen y qué plataforma o entidad podría estar relacionada.

Ofrecemos un análisis avanzado personalizado donde revisamos el caso a fondo y te orientamos paso a paso. Este servicio tiene un costo de $100.

Importante: este servicio NO garantiza el desbloqueo de fondos. Nuestro objetivo es identificar el posible origen del bloqueo y brindarte la información necesaria para que puedas gestionar tu caso directamente con la plataforma correspondiente.

Si deseas, puedo ayudarte a iniciar el proceso."

LÍMITES:
- NO investigar casos reales
- NO decir qué exchange bloqueó
- NO dar conclusiones finales definitivas`,
          },
          {
            role: "user",
            content: userText,
          },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[openai] API error:", err.slice(0, 200));
      return null;
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? null;
  } catch (err: any) {
    console.error("[openai] fetch error:", err?.message);
    return null;
  }
}

/** Send a message back to a Telegram chat. */
async function sendToTelegram(chatId: string | number, text: string): Promise<void> {
  if (!BOT_TOKEN) return;
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  }).catch((err) => console.error("[telegram] sendMessage error:", err?.message));
}

// ── POST /api/telegram-webhook ────────────────────────────────────────────────
// Registered as the Telegram Bot webhook.
// Receives updates, calls OpenAI for an AI reply sent back to Telegram,
// and also routes the message to the correct user's in-app chat.

router.post("/telegram-webhook", async (req, res) => {
  // Always acknowledge immediately so Telegram doesn't retry.
  res.sendStatus(200);

  try {
    const update = req.body;
    const msg    = update?.message;

    if (!msg) return;

    const fromBot        = msg.from?.is_bot === true;
    const telegramChatId = msg.chat?.id;

    if (fromBot) return;

    // ── Image analysis (vision) ───────────────────────────────────────────────
    if (msg.photo && Array.isArray(msg.photo) && msg.photo.length > 0) {
      const fileId = msg.photo[msg.photo.length - 1].file_id;

      try {
        const fileRes  = await fetch(
          `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`,
        );
        const fileData = await fileRes.json();
        const filePath = fileData?.result?.file_path;

        if (!filePath) {
          await sendToTelegram(telegramChatId, "No pude obtener la imagen. Intenta de nuevo.");
          return;
        }

        const imageUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
        const apiKey   = process.env.OPENAI_API_KEY;

        if (!apiKey) {
          console.warn("[openai-vision] OPENAI_API_KEY no configurada");
          return;
        }

        const visionRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type":  "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: `Eres experto en análisis de wallets cripto (TRON, USDT, riesgo, blacklist, transacciones).

REGLAS LEGALES:
- NO afirmar delitos como hechos absolutos
- Usa lenguaje como "según la imagen se observa", "posible riesgo", "indicadores de"
- NO decir que CoinCash bloquea wallets
- NO dar asesoría legal o financiera

Si detectas riesgo, ofrece el servicio de investigación avanzada ($100) con este mensaje:
"Según la imagen, la dirección presenta indicadores de posible riesgo o blacklist. CoinCash no realiza bloqueos, pero podemos ayudarte a investigar el origen. Ofrecemos un análisis avanzado por $100. ¿Deseas iniciar el proceso?"

Responde claro, profesional y corto.`,
              },
              {
                role: "user",
                content: [
                  { type: "text",      text: "Analiza esta imagen y dime si la wallet tiene riesgo y por qué:" },
                  { type: "image_url", image_url: { url: imageUrl } },
                ],
              },
            ],
          }),
        });

        const visionData = await visionRes.json();
        const reply      = visionData.choices?.[0]?.message?.content;

        if (reply) {
          await sendToTelegram(telegramChatId, reply);
          console.log(`[openai-vision] ✅ Análisis de imagen enviado a chat ${telegramChatId}`);
        } else {
          console.error("[openai-vision] Sin respuesta:", JSON.stringify(visionData).slice(0, 200));
        }
      } catch (err: any) {
        console.error("[openai-vision] Error:", err?.message);
      }

      return;
    }

    const text = (msg.text ?? "").trim();

    // 1. Ignore empty text messages
    if (!text) return;

    // 2. Ignore outgoing system notifications (messages the app sent TO Telegram)
    if (text.startsWith("🟢")) return;

    // ── OpenAI auto-reply to Telegram ─────────────────────────────────────────
    const aiReplyPromise = askOpenAI(text).then(async (respuesta) => {
      if (respuesta && telegramChatId) {
        await sendToTelegram(telegramChatId, respuesta);
        console.log(`[openai] ✅ Respuesta enviada a Telegram (chat ${telegramChatId}): "${respuesta.slice(0, 80)}"`);
      }
    });

    // ── In-app routing ────────────────────────────────────────────────────────
    let userId: string | null = null;
    let replyText: string     = text;

    // Strategy A — reply_to_message (preferred)
    const replyToText = msg.reply_to_message?.text ?? msg.reply_to_message?.caption ?? "";
    if (replyToText) {
      userId = extractCcId(replyToText);
      console.log(`[telegram-webhook] Strategy A — reply_to text: "${replyToText.slice(0, 80)}" → userId: ${userId}`);
    }

    // Strategy B — CC-ID in message text
    if (!userId) {
      const colonMatch = text.match(/^(CC-\d{6})\s*:\s*(.+)$/si);
      if (colonMatch) {
        userId    = colonMatch[1].toUpperCase();
        replyText = colonMatch[2].trim();
      }
      if (!userId) {
        const spaceMatch = text.match(/^(CC-\d{6})\s+(.+)$/si);
        if (spaceMatch) {
          userId    = spaceMatch[1].toUpperCase();
          replyText = spaceMatch[2].trim();
        }
      }
      if (!userId) {
        const anyMatch = text.match(/\b(CC-\d{6})\b/i);
        if (anyMatch) {
          userId    = anyMatch[1].toUpperCase();
          replyText = text.replace(anyMatch[0], "").replace(/\s{2,}/g, " ").trim();
          if (!replyText) replyText = text;
        }
      }
      if (userId) console.log(`[telegram-webhook] Strategy B → userId: ${userId}`);
    }

    // Strategy C — use last known active user for this Telegram chat
    if (!userId && telegramChatId) {
      userId = lastActiveUser.get(telegramChatId) ?? null;
      if (userId) console.log(`[telegram-webhook] Strategy C (last active) → userId: ${userId}`);
    }

    if (userId && replyText) {
      const io = req.app.get("io");
      await deliverSupportReply(io, userId, replyText);
      if (telegramChatId) lastActiveUser.set(telegramChatId, userId);
      console.log(`[telegram-webhook] ✅ Respuesta in-app → ${userId}: "${replyText.slice(0, 80)}"`);
    } else {
      console.warn(`[telegram-webhook] No se pudo determinar userId para entrega in-app. text="${text.slice(0, 100)}"`);
    }

    await aiReplyPromise.catch(() => {});

  } catch (err: any) {
    console.error("[telegram-webhook] Error:", err?.message);
  }
});

export default router;
