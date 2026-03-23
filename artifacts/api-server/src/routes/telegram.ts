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
const CC_RE      = /CC-\d{6}/;

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
      createdAt:    saved.timestamp,
    };
    io.to(userId).emit("receive_message", msg);
    io.to(SUPPORT_ID).emit("receive_message", msg);
  }
}

/** Extract CC-XXXXXX from a string, or return null. */
function extractCcId(text: string): string | null {
  const m = CC_RE.exec(text ?? "");
  return m ? m[0] : null;
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

// ── POST /api/telegram-webhook ────────────────────────────────────────────────
// Registered as the Telegram Bot webhook.
// Receives updates, extracts admin replies, and routes them to the user's chat.

router.post("/telegram-webhook", async (req, res) => {
  // Always acknowledge immediately so Telegram doesn't retry.
  res.sendStatus(200);

  try {
    const update = req.body;
    const msg    = update?.message;

    if (!msg) return;

    const text    = (msg.text ?? "").trim();
    const fromBot = msg.from?.is_bot === true;

    // 1. Ignore empty messages or messages sent by the bot itself
    if (!text || fromBot) return;

    // 2. Ignore outgoing system notifications (messages the app sent TO Telegram)
    //    These start with the green circle emoji we use in send-telegram calls.
    if (text.startsWith("🟢")) return;

    // 3. Determine the target user CC-ID.
    //
    //    Strategy A (preferred): Admin replies to a notification using Telegram's
    //    reply feature → extract CC-ID from the original notification text.
    //
    //    Strategy B (fallback): Admin writes "CC-XXXXXX: mensaje" in a new message.

    let userId: string | null  = null;
    let replyText: string      = text;

    // Strategy A — reply_to_message
    const replyToText = msg.reply_to_message?.text ?? "";
    if (replyToText) {
      userId = extractCcId(replyToText);
    }

    // Strategy B — message starts with CC-XXXXXX
    if (!userId) {
      const colonIdx = text.indexOf(":");
      if (colonIdx > 0) {
        const candidate = text.slice(0, colonIdx).trim();
        if (CC_RE.test(candidate)) {
          userId    = candidate;
          replyText = text.slice(colonIdx + 1).trim();
        }
      }
      // Also handle "CC-XXXXXX mensaje" (space separator)
      if (!userId) {
        userId    = extractCcId(text);
        replyText = userId ? text.replace(CC_RE, "").trim() : text;
      }
    }

    if (!userId || !replyText) {
      console.log("[telegram-webhook] No se pudo determinar el userId o el mensaje. Ignorando.");
      return;
    }

    // 4. Deliver the reply to the in-app chat
    const io = req.app.get("io");
    await deliverSupportReply(io, userId, replyText);
    console.log(`[telegram-webhook] Respuesta entregada → ${userId}: ${replyText.slice(0, 80)}`);

  } catch (err: any) {
    console.error("[telegram-webhook] Error:", err?.message);
  }
});

export default router;
