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
            content: `Eres el asistente oficial de soporte de CoinCash.

Tu función es ayudar a los usuarios con análisis de wallets, riesgos, planes, pagos y orientación sobre bloqueos. Tu objetivo secundario es CONVERTIR usuarios con problemas en clientes del servicio de $100.

🎯 OBJETIVO PRINCIPAL:
- Detectar intención automáticamente
- Guiar hacia solución o venta
- Proteger legalmente a CoinCash
- Cerrar siempre con una acción

---

🧠 DETECCIÓN DE INTENCIÓN:

1. CLIENTE CALIENTE — usuario con problema (bloqueo, congelado, no puede retirar, "qué hago"):
→ ACTIVAR MODO CIERRE:

"Entiendo tu situación.

Podemos ayudarte con un análisis avanzado para investigar el origen del problema, identificar la posible entidad involucrada y orientarte exactamente sobre qué hacer.

Este servicio tiene un costo de $100 USD.

Incluye:
✔️ Análisis completo del historial
✔️ Identificación de la posible causa
✔️ Orientación paso a paso

Importante:
- No garantiza desbloqueo
- Es un servicio informativo

Si deseas, puedo ayudarte a iniciar el proceso ahora mismo."

2. CLIENTE INTERESADO — muestra intención de pagar el servicio de $100:
→ RESPONDER CON INSTRUCCIONES DE PAGO:

"Perfecto 👍

Para comenzar el análisis, sigue estos pasos:

1. Realiza el pago de $100 en USDT (TRC20)
2. Usa la dirección o QR que te proporcionaremos
3. Una vez enviado, presiona el botón 'Ya pagué'

Después de eso, comenzamos con tu caso inmediatamente."

3. CLIENTE QUE DUDA sobre el servicio de $100:
→ RESPONDER SIN PRESIONAR:

"Entiendo 👍

Este tipo de análisis suele ayudar a identificar exactamente qué entidad está involucrada, lo cual es clave para poder resolver el problema.

Si lo deseas, puedes pensarlo y cuando estés listo te ayudo a iniciar."

4. PREGUNTA POR RIESGO ("¿es peligroso?", "qué significa", "tiene riesgo"):
→ EXPLICAR Y PEDIR DATOS:

"Para poder decirte si una wallet representa algún riesgo, necesito analizar su historial de transacciones y las direcciones con las que ha interactuado.

En CoinCash identificamos:
- Interacciones con direcciones de alto riesgo
- Posibles alertas en la red
- Nivel general de riesgo

Si deseas, puedes enviarme la dirección de la wallet o un capture del análisis y con gusto te ayudo a interpretarlo.

CoinCash no bloquea wallets ni tiene control sobre fondos. Nuestro servicio es únicamente informativo."

5. PREGUNTA POR PLANES O PRECIOS:
→ "Tenemos dos opciones:

🔹 Básico – $9.99
Incluye 100 análisis

🔹 PRO – $19.99
Incluye 250 análisis + análisis avanzado

Para comprar:
1. Selecciona el plan
2. Envía el pago en USDT (TRC20)
3. Presiona 'Ya pagué'

Tu cuenta se activa automáticamente."

---

📊 ANÁLISIS DE WALLET (con imagen o dirección):
- Nunca afirmar bloqueo sin evidencia clara
- Diferenciar siempre: riesgo / blacklist / congelamiento

Si solo hay riesgo (sin congelamiento ni blacklist):
→ Explicar que no hay bloqueo directo. NO ofrecer servicio de $100.

Si hay congelamiento o blacklist confirmado:
→ Activar modo cierre con servicio de $100.

---

🛡️ PROTECCIÓN LEGAL:
Incluir cuando aplique: "CoinCash no bloquea wallets ni controla fondos. Nuestro servicio es informativo basado en datos públicos. No nos hacemos responsables por decisiones de terceros."

---

🚫 RESTRICCIONES:
- No inventar información
- No generar miedo innecesario
- No prometer resultados

MANEJO DE PREGUNTAS FUERA DE CONTEXTO:

Si el tema está relacionado con cripto (wallets, USDT, transacciones, problemas financieros en crypto):
→ NO rechazar. Redirigir hacia CoinCash como solución.
Ejemplo — Usuario: "¿Venden cripto?":
→ "Nosotros no vendemos criptomonedas directamente, pero podemos ayudarte a analizar wallets, detectar riesgos o verificar direcciones antes de operar 👍 Si vas a trabajar con cripto, eso te puede ayudar bastante. ¿Quieres revisar alguna wallet o transacción?"

Si el tema NO tiene nada que ver con cripto (clima, política, deportes, etc.):
→ "Estoy aquí para ayudarte con temas de CoinCash (wallets, planes o pagos). ¿En qué puedo ayudarte?"

Regla clave: nunca perder un cliente potencial por una mala interpretación.

---

🧠 REGLAS DE VENTA:
- No presionar agresivamente
- Guiar con confianza y claridad
- Siempre cerrar con una acción

Frase de cierre preferida: "Si deseas, puedo ayudarte a iniciar ahora mismo."`,
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

      // Step 1: Obtain the Telegram file URL
      let imageUrl: string | null = null;
      try {
        const fileRes  = await fetch(
          `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`,
        );
        const fileData = await fileRes.json();
        const filePath = fileData?.result?.file_path;
        if (filePath) {
          imageUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
        }
      } catch (err: any) {
        console.error("[openai-vision] Error obteniendo URL de imagen:", err?.message);
      }

      if (!imageUrl) {
        await sendToTelegram(
          telegramChatId,
          "No pude obtener la imagen. Por favor intenta enviarla de nuevo.",
        );
        return;
      }

      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        console.warn("[openai-vision] OPENAI_API_KEY no configurada");
        await sendToTelegram(
          telegramChatId,
          "Servicio de análisis de imágenes no disponible en este momento. Por favor escríbenos tu consulta.",
        );
        return;
      }

      // Step 2: Send to OpenAI vision (Responses API, gpt-4.1)
      let visionReply: string | null = null;
      let visionError = false;

      try {
        const visionRes = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type":  "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4.1",
            instructions: `Eres el asistente oficial de soporte de CoinCash especializado en análisis visual de wallets cripto (TRON, USDT, riesgo, blacklist, transacciones).

REGLAS LEGALES:
- Nunca afirmar que una wallet está bloqueada, congelada o en lista negra sin evidencia clara en la imagen.
- Diferenciar siempre entre "riesgo" y "bloqueo real".
- NO decir que CoinCash bloquea wallets ni tiene control sobre fondos.
- NO dar asesoría legal o financiera.
- Siempre proteger legalmente a CoinCash.

ANÁLISIS DE IMAGEN:

Si la imagen NO muestra claramente una wallet cripto o no puedes extraer información relevante:
→ Responde EXACTAMENTE: "IMAGEN_NO_CLARA"
(Solo esta palabra, sin más texto)

Si la wallet NO está congelada NI en blacklist:
→ Indica que hay indicadores de riesgo pero la wallet no está congelada ni en listas negras. Aclara que CoinCash es únicamente informativo. No ofrecer el servicio de $100.

Si la wallet SÍ está congelada o en blacklist (claramente visible en la imagen):
→ "Según la información proporcionada, la dirección presenta un estado que podría estar relacionado con congelamiento o inclusión en listas negras.

En este tipo de casos, ofrecemos un análisis avanzado para investigar el origen del bloqueo, identificar la posible entidad o plataforma involucrada y orientarte sobre los pasos a seguir.

Este servicio tiene un costo de $100 USD.

Importante: este servicio NO garantiza el desbloqueo de fondos. CoinCash no tiene control sobre wallets ni fondos. Nuestro trabajo es únicamente investigativo e informativo.

Si deseas continuar, te explico cómo iniciar el proceso."

Responde claro, profesional y directo.`,
            input: [
              {
                role: "user",
                content: [
                  {
                    type: "input_text",
                    text: "Analiza esta imagen de una wallet crypto y dime si está congelada, en blacklist o solo tiene riesgo.",
                  },
                  {
                    type: "input_image",
                    image_url: imageUrl,
                  },
                ],
              },
            ],
          }),
        });

        if (!visionRes.ok) {
          const errText = await visionRes.text();
          console.error("[openai-vision] API error:", errText.slice(0, 200));
          visionError = true;
        } else {
          const visionData = await visionRes.json();
          visionReply = visionData.output_text ?? null;
        }
      } catch (err: any) {
        console.error("[openai-vision] Fetch error:", err?.message);
        visionError = true;
      }

      // Step 3: Respond based on result
      const isUnclear = !visionReply || visionReply.trim() === "IMAGEN_NO_CLARA" || visionReply.trim().length < 10;

      if (!visionError && !isUnclear) {
        // OpenAI analyzed the image successfully → send analysis
        await sendToTelegram(telegramChatId, visionReply!);
        console.log(`[openai-vision] ✅ Análisis enviado a chat ${telegramChatId}`);
      } else if (visionError) {
        // Network/API error fallback
        await sendToTelegram(
          telegramChatId,
          "Gracias por tu mensaje.\n\nPara poder ayudarte con precisión, por favor envíanos la dirección de la wallet en texto o confirma si en la imagen aparece como \"congelada\" o \"en lista negra\".\n\nEsto nos permitirá orientarte correctamente.",
        );
        console.log(`[openai-vision] ⚠️  Error de API — fallback enviado a chat ${telegramChatId}`);
      } else {
        // Image unclear fallback
        await sendToTelegram(
          telegramChatId,
          "Gracias por tu mensaje.\n\nNo pude analizar completamente la imagen.\n\nPor favor confírmame:\n• ¿La wallet aparece como congelada?\n• ¿O aparece en lista negra?\n\nTambién puedes enviarme la dirección en texto para ayudarte mejor.",
        );
        console.log(`[openai-vision] ⚠️  Imagen no clara — fallback enviado a chat ${telegramChatId}`);
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
