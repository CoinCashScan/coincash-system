// @ts-nocheck
// PostgreSQL client — swap order logging + CoinCash user IDs.
// Uses DATABASE_URL from the Replit-managed environment.

import { Pool } from "pg";
import { createHash as _createHash } from "crypto";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (err: Error) => {
  console.error("[db] Pool error:", err.message);
});

// ── Swap order logging ────────────────────────────────────────────────────────

export interface SwapOrderRecord {
  ffOrderId:      string;
  ffToken?:       string;
  userWallet:     string;
  direction:      "usdt_to_trx" | "trx_to_usdt";
  inputToken:     "USDT" | "TRX";
  inputAmount:    number;
  outputToken:    "USDT" | "TRX";
  expectedOutput: number;
  depositAddress: string;
  coinCashFee:    number;
  status?:        string;
  inputTxId?:     string;
  relayTxId?:     string;
}

export async function logSwapOrder(rec: SwapOrderRecord): Promise<number | null> {
  try {
    const res = await pool.query<{ id: number }>(
      `INSERT INTO swap_orders
         (ff_order_id, ff_token, user_wallet, direction, input_token, input_amount,
          output_token, expected_output, deposit_address, coincash_fee, status, input_tx_id, relay_tx_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING id`,
      [
        rec.ffOrderId, rec.ffToken ?? null, rec.userWallet, rec.direction,
        rec.inputToken, rec.inputAmount, rec.outputToken, rec.expectedOutput,
        rec.depositAddress, rec.coinCashFee, rec.status ?? "pending",
        rec.inputTxId ?? null, rec.relayTxId ?? null,
      ],
    );
    const id = res.rows[0]?.id ?? null;
    console.log(`[db] swap_order logged id=${id} ff_order=${rec.ffOrderId}`);
    return id;
  } catch (err: any) {
    console.error("[db] logSwapOrder failed (non-fatal):", err?.message);
    return null;
  }
}

export async function updateSwapOrderTxIds(
  ffOrderId: string,
  inputTxId: string,
  relayTxId: string,
  status = "sent",
): Promise<void> {
  try {
    await pool.query(
      `UPDATE swap_orders
          SET input_tx_id = $1, relay_tx_id = $2, status = $3, updated_at = NOW()
        WHERE ff_order_id = $4`,
      [inputTxId, relayTxId, status, ffOrderId],
    );
    console.log(`[db] swap_order updated ff_order=${ffOrderId} status=${status}`);
  } catch (err: any) {
    console.error("[db] updateSwapOrderTxIds failed (non-fatal):", err?.message);
  }
}

// ── CoinCash user ID system ───────────────────────────────────────────────────

export interface UserRecord {
  id:             number;
  coincash_id:    string;
  wallet_address: string;
  created_at:     Date;
}

/** Create the users table if it doesn't already exist. */
export async function ensureUsersTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id             SERIAL PRIMARY KEY,
      coincash_id    TEXT UNIQUE NOT NULL,
      wallet_address TEXT        NOT NULL,
      created_at     TIMESTAMP   NOT NULL DEFAULT NOW()
    )
  `);
  // Index on wallet_address for fast lookups
  await pool.query(`
    CREATE INDEX IF NOT EXISTS users_wallet_address_idx ON users (wallet_address)
  `);
  console.log("[db] users table ready");
}

/** Generate a CC-XXXXXX ID with 6 random digits. */
function generateCoinCashId(): string {
  const digits = Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");
  return `CC-${digits}`;
}

/**
 * Return the existing CoinCash ID for a wallet address, or create one.
 * Retries up to 5 times on the rare CC-ID collision.
 */
export async function getOrCreateUser(walletAddress: string): Promise<UserRecord> {
  // 1. Look up by wallet address first
  const existing = await pool.query<UserRecord>(
    `SELECT id, coincash_id, wallet_address, created_at
       FROM users
      WHERE wallet_address = $1
      LIMIT 1`,
    [walletAddress],
  );
  if (existing.rows.length > 0) return existing.rows[0];

  // 2. Generate a unique CC-ID and insert (retry on collision)
  for (let attempt = 0; attempt < 5; attempt++) {
    const ccId = generateCoinCashId();
    try {
      const res = await pool.query<UserRecord>(
        `INSERT INTO users (coincash_id, wallet_address)
         VALUES ($1, $2)
         ON CONFLICT (coincash_id) DO NOTHING
         RETURNING id, coincash_id, wallet_address, created_at`,
        [ccId, walletAddress],
      );
      if (res.rows.length > 0) {
        console.log(`[db] New user created: ${ccId} → ${walletAddress}`);
        return res.rows[0];
      }
      // Conflict on coincash_id — retry with a new one
    } catch (err: any) {
      console.error("[db] getOrCreateUser insert error:", err?.message);
      throw err;
    }
  }
  throw new Error("Failed to generate a unique CoinCash ID after 5 attempts");
}

/**
 * Get or create a user, but use the caller-supplied coincashId instead of
 * generating a random one.  Used when the client already generated a local ID.
 *
 * Priority:
 *   1. If coincashId already exists in DB → return that record (collision: shared ID)
 *   2. If walletAddress already exists in DB → return that record
 *   3. Insert with the provided coincashId
 */
export async function getOrCreateUserWithCcId(
  walletAddress: string,
  coincashId:    string,
): Promise<UserRecord> {
  // 1. CC-ID already registered?
  const byCcId = await pool.query<UserRecord>(
    `SELECT id, coincash_id, wallet_address, created_at
       FROM users WHERE coincash_id = $1 LIMIT 1`,
    [coincashId],
  );
  if (byCcId.rows.length > 0) return byCcId.rows[0];

  // 2. Wallet already registered under a different CC-ID?
  const byWallet = await pool.query<UserRecord>(
    `SELECT id, coincash_id, wallet_address, created_at
       FROM users WHERE wallet_address = $1 LIMIT 1`,
    [walletAddress],
  );
  if (byWallet.rows.length > 0) return byWallet.rows[0];

  // 3. Insert with the locally-generated CC-ID
  const res = await pool.query<UserRecord>(
    `INSERT INTO users (coincash_id, wallet_address)
     VALUES ($1, $2)
     ON CONFLICT (coincash_id) DO NOTHING
     RETURNING id, coincash_id, wallet_address, created_at`,
    [coincashId, walletAddress],
  );
  if (res.rows.length > 0) {
    console.log(`[db] New user registered: ${coincashId} → ${walletAddress}`);
    return res.rows[0];
  }
  // Race condition — another insert won; fetch the winner
  const winner = await pool.query<UserRecord>(
    `SELECT id, coincash_id, wallet_address, created_at
       FROM users WHERE coincash_id = $1`,
    [coincashId],
  );
  return winner.rows[0];
}

/** Look up a user by their CoinCash ID. */
export async function getUserByCoinCashId(ccId: string): Promise<UserRecord | null> {
  const res = await pool.query<UserRecord>(
    `SELECT id, coincash_id, wallet_address, created_at
       FROM users
      WHERE coincash_id = $1
      LIMIT 1`,
    [ccId],
  );
  return res.rows[0] ?? null;
}

/** Look up a user by wallet address. */
export async function getUserByWallet(walletAddress: string): Promise<UserRecord | null> {
  const res = await pool.query<UserRecord>(
    `SELECT id, coincash_id, wallet_address, created_at
       FROM users
      WHERE wallet_address = $1
      LIMIT 1`,
    [walletAddress],
  );
  return res.rows[0] ?? null;
}

// ── Chat users ────────────────────────────────────────────────────────────────

export interface ChatUserRecord {
  id:          number;
  coincash_id: string;
  name:        string;
  role:        string;
  linked_to:   string | null;
  created_at:  Date;
}

const SYSTEM_SUPPORT_ID = "CC-SUPPORT";
const ADMIN_CC_ID        = "CC-801286";

/** Create the chat_users table and seed system accounts. */
export async function ensureChatUsersTable(): Promise<void> {
  // Create base table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_users (
      id          SERIAL    PRIMARY KEY,
      coincash_id TEXT      UNIQUE NOT NULL,
      name        TEXT      NOT NULL DEFAULT '',
      role        TEXT      NOT NULL DEFAULT 'user',
      created_at  TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  // Idempotent column additions (safe if already exist)
  await pool.query(`ALTER TABLE chat_users ADD COLUMN IF NOT EXISTS name      TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE chat_users ADD COLUMN IF NOT EXISTS role      TEXT NOT NULL DEFAULT 'user'`);
  await pool.query(`ALTER TABLE chat_users ADD COLUMN IF NOT EXISTS linked_to TEXT`);
  await pool.query(`ALTER TABLE chat_users ADD COLUMN IF NOT EXISTS photo_url TEXT`);

  // 1. Seed CC-SUPPORT system account
  await pool.query(
    `INSERT INTO chat_users (coincash_id, name, role, linked_to)
     VALUES ($1, $2, $3, NULL)
     ON CONFLICT (coincash_id) DO UPDATE
       SET name = EXCLUDED.name, role = EXCLUDED.role`,
    [SYSTEM_SUPPORT_ID, "Soporte CoinCash", "system"],
  );

  // 2. Seed CC-801286 as admin linked to CC-SUPPORT
  await pool.query(
    `INSERT INTO chat_users (coincash_id, name, role, linked_to)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (coincash_id) DO UPDATE
       SET name      = EXCLUDED.name,
           role      = EXCLUDED.role,
           linked_to = EXCLUDED.linked_to`,
    [ADMIN_CC_ID, "Soporte CoinCash", "admin", SYSTEM_SUPPORT_ID],
  );

  console.log("[db] chat_users table ready — CC-SUPPORT + admin seeded");
}

/**
 * Register a user CC-ID in chat_users (upsert).
 * Safe to call every time the chat opens — always returns the stored record.
 */
export async function getOrCreateChatUser(coincashId: string): Promise<ChatUserRecord> {
  const res = await pool.query<ChatUserRecord>(
    `INSERT INTO chat_users (coincash_id, name, role, linked_to)
     VALUES ($1, '', 'user', NULL)
     ON CONFLICT (coincash_id) DO UPDATE SET coincash_id = EXCLUDED.coincash_id
     RETURNING id, coincash_id, name, role, linked_to, created_at`,
    [coincashId],
  );
  return res.rows[0];
}

/** Look up a chat user by CoinCash ID. Returns null if not found. */
export async function getChatUserById(coincashId: string): Promise<ChatUserRecord | null> {
  const res = await pool.query<ChatUserRecord>(
    `SELECT id, coincash_id, name, role, linked_to, created_at
       FROM chat_users
      WHERE coincash_id = $1
      LIMIT 1`,
    [coincashId],
  );
  return res.rows[0] ?? null;
}

/** Update a user's profile photo URL. */
export async function updateChatUserPhoto(coincashId: string, photoUrl: string): Promise<void> {
  await pool.query(
    `UPDATE chat_users SET photo_url = $2 WHERE coincash_id = $1`,
    [coincashId, photoUrl],
  );
}

/** Return all regular (non-system) chat users. Used by broadcast. */
export async function getAllChatUsers(): Promise<ChatUserRecord[]> {
  const res = await pool.query<ChatUserRecord>(
    `SELECT id, coincash_id, name, role, linked_to, created_at
       FROM chat_users
      WHERE role != 'system'
      ORDER BY created_at ASC`,
  );
  return res.rows;
}

// ── Chat contacts ─────────────────────────────────────────────────────────────

export interface ChatContactRecord {
  id:         number;
  user_id:    string;
  contact_id: string;
  created_at: Date;
}

/** Create the chat_contacts table if it doesn't already exist. */
export async function ensureChatContactsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_contacts (
      id         SERIAL    PRIMARY KEY,
      user_id    TEXT      NOT NULL,
      contact_id TEXT      NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, contact_id)
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS chat_contacts_user_idx    ON chat_contacts (user_id)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS chat_contacts_contact_idx ON chat_contacts (contact_id)
  `);
  console.log("[db] chat_contacts table ready");
}

/** Add a contact relationship (idempotent). Returns the record. */
export async function addChatContact(
  userId:    string,
  contactId: string,
): Promise<ChatContactRecord> {
  const res = await pool.query<ChatContactRecord>(
    `INSERT INTO chat_contacts (user_id, contact_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, contact_id) DO UPDATE SET user_id = EXCLUDED.user_id
     RETURNING id, user_id, contact_id, created_at`,
    [userId, contactId],
  );
  return res.rows[0];
}

/** Return all contacts for a given user. */
export async function getChatContacts(userId: string): Promise<ChatContactRecord[]> {
  const res = await pool.query<ChatContactRecord>(
    `SELECT id, user_id, contact_id, created_at
       FROM chat_contacts
      WHERE user_id = $1
      ORDER BY created_at ASC`,
    [userId],
  );
  return res.rows;
}

// ── Chat messages ─────────────────────────────────────────────────────────────

export interface ChatMessage {
  id:                   number;
  sender_coincash_id:   string;
  receiver_coincash_id: string;
  message:              string;
  timestamp:            Date;
}

/** Create the chat_messages table if it doesn't already exist. */
export async function ensureMessagesTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id                   SERIAL PRIMARY KEY,
      sender_coincash_id   TEXT      NOT NULL,
      receiver_coincash_id TEXT      NOT NULL,
      message              TEXT      NOT NULL,
      timestamp            TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS chat_messages_sender_idx   ON chat_messages (sender_coincash_id)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS chat_messages_receiver_idx ON chat_messages (receiver_coincash_id)
  `);
  // Track read status for admin notifications
  await pool.query(`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT FALSE`);
  console.log("[db] chat_messages table ready");
}

/** Delete support chat messages older than 24 hours. */
export async function deleteOldChatMessages(): Promise<number> {
  const res = await pool.query(
    `DELETE FROM chat_messages WHERE timestamp < NOW() - INTERVAL '24 hours'`
  );
  return res.rowCount ?? 0;
}

/** Persist a new chat message. */
export async function saveChatMessage(
  senderCcId:   string,
  receiverCcId: string,
  message:      string,
): Promise<ChatMessage> {
  const res = await pool.query<ChatMessage>(
    `INSERT INTO chat_messages (sender_coincash_id, receiver_coincash_id, message)
     VALUES ($1, $2, $3)
     RETURNING id, sender_coincash_id, receiver_coincash_id, message, timestamp`,
    [senderCcId, receiverCcId, message],
  );
  return res.rows[0];
}

/**
 * Retrieve all messages where ccId is sender or receiver (full inbox).
 */
export async function getChatMessages(ccId: string, limit = 100): Promise<ChatMessage[]> {
  const res = await pool.query<ChatMessage>(
    `SELECT id, sender_coincash_id, receiver_coincash_id, message, timestamp
       FROM chat_messages
      WHERE sender_coincash_id = $1
         OR receiver_coincash_id = $1
      ORDER BY timestamp ASC
      LIMIT $2`,
    [ccId, limit],
  );
  return res.rows;
}

/** Summary of a support conversation for the admin panel. */
export interface ConversationSummary {
  userId:      string;
  lastMessage: string;
  lastTime:    Date;
  lastSender:  string;
}

/**
 * For the admin panel: return the latest message per user who has
 * chatted with CC-SUPPORT, ordered by most-recent first. Includes unreadCount.
 */
export async function getConversationsForSupport(): Promise<ConversationSummary[]> {
  const res = await pool.query<ConversationSummary & { unreadCount: number }>(`
    SELECT DISTINCT ON (sub.user_id)
      sub.user_id            AS "userId",
      sub.message            AS "lastMessage",
      sub.timestamp          AS "lastTime",
      sub.sender_coincash_id AS "lastSender",
      cu.photo_url           AS "photoUrl",
      COALESCE((
        SELECT COUNT(*)::int FROM chat_messages
        WHERE sender_coincash_id = sub.user_id
          AND receiver_coincash_id = 'CC-SUPPORT'
          AND is_read = FALSE
      ), 0) AS "unreadCount"
    FROM (
      SELECT
        CASE
          WHEN sender_coincash_id = 'CC-SUPPORT' THEN receiver_coincash_id
          ELSE sender_coincash_id
        END AS user_id,
        message,
        timestamp,
        sender_coincash_id
      FROM chat_messages
      WHERE sender_coincash_id = 'CC-SUPPORT'
         OR receiver_coincash_id = 'CC-SUPPORT'
    ) sub
    LEFT JOIN chat_users cu ON cu.coincash_id = sub.user_id
    ORDER BY sub.user_id, "lastTime" DESC
  `);
  return res.rows.sort(
    (a, b) => new Date(b.lastTime).getTime() - new Date(a.lastTime).getTime(),
  );
}

/**
 * Mark all unread messages from a specific user to CC-SUPPORT as read.
 * Called when the admin opens a conversation.
 */
export async function markMessagesRead(fromUserId: string): Promise<void> {
  await pool.query(
    `UPDATE chat_messages
        SET is_read = TRUE
      WHERE sender_coincash_id = $1
        AND receiver_coincash_id = 'CC-SUPPORT'
        AND is_read = FALSE`,
    [fromUserId],
  );
}

/**
 * Retrieve only the messages exchanged between two specific CoinCash IDs.
 * Ordered chronologically.
 */
export async function getConversation(
  ccId1: string,
  ccId2: string,
  limit = 200,
): Promise<ChatMessage[]> {
  const res = await pool.query<ChatMessage>(
    `SELECT id, sender_coincash_id, receiver_coincash_id, message, timestamp
       FROM chat_messages
      WHERE (sender_coincash_id = $1 AND receiver_coincash_id = $2)
         OR (sender_coincash_id = $2 AND receiver_coincash_id = $1)
      ORDER BY timestamp ASC
      LIMIT $3`,
    [ccId1, ccId2, limit],
  );
  return res.rows;
}

// ── Direct Messages (DMs) ─────────────────────────────────────────────────────

export interface DmContact {
  id:         number;
  owner_id:   string;
  contact_id: string;
  nickname:   string | null;
  created_at: Date;
}

export interface DmMessage {
  id:          number;
  sender_id:   string;
  receiver_id: string;
  msg_type:    "text" | "image" | "audio";
  ciphertext:  string | null;
  iv:          string | null;
  object_path: string | null;
  created_at:  Date;
}

export async function ensureDmTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dm_contacts (
      id         SERIAL PRIMARY KEY,
      owner_id   TEXT NOT NULL,
      contact_id TEXT NOT NULL,
      nickname   TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(owner_id, contact_id)
    )
  `);
  // migrate: add nickname if missing
  await pool.query(`ALTER TABLE dm_contacts ADD COLUMN IF NOT EXISTS nickname TEXT`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dm_messages (
      id          SERIAL PRIMARY KEY,
      sender_id   TEXT NOT NULL,
      receiver_id TEXT NOT NULL,
      msg_type    TEXT NOT NULL DEFAULT 'text',
      ciphertext  TEXT,
      iv          TEXT,
      object_path TEXT,
      created_at  TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS dm_msgs_pair_idx ON dm_messages (sender_id, receiver_id)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id         SERIAL PRIMARY KEY,
      cc_id      TEXT NOT NULL,
      endpoint   TEXT NOT NULL,
      p256dh     TEXT NOT NULL,
      auth       TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(cc_id, endpoint)
    )
  `);
  console.log("[db] dm_contacts + dm_messages + push_subscriptions tables ready");
}

export async function setDmContactNickname(
  ownerId:   string,
  contactId: string,
  nickname:  string,
): Promise<void> {
  await pool.query(
    `UPDATE dm_contacts SET nickname = $1 WHERE owner_id = $2 AND contact_id = $3`,
    [nickname.trim() || null, ownerId, contactId],
  );
}

// ── Push subscriptions ──────────────────────────────────────────────────────

export interface PushSub {
  cc_id:    string;
  endpoint: string;
  p256dh:   string;
  auth:     string;
}

export async function savePushSubscription(sub: PushSub): Promise<void> {
  await pool.query(
    `INSERT INTO push_subscriptions (cc_id, endpoint, p256dh, auth)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (cc_id, endpoint) DO UPDATE SET p256dh=$3, auth=$4`,
    [sub.cc_id, sub.endpoint, sub.p256dh, sub.auth],
  );
}

export async function deletePushSubscription(ccId: string, endpoint: string): Promise<void> {
  await pool.query(
    `DELETE FROM push_subscriptions WHERE cc_id=$1 AND endpoint=$2`,
    [ccId, endpoint],
  );
}

export async function getPushSubscriptionsForUser(ccId: string): Promise<PushSub[]> {
  const res = await pool.query<PushSub>(
    `SELECT cc_id, endpoint, p256dh, auth FROM push_subscriptions WHERE cc_id=$1`,
    [ccId],
  );
  return res.rows;
}

export async function addDmContact(ownerId: string, contactId: string): Promise<DmContact | null> {
  const res = await pool.query<DmContact>(
    `INSERT INTO dm_contacts (owner_id, contact_id)
     VALUES ($1, $2)
     ON CONFLICT (owner_id, contact_id) DO NOTHING
     RETURNING *`,
    [ownerId, contactId],
  );
  return res.rows[0] ?? null;
}

export async function getDmContacts(ownerId: string): Promise<DmContact[]> {
  const res = await pool.query<DmContact>(
    `SELECT * FROM dm_contacts WHERE owner_id = $1 ORDER BY created_at DESC`,
    [ownerId],
  );
  return res.rows;
}

export async function removeDmContact(ownerId: string, contactId: string): Promise<void> {
  await pool.query(
    `DELETE FROM dm_contacts WHERE owner_id = $1 AND contact_id = $2`,
    [ownerId, contactId],
  );
}

export async function saveDmMessage(
  senderId:   string,
  receiverId: string,
  msgType:    "text" | "image" | "audio",
  ciphertext: string | null,
  iv:         string | null,
  objectPath: string | null,
): Promise<DmMessage> {
  const res = await pool.query<DmMessage>(
    `INSERT INTO dm_messages (sender_id, receiver_id, msg_type, ciphertext, iv, object_path)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [senderId, receiverId, msgType, ciphertext, iv, objectPath],
  );
  return res.rows[0];
}

export async function getDmMessages(
  userId1: string,
  userId2: string,
  limit = 150,
): Promise<DmMessage[]> {
  const res = await pool.query<DmMessage>(
    `SELECT * FROM dm_messages
      WHERE (sender_id = $1 AND receiver_id = $2)
         OR (sender_id = $2 AND receiver_id = $1)
      ORDER BY created_at ASC
      LIMIT $3`,
    [userId1, userId2, limit],
  );
  return res.rows;
}

// ── Visit tracking ─────────────────────────────────────────────────────────────

/** Create the visit_log table if it doesn't already exist. */
export async function ensureVisitsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS visit_log (
      id           SERIAL    PRIMARY KEY,
      country      TEXT      NOT NULL DEFAULT 'Desconocido',
      country_code TEXT      NOT NULL DEFAULT 'xx',
      visited_at   TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS visit_log_visited_at_idx ON visit_log (visited_at)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS visit_log_country_code_idx ON visit_log (country_code)
  `);
  console.log("[db] visit_log table ready");
}

/** Record a single visit. */
export async function recordVisit(country: string, countryCode: string): Promise<void> {
  await pool.query(
    `INSERT INTO visit_log (country, country_code) VALUES ($1, $2)`,
    [country, countryCode],
  );
}

/** Delete all visit records (admin reset). Returns number of rows deleted. */
export async function resetVisitStats(): Promise<number> {
  const res = await pool.query(`DELETE FROM visit_log`);
  return res.rowCount ?? 0;
}

// ── Account PIN (recovery security) ──────────────────────────────────────────

export async function ensureAccountPinsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS account_pins (
      coincash_id TEXT PRIMARY KEY,
      pin_hash    TEXT NOT NULL,
      created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  console.log("[db] account_pins table ready");
}

export async function setAccountPin(ccId: string, pinHash: string): Promise<void> {
  await pool.query(
    `INSERT INTO account_pins (coincash_id, pin_hash, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (coincash_id) DO UPDATE SET pin_hash = $2, updated_at = NOW()`,
    [ccId, pinHash],
  );
}

export async function getAccountPinHash(ccId: string): Promise<string | null> {
  const res = await pool.query<{ pin_hash: string }>(
    `SELECT pin_hash FROM account_pins WHERE coincash_id = $1`,
    [ccId],
  );
  return res.rows[0]?.pin_hash ?? null;
}

export async function hasPinSet(ccId: string): Promise<boolean> {
  const res = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM account_pins WHERE coincash_id = $1) AS exists`,
    [ccId],
  );
  return res.rows[0]?.exists ?? false;
}

// ── Scan analytics ─────────────────────────────────────────────────────────────

/** Create the scan_log table and ensure all tracking columns exist. */
export async function ensureScanTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scan_log (
      id           SERIAL    PRIMARY KEY,
      wallet       TEXT      NOT NULL,
      ip           TEXT      NOT NULL DEFAULT '',
      country      TEXT      NOT NULL DEFAULT 'Desconocido',
      country_code TEXT      NOT NULL DEFAULT 'xx',
      scanned_at   TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  // Add tracking columns if they don't exist yet (safe migration)
  await pool.query(`ALTER TABLE scan_log ADD COLUMN IF NOT EXISTS device_id  TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE scan_log ADD COLUMN IF NOT EXISTS cc_id      TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE scan_log ADD COLUMN IF NOT EXISTS ip_hash    TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE scan_log ADD COLUMN IF NOT EXISTS plan_type  TEXT NOT NULL DEFAULT 'free'`);
  await pool.query(`CREATE INDEX IF NOT EXISTS scan_log_scanned_at_idx   ON scan_log (scanned_at)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS scan_log_country_code_idx ON scan_log (country_code)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS scan_log_device_id_idx    ON scan_log (device_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS scan_log_cc_id_idx        ON scan_log (cc_id)`);
  console.log("[db] scan_log table ready (with tracking columns)");
}

/** Record a single scan event — legacy, no tracking fields. */
export async function recordScan(wallet: string, country: string, countryCode: string): Promise<void> {
  await pool.query(
    `INSERT INTO scan_log (wallet, ip, country, country_code) VALUES ($1, '', $2, $3)`,
    [wallet, country, countryCode],
  );
}

/** Record a full scan event with device tracking. */
export async function recordScanFull(opts: {
  wallet:      string;
  country:     string;
  countryCode: string;
  deviceId:    string;
  ccId:        string;
  ipHash:      string;
  planType:    "free" | "pro";
}): Promise<void> {
  await pool.query(
    `INSERT INTO scan_log (wallet, ip, country, country_code, device_id, cc_id, ip_hash, plan_type)
     VALUES ($1, '', $2, $3, $4, $5, $6, $7)`,
    [opts.wallet, opts.country, opts.countryCode, opts.deviceId, opts.ccId, opts.ipHash, opts.planType],
  );
}

/** Delete all scan records (admin reset). Returns number of rows deleted. */
export async function resetScanStats(): Promise<number> {
  const res = await pool.query(`DELETE FROM scan_log`);
  return res.rowCount ?? 0;
}

/** Return scan statistics including device tracking data. */
export async function getScanStats(): Promise<{
  total:     number;
  today:     number;
  byCountry: { name: string; code: string; count: number }[];
  recent:    {
    id: number; wallet: string; country: string; country_code: string;
    device_id: string; cc_id: string; ip_hash: string; plan_type: string; scanned_at: string;
  }[];
}> {
  const [totalRes, todayRes, countryRes, recentRes] = await Promise.all([
    pool.query<{ total: string }>(`SELECT COUNT(*) AS total FROM scan_log`),
    pool.query<{ total: string }>(`SELECT COUNT(*) AS total FROM scan_log WHERE scanned_at >= DATE_TRUNC('day', NOW())`),
    pool.query<{ name: string; code: string; count: string }>(`
      SELECT country AS name, country_code AS code, COUNT(*) AS count
        FROM scan_log
       GROUP BY country, country_code
       ORDER BY count DESC
       LIMIT 20
    `),
    pool.query(`
      SELECT id, wallet, country, country_code, device_id, cc_id, ip_hash, plan_type, scanned_at
        FROM scan_log
       ORDER BY scanned_at DESC
       LIMIT 100
    `),
  ]);

  return {
    total:     parseInt(totalRes.rows[0]?.total  ?? "0", 10),
    today:     parseInt(todayRes.rows[0]?.total  ?? "0", 10),
    byCountry: countryRes.rows.map(r => ({ name: r.name, code: r.code, count: parseInt(r.count, 10) })),
    recent:    recentRes.rows,
  };
}

/**
 * Return per-device scan statistics, with IP-sharing abuse detection.
 * Devices that share an IP hash with other devices are flagged as possible evasion.
 */
export async function getDeviceStats(): Promise<{
  devices: {
    device_id: string; cc_id: string; ip_hash: string;
    total_scans: number; scans_today: number; last_seen: string;
    possible_evasion: boolean;
    is_active: boolean;
    is_blocked: boolean;
  }[];
  abusiveIpHashes: string[];
}> {
  const [deviceRes, ipShareRes, activeRes] = await Promise.all([
    // Unified source: scan_log rows (rich) UNION group_scan_limits rows not yet in scan_log today.
    // This ensures devices that scanned via the old /freemium/record endpoint are also visible.
    pool.query(`
      SELECT
        device_id,
        cc_id,
        ip_hash,
        total_scans,
        scans_today,
        last_seen
      FROM (
        -- Source 1: scan_log with device_id — richest data
        SELECT
          sl.device_id,
          sl.cc_id,
          sl.ip_hash,
          COUNT(*)                                                            AS total_scans,
          COUNT(*) FILTER (WHERE sl.scanned_at >= DATE_TRUNC('day', NOW()))  AS scans_today,
          MAX(sl.scanned_at)                                                  AS last_seen
        FROM scan_log sl
        WHERE sl.device_id != ''
        GROUP BY sl.device_id, sl.cc_id, sl.ip_hash

        UNION ALL

        -- Source 2: scan_log rows with empty device_id — grouped by cc_id
        -- Covers users whose client didn't send a deviceId
        SELECT
          ''        AS device_id,
          sl.cc_id,
          sl.ip_hash,
          COUNT(*)                                                            AS total_scans,
          COUNT(*) FILTER (WHERE sl.scanned_at >= DATE_TRUNC('day', NOW()))  AS scans_today,
          MAX(sl.scanned_at)                                                  AS last_seen
        FROM scan_log sl
        WHERE sl.device_id = '' AND sl.cc_id != ''
        GROUP BY sl.cc_id, sl.ip_hash

        UNION ALL

        -- Source 3: group_scan_limits today — catches old /freemium/record clients
        SELECT
          g.device_id,
          COALESCE(ad.cc_id, '') AS cc_id,
          g.group_id             AS ip_hash,
          g.scan_count::bigint   AS total_scans,
          g.scan_count::bigint   AS scans_today,
          NOW()                  AS last_seen
        FROM group_scan_limits g
        LEFT JOIN active_devices ad ON ad.device_id = g.device_id
        WHERE g.scan_date = CURRENT_DATE
          AND g.device_id != ''
          AND g.device_id NOT IN (SELECT DISTINCT device_id FROM scan_log WHERE device_id != '')

        UNION ALL

        -- Source 4: scan_limits by cc_id — last resort fallback for users with no device/IP tracking
        -- Catches cc_ids that scanned but appear in none of the above
        SELECT
          ''             AS device_id,
          sl.cc_id,
          ''             AS ip_hash,
          sl.scan_count::bigint AS total_scans,
          sl.scan_count::bigint AS scans_today,
          NOW()          AS last_seen
        FROM scan_limits sl
        WHERE sl.scan_date = CURRENT_DATE
          AND sl.cc_id != ''
          AND sl.cc_id NOT IN (
            SELECT DISTINCT cc_id FROM scan_log WHERE cc_id != ''
          )
          AND sl.cc_id NOT IN (
            SELECT DISTINCT COALESCE(ad.cc_id, '') FROM group_scan_limits g
            LEFT JOIN active_devices ad ON ad.device_id = g.device_id
            WHERE g.scan_date = CURRENT_DATE AND g.device_id != ''
          )
      ) combined
      ORDER BY scans_today DESC, last_seen DESC
      LIMIT 300
    `),
    pool.query<{ ip_hash: string; device_count: string }>(`
      SELECT ip_hash, COUNT(DISTINCT device_id) AS device_count
      FROM (
        SELECT device_id, ip_hash FROM scan_log
        WHERE device_id != '' AND ip_hash != ''
          AND scanned_at >= DATE_TRUNC('day', NOW())
        UNION ALL
        SELECT device_id, group_id AS ip_hash FROM group_scan_limits
        WHERE device_id != '' AND group_id != ''
          AND scan_date = CURRENT_DATE
      ) combined
      GROUP BY ip_hash
      HAVING COUNT(DISTINCT device_id) > 1
    `),
    // Pull all active_devices so we can mark each row ACTIVO / BLOQUEADO
    pool.query<{ cc_id: string; group_id: string; device_id: string }>(`
      SELECT cc_id, group_id, device_id FROM active_devices
    `),
  ]);

  const abusiveIpHashes = ipShareRes.rows.map(r => r.ip_hash);
  const abusiveSet = new Set(abusiveIpHashes);

  // Build a lookup: (cc_id + group_id) → active device_id
  const activeMap = new Map<string, string>();
  for (const row of activeRes.rows) {
    activeMap.set(`${row.cc_id}::${row.group_id}`, row.device_id);
  }

  return {
    devices: deviceRes.rows.map(r => {
      const lookupKey    = `${r.cc_id}::${r.ip_hash}`;
      const activeDevice = activeMap.get(lookupKey);
      const is_active    = !!activeDevice && activeDevice === r.device_id;
      const is_blocked   = !!activeDevice && activeDevice !== r.device_id;
      return {
        device_id:        r.device_id,
        cc_id:            r.cc_id,
        ip_hash:          r.ip_hash,
        total_scans:      parseInt(r.total_scans, 10),
        scans_today:      parseInt(r.scans_today, 10),
        last_seen:        r.last_seen,
        possible_evasion: abusiveSet.has(r.ip_hash),
        is_active,
        is_blocked,
      };
    }),
    abusiveIpHashes,
  };
}

// ── Freemium ──────────────────────────────────────────────────────────────────

export const FREE_SCAN_LIMIT = 5;

// ── Device identification ─────────────────────────────────────────────────────

/**
 * Create the device_ids table that maps browser fingerprints to CC-IDs.
 * Safe to re-run (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
 */
export async function ensureDeviceTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS device_ids (
      fp_hash    TEXT PRIMARY KEY,
      cc_id      TEXT NOT NULL,
      ua_hash    TEXT NOT NULL DEFAULT '',
      last_ip    TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE device_ids ADD COLUMN IF NOT EXISTS sync_code TEXT`);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS device_ids_cc_id_idx ON device_ids (cc_id)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS device_ids_ua_ip_idx ON device_ids (ua_hash, last_ip)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS device_ids_ip_idx ON device_ids (last_ip)
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS device_ids_sync_code_idx ON device_ids (sync_code)
    WHERE sync_code IS NOT NULL
  `);
  console.log("[db] device_ids table ready");
}

/** Generate a human-friendly 8-char sync code (no ambiguous chars). */
function generateSyncCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/**
 * Return the sync code for a given CC-ID.
 * If none exists yet (old records), generates and saves one.
 */
export async function getSyncCodeForCC(ccId: string): Promise<string | null> {
  // Try to find an existing sync code for this CC-ID
  const existing = await pool.query<{ sync_code: string | null }>(
    `SELECT sync_code FROM device_ids WHERE cc_id = $1 AND sync_code IS NOT NULL LIMIT 1`,
    [ccId],
  );
  if (existing.rows.length > 0 && existing.rows[0].sync_code) {
    return existing.rows[0].sync_code;
  }
  // Generate a new one and save it on any row for this cc_id
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateSyncCode();
    try {
      const updated = await pool.query<{ sync_code: string }>(
        `UPDATE device_ids SET sync_code = $1
         WHERE ctid = (SELECT ctid FROM device_ids WHERE cc_id = $2 LIMIT 1)
           AND sync_code IS NULL
         RETURNING sync_code`,
        [code, ccId],
      );
      if (updated.rows.length > 0) return updated.rows[0].sync_code;
    } catch { /* unique conflict — retry */ }
  }
  return null;
}

/**
 * Look up a CC-ID by its sync code.
 * Returns null if the code is invalid.
 */
export async function getDeviceBySyncCode(code: string): Promise<string | null> {
  const normalized = code.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 8);
  if (normalized.length !== 8) return null;
  const row = await pool.query<{ cc_id: string }>(
    `SELECT cc_id FROM device_ids WHERE sync_code = $1 LIMIT 1`,
    [normalized],
  );
  return row.rows[0]?.cc_id ?? null;
}

/** Hash text with node's built-in crypto (sync). */
function quickHash(text: string): string {
  return _createHash("sha256").update(text).digest("hex");
}

/**
 * Look up an existing CC-ID for the given browser fingerprint.
 * If none found, generate a fresh CC-ID and persist it.
 *
 * Resolution order:
 *  1. Fingerprint hash — each browser/device has a unique canvas fingerprint.
 *     This correctly distinguishes two phones even on the same WiFi.
 *  2. Brand-new device — generate a fresh CC-ID (always FREE).
 *
 * SECURITY NOTES:
 * - IP is NOT used for identity (caused all devices on same WiFi to share a CC-ID).
 * - The localStorage hint is NOT used to claim existing CC-IDs.
 *   Allowing hint recovery let any device that had a CC-ID in localStorage
 *   inherit the plan (including PRO) of another device, which is the root
 *   cause of the "PRO leaking to a second phone" bug.
 * - PRO users who need to recover their account on a new browser use the
 *   sync code system (GET /freemium/synccode + POST /freemium/sync).
 */
export async function identifyDevice(
  fpHash: string,
  ua: string,
  ip: string,
  hint?: string,
): Promise<string> {
  const uaHash = quickHash(ua);
  const safeIp = (ip ?? "").split(",")[0].trim().slice(0, 64);

  // 1. Fingerprint lookup — sole identity signal.
  if (fpHash) {
    const row = await pool.query<{ cc_id: string }>(
      `SELECT cc_id FROM device_ids WHERE fp_hash = $1 LIMIT 1`,
      [fpHash],
    );
    if (row.rows.length > 0) {
      const ccId = row.rows[0].cc_id;
      pool.query(
        `UPDATE device_ids SET ua_hash = $2, last_ip = $3 WHERE fp_hash = $1`,
        [fpHash, uaHash, safeIp],
      ).catch(() => {});
      return ccId;
    }
  }

  // 2. Brand-new device — always starts FREE.
  let ccId = generateCoinCashId();

  // Ensure user row exists in users table
  await pool.query(
    `INSERT INTO users (coincash_id, wallet_address, plan, email)
     VALUES ($1, '', 'free', '') ON CONFLICT (coincash_id) DO NOTHING`,
    [ccId],
  );

  // Persist device record
  if (fpHash) {
    await pool.query(
      `INSERT INTO device_ids (fp_hash, cc_id, ua_hash, last_ip)
       VALUES ($1, $2, $3, $4) ON CONFLICT (fp_hash) DO UPDATE
         SET cc_id = EXCLUDED.cc_id, ua_hash = EXCLUDED.ua_hash, last_ip = EXCLUDED.last_ip`,
      [fpHash, ccId, uaHash, safeIp],
    );
  }

  return ccId;
}

/** Add plan column to users + create scan_limits + ip_scan_limits tables. Safe to re-run. */
export async function ensureFreemiumTable(): Promise<void> {
  // Add plan column to existing users table
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free'`);
  // Optional email for upgrade requests
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT ''`);
  // Timestamp when user requested upgrade (pending payment)
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS upgrade_requested_at TIMESTAMP`);
  // Timestamp when PRO was activated (used to calculate 30-day expiry)
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS pro_activated_at TIMESTAMP`);
  // Remaining scans for paid plans (basico=100, pro=250; NULL = unlimited legacy pro or free)
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS paid_scans_remaining INT`);
  // Plan the user selected when they clicked "Ya pagué" (basico | pro)
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS upgrade_plan TEXT`);
  // Amount in USDT they intend to pay
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS upgrade_amount NUMERIC(10,2)`);
  // Number of scans in their chosen plan (100 | 250)
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS upgrade_scans INT`);
  // Table to prevent double-spending of the same TronGrid transaction ID
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payment_txids (
      tx_id        TEXT PRIMARY KEY,
      coincash_id  TEXT NOT NULL,
      plan         TEXT NOT NULL,
      amount_usdt  NUMERIC(12,6) NOT NULL,
      verified_at  TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  // Daily scan counter per CC-ID
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scan_limits (
      cc_id      TEXT NOT NULL,
      scan_date  DATE NOT NULL DEFAULT CURRENT_DATE,
      scan_count INT  NOT NULL DEFAULT 0,
      PRIMARY KEY (cc_id, scan_date)
    )
  `);
  // Daily scan counter per IP (hashed) — kept as reference only, not used for blocking
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ip_scan_limits (
      ip_hash    TEXT NOT NULL,
      scan_date  DATE NOT NULL DEFAULT CURRENT_DATE,
      scan_count INT  NOT NULL DEFAULT 0,
      PRIMARY KEY (ip_hash, scan_date)
    )
  `);
  // Daily scan counter per device_id (UUID from localStorage) — kept for reference
  await pool.query(`
    CREATE TABLE IF NOT EXISTS device_scan_limits (
      device_id  TEXT NOT NULL,
      scan_date  DATE NOT NULL DEFAULT CURRENT_DATE,
      scan_count INT  NOT NULL DEFAULT 0,
      PRIMARY KEY (device_id, scan_date)
    )
  `);
  // Hybrid anti-abuse: group_id (hashed IP) + device_id — shared group limit PRIMARY control
  // Each row = one device's contribution to the group's total scan count for the day.
  // group_id = SHA256(IP) → all devices on same network share the 5-scan/day pool.
  // last_reset is implicit: rows only match CURRENT_DATE, so next day = automatic reset.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS group_scan_limits (
      group_id   TEXT NOT NULL,
      device_id  TEXT NOT NULL,
      scan_date  DATE NOT NULL DEFAULT CURRENT_DATE,
      scan_count INT  NOT NULL DEFAULT 0,
      PRIMARY KEY (group_id, device_id, scan_date)
    )
  `);
  // IP whitelist: admin-approved IP hashes that bypass evasion detection (legacy, kept for compat)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ip_whitelist (
      ip_hash    TEXT PRIMARY KEY,
      note       TEXT NOT NULL DEFAULT '',
      added_at   TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  // Device whitelist: whitelist per individual device_id (granular control)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS device_whitelist (
      device_id  TEXT PRIMARY KEY,
      note       TEXT NOT NULL DEFAULT '',
      added_at   TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  // Active device tracker: for each (cc_id, group_id) only ONE device_id is "active"
  await pool.query(`
    CREATE TABLE IF NOT EXISTS active_devices (
      cc_id        TEXT NOT NULL,
      group_id     TEXT NOT NULL,
      device_id    TEXT NOT NULL,
      last_scan_at TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY (cc_id, group_id)
    )
  `);
  // Index to look up all active entries for a group_id (used by admin panel)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS active_devices_group_idx ON active_devices (group_id)
  `);
  console.log("[db] freemium tables ready (incl. device_whitelist + active_devices)");
}

/* ══════════════════════════════════════════════════════════════════════════════
   ACTIVE DEVICE — one active device per (cc_id, group_id)
══════════════════════════════════════════════════════════════════════════════ */

/** Return the currently active device for a (cc_id, group_id) pair, or null if none. */
export async function getActiveDevice(
  ccId: string,
  groupId: string,
): Promise<{ deviceId: string; lastScanAt: string } | null> {
  if (!ccId || !groupId) return null;
  const res = await pool.query<{ device_id: string; last_scan_at: string }>(
    `SELECT device_id, last_scan_at FROM active_devices WHERE cc_id = $1 AND group_id = $2 LIMIT 1`,
    [ccId, groupId],
  );
  if (!res.rows.length) return null;
  return { deviceId: res.rows[0].device_id, lastScanAt: res.rows[0].last_scan_at };
}

/** Upsert the active device for a (cc_id, group_id) pair. Returns old device_id if displaced. */
export async function upsertActiveDevice(
  ccId: string,
  groupId: string,
  deviceId: string,
): Promise<string | null> {
  // Return the old device_id so callers can detect displacement
  const res = await pool.query<{ old_device_id: string | null }>(
    `INSERT INTO active_devices (cc_id, group_id, device_id, last_scan_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (cc_id, group_id)
     DO UPDATE SET device_id = $3, last_scan_at = NOW()
     RETURNING (SELECT device_id FROM active_devices WHERE cc_id = $1 AND group_id = $2) AS old_device_id`,
    [ccId, groupId, deviceId],
  );
  const old = res.rows[0]?.old_device_id ?? null;
  return old === deviceId ? null : old;  // null means no displacement
}

/** Get all active device entries for an admin group view. */
export async function getActiveDevicesByGroup(
  groupId: string,
): Promise<{ ccId: string; deviceId: string; lastScanAt: string }[]> {
  if (!groupId) return [];
  const res = await pool.query<{ cc_id: string; device_id: string; last_scan_at: string }>(
    `SELECT cc_id, device_id, last_scan_at FROM active_devices WHERE group_id = $1 ORDER BY last_scan_at DESC`,
    [groupId],
  );
  return res.rows.map(r => ({ ccId: r.cc_id, deviceId: r.device_id, lastScanAt: r.last_scan_at }));
}

/** Admin: force-set the active device for a (cc_id, group_id) pair. */
export async function adminSetActiveDevice(
  ccId: string,
  groupId: string,
  deviceId: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO active_devices (cc_id, group_id, device_id, last_scan_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (cc_id, group_id) DO UPDATE SET device_id = $3, last_scan_at = NOW()`,
    [ccId, groupId, deviceId],
  );
}

/** Admin: remove the active device entry (unlocks a user from any specific device). */
export async function adminClearActiveDevice(ccId: string, groupId: string): Promise<void> {
  await pool.query(
    `DELETE FROM active_devices WHERE cc_id = $1 AND group_id = $2`,
    [ccId, groupId],
  );
}

/** Check if a specific device_id is in the device whitelist. */
export async function isDeviceWhitelisted(deviceId: string): Promise<boolean> {
  if (!deviceId) return false;
  const res = await pool.query<{ device_id: string }>(
    `SELECT device_id FROM device_whitelist WHERE device_id = $1 LIMIT 1`,
    [deviceId],
  );
  return res.rows.length > 0;
}

/** Add a device to the whitelist (admin action). */
export async function addDeviceWhitelist(deviceId: string, note = ""): Promise<void> {
  await pool.query(
    `INSERT INTO device_whitelist (device_id, note) VALUES ($1, $2)
     ON CONFLICT (device_id) DO UPDATE SET note = $2, added_at = NOW()`,
    [deviceId, note],
  );
}

/** Remove a device from the whitelist (admin action). */
export async function removeDeviceWhitelist(deviceId: string): Promise<void> {
  await pool.query(`DELETE FROM device_whitelist WHERE device_id = $1`, [deviceId]);
}

/** List all whitelisted device IDs. */
export async function getDeviceWhitelist(): Promise<{ deviceId: string; note: string; addedAt: string }[]> {
  const res = await pool.query<{ device_id: string; note: string; added_at: string }>(
    `SELECT device_id, note, added_at FROM device_whitelist ORDER BY added_at DESC`,
  );
  return res.rows.map(r => ({ deviceId: r.device_id, note: r.note, addedAt: r.added_at }));
}

/** Count distinct device IDs for a group (IP) today — used to detect evasion. */
export async function getDistinctDevicesForIP(groupId: string): Promise<number> {
  if (!groupId) return 0;
  const res = await pool.query<{ cnt: string }>(
    `SELECT COUNT(DISTINCT device_id)::int AS cnt
       FROM group_scan_limits
      WHERE group_id = $1 AND scan_date = CURRENT_DATE`,
    [groupId],
  );
  return parseInt(res.rows[0]?.cnt as any, 10) || 0;
}

/** Check if an IP hash is in the admin whitelist. */
export async function isIPWhitelisted(ipHash: string): Promise<boolean> {
  if (!ipHash) return false;
  const res = await pool.query<{ ip_hash: string }>(
    `SELECT ip_hash FROM ip_whitelist WHERE ip_hash = $1 LIMIT 1`,
    [ipHash],
  );
  return res.rows.length > 0;
}

/** Add an IP hash to the whitelist (admin action). */
export async function addIPWhitelist(ipHash: string, note = ""): Promise<void> {
  await pool.query(
    `INSERT INTO ip_whitelist (ip_hash, note) VALUES ($1, $2)
     ON CONFLICT (ip_hash) DO UPDATE SET note = $2, added_at = NOW()`,
    [ipHash, note],
  );
}

/** Remove an IP hash from the whitelist (admin action). */
export async function removeIPWhitelist(ipHash: string): Promise<void> {
  await pool.query(`DELETE FROM ip_whitelist WHERE ip_hash = $1`, [ipHash]);
}

/** List all whitelisted IP hashes. */
export async function getIPWhitelist(): Promise<{ ipHash: string; note: string; addedAt: string }[]> {
  const res = await pool.query<{ ip_hash: string; note: string; added_at: string }>(
    `SELECT ip_hash, note, added_at FROM ip_whitelist ORDER BY added_at DESC`,
  );
  return res.rows.map(r => ({ ipHash: r.ip_hash, note: r.note, addedAt: r.added_at }));
}

/**
 * Returns today's TOTAL scan count for a group (all devices on same IP/network).
 * group_id = SHA256(IP) — computed in the route layer.
 */
export async function getGroupScanCount(groupId: string): Promise<number> {
  if (!groupId) return 0;
  const res = await pool.query<{ total: number }>(
    `SELECT COALESCE(SUM(scan_count), 0)::int AS total
       FROM group_scan_limits
      WHERE group_id = $1 AND scan_date = CURRENT_DATE`,
    [groupId],
  );
  return res.rows[0]?.total ?? 0;
}

/**
 * Records one scan for (groupId, deviceId) today.
 * Upserts the per-device row, then returns the new GROUP total.
 */
export async function incrementGroupScan(groupId: string, deviceId: string): Promise<number> {
  if (!groupId) return 0;
  const safeDevice = deviceId || "unknown";
  await pool.query(
    `INSERT INTO group_scan_limits (group_id, device_id, scan_date, scan_count)
     VALUES ($1, $2, CURRENT_DATE, 1)
     ON CONFLICT (group_id, device_id, scan_date) DO UPDATE
       SET scan_count = group_scan_limits.scan_count + 1`,
    [groupId, safeDevice],
  );
  const res = await pool.query<{ total: number }>(
    `SELECT COALESCE(SUM(scan_count), 0)::int AS total
       FROM group_scan_limits
      WHERE group_id = $1 AND scan_date = CURRENT_DATE`,
    [groupId],
  );
  return res.rows[0]?.total ?? 1;
}

/** Get today's scan count for a device_id (UUID). */
export async function getDeviceScanCount(deviceId: string): Promise<number> {
  if (!deviceId) return 0;
  const res = await pool.query<{ scan_count: number }>(
    `SELECT scan_count FROM device_scan_limits WHERE device_id = $1 AND scan_date = CURRENT_DATE`,
    [deviceId],
  );
  return res.rows[0]?.scan_count ?? 0;
}

/** Increment today's scan count for a device_id. Returns the new total. */
export async function incrementDeviceScanCount(deviceId: string): Promise<number> {
  if (!deviceId) return 0;
  const res = await pool.query<{ scan_count: number }>(
    `INSERT INTO device_scan_limits (device_id, scan_date, scan_count)
     VALUES ($1, CURRENT_DATE, 1)
     ON CONFLICT (device_id, scan_date) DO UPDATE
       SET scan_count = device_scan_limits.scan_count + 1
     RETURNING scan_count`,
    [deviceId],
  );
  return res.rows[0]?.scan_count ?? 1;
}

/** Return today's scan count for a given IP hash. */
export async function getIpScanCount(ipHash: string): Promise<number> {
  const res = await pool.query<{ scan_count: number }>(
    `SELECT scan_count FROM ip_scan_limits WHERE ip_hash = $1 AND scan_date = CURRENT_DATE`,
    [ipHash],
  );
  return res.rows[0]?.scan_count ?? 0;
}

/** Increment and return today's scan count for a given IP hash. */
export async function incrementIpScanCount(ipHash: string): Promise<number> {
  const res = await pool.query<{ scan_count: number }>(
    `INSERT INTO ip_scan_limits (ip_hash, scan_date, scan_count)
     VALUES ($1, CURRENT_DATE, 1)
     ON CONFLICT (ip_hash, scan_date)
     DO UPDATE SET scan_count = ip_scan_limits.scan_count + 1
     RETURNING scan_count`,
    [ipHash],
  );
  return res.rows[0]?.scan_count ?? 1;
}

/**
 * Batch-expire all PRO users whose 30-day window has passed.
 * Returns the number of users downgraded.
 * Called by the background scheduler in app.ts every hour.
 */
export async function expireProUsers(): Promise<number> {
  const res = await pool.query(
    `UPDATE users
        SET plan = 'free', pro_activated_at = NULL
      WHERE plan = 'pro'
        AND pro_activated_at IS NOT NULL
        AND pro_activated_at + INTERVAL '30 days' < NOW()
      RETURNING coincash_id`,
  );
  return res.rowCount ?? 0;
}

/** Ensure a minimal user row exists for a CC-ID (upsert with defaults). */
export async function ensureFreemiumUser(ccId: string): Promise<void> {
  await pool.query(
    `INSERT INTO users (coincash_id, wallet_address, plan, email)
     VALUES ($1, '', 'free', '')
     ON CONFLICT (coincash_id) DO NOTHING`,
    [ccId],
  );
}

export const PRO_DURATION_DAYS = 30;

/** Get the plan for a CC-ID, auto-expiring PRO after 30 days. Falls back to 'free'. */
export async function getUserPlan(ccId: string): Promise<"free" | "basico" | "pro"> {
  const res = await pool.query<{
    plan: string; pro_activated_at: string | null; paid_scans_remaining: number | null;
  }>(
    `SELECT plan, pro_activated_at, paid_scans_remaining FROM users WHERE coincash_id = $1 LIMIT 1`,
    [ccId],
  );
  const row = res.rows[0];
  if (!row || (row.plan !== "pro" && row.plan !== "basico")) return "free";

  // Auto-expire paid plans with empty scan budgets
  if (row.paid_scans_remaining !== null && row.paid_scans_remaining <= 0) {
    await pool.query(
      `UPDATE users SET plan = 'free', pro_activated_at = NULL, paid_scans_remaining = NULL WHERE coincash_id = $1`,
      [ccId],
    );
    return "free";
  }

  // Legacy PRO (no scan budget) — auto-expire after 30 days
  if (row.plan === "pro" && row.paid_scans_remaining === null && row.pro_activated_at) {
    const expiry = new Date(row.pro_activated_at);
    expiry.setDate(expiry.getDate() + PRO_DURATION_DAYS);
    if (new Date() > expiry) {
      await pool.query(
        `UPDATE users SET plan = 'free', pro_activated_at = NULL WHERE coincash_id = $1`,
        [ccId],
      );
      return "free";
    }
  }

  return row.plan as "basico" | "pro";
}

/** Return the number of days remaining in the PRO subscription (null if not PRO). */
export async function getProDaysRemaining(ccId: string): Promise<number | null> {
  const res = await pool.query<{ pro_activated_at: string | null; plan: string }>(
    `SELECT plan, pro_activated_at FROM users WHERE coincash_id = $1 LIMIT 1`,
    [ccId],
  );
  const row = res.rows[0];
  if (!row || row.plan !== "pro" || !row.pro_activated_at) return null;
  const expiry = new Date(row.pro_activated_at);
  expiry.setDate(expiry.getDate() + PRO_DURATION_DAYS);
  const msLeft = expiry.getTime() - Date.now();
  return Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
}

/** How many scans this CC-ID has done today. */
export async function getScanCountToday(ccId: string): Promise<number> {
  const res = await pool.query<{ scan_count: number }>(
    `SELECT scan_count FROM scan_limits WHERE cc_id = $1 AND scan_date = CURRENT_DATE`,
    [ccId],
  );
  return res.rows[0]?.scan_count ?? 0;
}

/** Increment today's scan count for a CC-ID. Returns the new total. */
export async function incrementScanCount(ccId: string): Promise<number> {
  const res = await pool.query<{ scan_count: number }>(
    `INSERT INTO scan_limits (cc_id, scan_date, scan_count)
     VALUES ($1, CURRENT_DATE, 1)
     ON CONFLICT (cc_id, scan_date) DO UPDATE
       SET scan_count = scan_limits.scan_count + 1
     RETURNING scan_count`,
    [ccId],
  );
  return res.rows[0]?.scan_count ?? 1;
}

/** Set user plan (free | pro). Records activation timestamp for PRO; clears it for free. */
export async function setUserPlan(ccId: string, plan: "free" | "pro"): Promise<void> {
  if (plan === "pro") {
    await pool.query(
      `UPDATE users
          SET plan = 'pro', upgrade_requested_at = NULL, pro_activated_at = NOW()
        WHERE coincash_id = $1`,
      [ccId],
    );
  } else {
    await pool.query(
      `UPDATE users
          SET plan = 'free', upgrade_requested_at = NULL, pro_activated_at = NULL,
              paid_scans_remaining = NULL
        WHERE coincash_id = $1`,
      [ccId],
    );
  }
}

/**
 * Activate a paid plan (basico=100 scans | pro=250 scans) from a verified blockchain payment.
 * Sets `paid_scans_remaining`, clears `upgrade_requested_at`, records `pro_activated_at`.
 */
export async function setPaidPlan(
  ccId: string,
  plan: "basico" | "pro",
  scans: number,
): Promise<void> {
  await pool.query(
    `UPDATE users
        SET plan = $2, paid_scans_remaining = $3,
            upgrade_requested_at = NULL, pro_activated_at = NOW()
      WHERE coincash_id = $1`,
    [ccId, plan, scans],
  );
}

/** Returns remaining paid scans (null if not a paid-scan plan). */
export async function getPaidScansRemaining(ccId: string): Promise<number | null> {
  const res = await pool.query<{ paid_scans_remaining: number | null }>(
    `SELECT paid_scans_remaining FROM users WHERE coincash_id = $1 LIMIT 1`,
    [ccId],
  );
  return res.rows[0]?.paid_scans_remaining ?? null;
}

/**
 * Decrement paid scan budget by 1. Returns the new remaining count.
 * Returns null if no budget is tracked (legacy unlimited pro / free).
 */
export async function decrementPaidScans(ccId: string): Promise<number | null> {
  const res = await pool.query<{ paid_scans_remaining: number | null }>(
    `UPDATE users
        SET paid_scans_remaining = GREATEST(0, paid_scans_remaining - 1)
      WHERE coincash_id = $1 AND paid_scans_remaining IS NOT NULL AND paid_scans_remaining > 0
      RETURNING paid_scans_remaining`,
    [ccId],
  );
  return res.rows[0]?.paid_scans_remaining ?? null;
}

/**
 * Clear the upgrade request fields for a user (e.g., after timeout or failed verification).
 * Does NOT change the plan itself.
 */
export async function clearUpgradeRequest(ccId: string): Promise<void> {
  await pool.query(
    `UPDATE users
        SET upgrade_requested_at = NULL,
            upgrade_plan         = NULL,
            upgrade_amount       = NULL,
            upgrade_scans        = NULL
      WHERE coincash_id = $1`,
    [ccId],
  );
}

/** Return true if this blockchain tx_id has already been used for a payment. */
export async function isTxUsed(txId: string): Promise<boolean> {
  const res = await pool.query<{ tx_id: string }>(
    `SELECT tx_id FROM payment_txids WHERE tx_id = $1 LIMIT 1`,
    [txId],
  );
  return res.rows.length > 0;
}

/** Record a verified tx_id so it cannot be reused. */
export async function markTxUsed(
  txId: string,
  ccId: string,
  plan: string,
  amountUsdt: number,
): Promise<void> {
  await pool.query(
    `INSERT INTO payment_txids (tx_id, coincash_id, plan, amount_usdt)
     VALUES ($1, $2, $3, $4) ON CONFLICT (tx_id) DO NOTHING`,
    [txId, ccId, plan, amountUsdt],
  );
}

/**
 * Full system reset: truncates ALL operational tables and re-seeds system accounts.
 * Preserves: nothing — this is a complete wipe.
 * Re-seeds: CC-SUPPORT + CC-801286 admin in chat_users.
 */
export async function fullSystemReset(): Promise<void> {
  // Truncate every operational table in safe dependency order
  await pool.query(`
    TRUNCATE TABLE
      scan_log,
      scan_limits,
      ip_scan_limits,
      device_scan_limits,
      group_scan_limits,
      active_devices,
      ip_whitelist,
      device_whitelist,
      visit_log,
      account_pins,
      push_subscriptions,
      dm_messages,
      dm_contacts,
      chat_messages,
      chat_users,
      device_ids,
      payment_txids,
      users
    RESTART IDENTITY CASCADE
  `);

  // Re-seed system accounts so chat still works immediately
  await pool.query(
    `INSERT INTO chat_users (coincash_id, name, role, linked_to)
     VALUES ('CC-SUPPORT', 'Soporte CoinCash', 'system', NULL)`,
  );
  await pool.query(
    `INSERT INTO chat_users (coincash_id, name, role, linked_to)
     VALUES ('CC-801286', 'Soporte CoinCash', 'admin', 'CC-SUPPORT')`,
  );

  console.log("[db] ⚠️  FULL SYSTEM RESET completed — all tables cleared, system accounts re-seeded");
}

/** Reset today's scan count for a CC-ID. */
export async function resetScanCount(ccId: string): Promise<void> {
  // 1. Collect all device_ids + group_ids linked to this cc_id (from scan_log and active_devices)
  const [logDevices, activeDevices] = await Promise.all([
    pool.query<{ device_id: string; ip_hash: string }>(
      `SELECT DISTINCT device_id, ip_hash
       FROM scan_log
       WHERE cc_id = $1 AND scanned_at >= DATE_TRUNC('day', NOW())
         AND device_id != ''`,
      [ccId],
    ),
    pool.query<{ device_id: string; group_id: string }>(
      `SELECT device_id, group_id FROM active_devices WHERE cc_id = $1`,
      [ccId],
    ),
  ]);

  // Build unique sets
  const deviceIds = new Set<string>();
  const groupDevicePairs: { groupId: string; deviceId: string }[] = [];

  for (const r of logDevices.rows) {
    deviceIds.add(r.device_id);
    if (r.ip_hash) groupDevicePairs.push({ groupId: r.ip_hash, deviceId: r.device_id });
  }
  for (const r of activeDevices.rows) {
    deviceIds.add(r.device_id);
    if (r.group_id) groupDevicePairs.push({ groupId: r.group_id, deviceId: r.device_id });
  }

  const resets: Promise<any>[] = [
    // 2. Reset cc_id counter (scan_limits)
    pool.query(
      `DELETE FROM scan_limits WHERE cc_id = $1 AND scan_date = CURRENT_DATE`,
      [ccId],
    ),
  ];

  // 3. Reset group scan counters for each (group_id, device_id) pair
  for (const { groupId, deviceId } of groupDevicePairs) {
    resets.push(pool.query(
      `DELETE FROM group_scan_limits
       WHERE group_id = $1 AND device_id = $2 AND scan_date = CURRENT_DATE`,
      [groupId, deviceId],
    ));
  }

  // 4. Reset individual device counters
  for (const deviceId of deviceIds) {
    resets.push(pool.query(
      `DELETE FROM device_scan_limits WHERE device_id = $1 AND scan_date = CURRENT_DATE`,
      [deviceId],
    ));
  }

  await Promise.all(resets);
  console.log(`[resetScanCount] Reset scans for ${ccId}: ${deviceIds.size} devices, ${groupDevicePairs.length} group entries`);
}

/** Ensure a user row exists, then record an upgrade request with plan intent. */
export async function requestUpgrade(
  ccId:          string,
  email:         string,
  upgradePlan:   "basico" | "pro",
  upgradeAmount: number,
  upgradeScans:  number,
): Promise<void> {
  await pool.query(
    `INSERT INTO users (coincash_id, wallet_address, plan, email, upgrade_requested_at,
                        upgrade_plan, upgrade_amount, upgrade_scans)
     VALUES ($1, '', 'free', $2, NOW(), $3, $4, $5)
     ON CONFLICT (coincash_id) DO UPDATE
       SET email                = EXCLUDED.email,
           upgrade_requested_at = NOW(),
           upgrade_plan         = EXCLUDED.upgrade_plan,
           upgrade_amount       = EXCLUDED.upgrade_amount,
           upgrade_scans        = EXCLUDED.upgrade_scans`,
    [ccId, email, upgradePlan, upgradeAmount, upgradeScans],
  );
}

/** Return all users + their today's scan count + fraud data. */
export async function getAllUsersWithPlans(): Promise<{
  ccId: string; email: string; plan: string; scansToday: number;
  upgradeRequestedAt: string | null; paidScansRemaining: number | null;
  fraudScore: number; isTrusted: boolean;
}[]> {
  const res = await pool.query<{
    coincash_id: string; email: string; plan: string;
    scans_today: string; upgrade_requested_at: string | null;
    paid_scans_remaining: number | null;
    fraud_score: number | null; is_trusted: boolean | null;
  }>(`
    WITH all_ids AS (
      SELECT coincash_id AS cc_id FROM users WHERE coincash_id != 'CC-SUPPORT'
      UNION
      SELECT cc_id FROM scan_limits  WHERE cc_id IS NOT NULL AND cc_id != '' AND cc_id != 'CC-SUPPORT'
      UNION
      SELECT cc_id FROM scan_log     WHERE cc_id IS NOT NULL AND cc_id != '' AND cc_id != 'CC-SUPPORT'
    )
    SELECT a.cc_id                               AS coincash_id,
           COALESCE(u.email, '')                  AS email,
           COALESCE(u.plan, 'free')               AS plan,
           COALESCE(sl.scan_count, 0)             AS scans_today,
           u.upgrade_requested_at,
           u.paid_scans_remaining,
           COALESCE(u.fraud_score, 0)             AS fraud_score,
           COALESCE(u.is_trusted, false)          AS is_trusted
      FROM all_ids a
      LEFT JOIN users u        ON u.coincash_id = a.cc_id
      LEFT JOIN scan_limits sl ON sl.cc_id = a.cc_id AND sl.scan_date = CURRENT_DATE
     ORDER BY u.upgrade_requested_at DESC NULLS LAST, a.cc_id
  `);
  return res.rows.map((r) => ({
    ccId:               r.coincash_id,
    email:              r.email,
    plan:               r.plan,
    scansToday:         parseInt(r.scans_today as any, 10) || 0,
    upgradeRequestedAt: r.upgrade_requested_at ?? null,
    paidScansRemaining: r.paid_scans_remaining ?? null,
    fraudScore:         r.fraud_score ?? 0,
    isTrusted:          r.is_trusted ?? false,
  }));
}

/** Return users with a pending upgrade request, including plan intent. */
export async function getPendingUpgrades(): Promise<{
  ccId: string; email: string; requestedAt: string;
  upgradePlan: "basico" | "pro" | null;
  upgradeAmount: number | null;
  upgradeScans: number | null;
}[]> {
  const res = await pool.query<{
    coincash_id: string; email: string; upgrade_requested_at: string;
    upgrade_plan: string | null; upgrade_amount: string | null; upgrade_scans: number | null;
  }>(`
    SELECT coincash_id, email, upgrade_requested_at, upgrade_plan, upgrade_amount, upgrade_scans
      FROM users
     WHERE upgrade_requested_at IS NOT NULL AND plan = 'free'
     ORDER BY upgrade_requested_at ASC
  `);
  return res.rows.map((r) => ({
    ccId:          r.coincash_id,
    email:         r.email,
    requestedAt:   r.upgrade_requested_at,
    upgradePlan:   (r.upgrade_plan as "basico" | "pro") ?? null,
    upgradeAmount: r.upgrade_amount !== null ? parseFloat(r.upgrade_amount) : null,
    upgradeScans:  r.upgrade_scans ?? null,
  }));
}

/**
 * Find the best-matching pending user for an incoming payment amount.
 *
 * Real-world flow: user pays → then opens app → clicks "Ya pagué".
 * So upgrade_requested_at is ALWAYS after the tx timestamp. We must NOT
 * filter by timestamp — just find the oldest pending free user whose
 * intended plan matches the amount.
 *
 * Priority:
 *   1. Oldest free user who explicitly selected the matching plan (basico/pro)
 *   2. Oldest free user with any pending request (plan intent unknown)
 *
 * Fraud protection is handled by the payment_txids dedup table, not timestamps.
 */
export async function getPendingUserForAmount(
  amountUsdt:    number,
  _txTimestampMs: number,   // kept for logging, no longer used as a DB filter
): Promise<{
  ccId: string; upgradePlan: "basico" | "pro"; upgradeScans: number;
} | null> {
  const isBasico = amountUsdt >= 9.5  && amountUsdt <= 10.5;
  const isPro    = amountUsdt >= 19.5 && amountUsdt <= 20.5;
  if (!isBasico && !isPro) return null;

  const intendedPlan  = isBasico ? "basico" : "pro";
  const intendedScans = isBasico ? 100 : 250;

  // 1. Prefer user who explicitly selected this plan
  const exact = await pool.query<{
    coincash_id: string; upgrade_plan: string | null; upgrade_scans: number | null;
  }>(
    `SELECT coincash_id, upgrade_plan, upgrade_scans
       FROM users
      WHERE plan = 'free'
        AND upgrade_requested_at IS NOT NULL
        AND upgrade_plan = $1
      ORDER BY upgrade_requested_at ASC
      LIMIT 1`,
    [intendedPlan],
  );
  if (exact.rows.length > 0) {
    const r = exact.rows[0];
    return {
      ccId:         r.coincash_id,
      upgradePlan:  (r.upgrade_plan as "basico" | "pro") ?? intendedPlan,
      upgradeScans: r.upgrade_scans ?? intendedScans,
    };
  }

  // 2. Fallback: oldest pending user regardless of which plan they selected
  const fallback = await pool.query<{ coincash_id: string }>(
    `SELECT coincash_id
       FROM users
      WHERE plan = 'free'
        AND upgrade_requested_at IS NOT NULL
      ORDER BY upgrade_requested_at ASC
      LIMIT 1`,
  );
  if (fallback.rows.length === 0) return null;
  return {
    ccId:         fallback.rows[0].coincash_id,
    upgradePlan:  intendedPlan,
    upgradeScans: intendedScans,
  };
}

/** Return the stored upgrade intent for a user (used by confirm-upgrade). */
export async function getUpgradeIntent(ccId: string): Promise<{
  plan: "basico" | "pro"; amount: number; scans: number;
} | null> {
  const res = await pool.query<{
    upgrade_plan: string | null; upgrade_amount: string | null; upgrade_scans: number | null;
  }>(
    `SELECT upgrade_plan, upgrade_amount, upgrade_scans FROM users WHERE coincash_id = $1 LIMIT 1`,
    [ccId],
  );
  const row = res.rows[0];
  if (!row?.upgrade_plan || !row.upgrade_scans) return null;
  return {
    plan:   row.upgrade_plan as "basico" | "pro",
    amount: row.upgrade_amount !== null ? parseFloat(row.upgrade_amount) : 0,
    scans:  row.upgrade_scans,
  };
}

/** Total users, PRO count, FREE count, scans today across all users. */
export async function getFreemiumStats(): Promise<{
  totalUsers: number; proUsers: number; freeUsers: number; scansToday: number;
}> {
  const [usersRes, scansRes] = await Promise.all([
    pool.query<{ total: string; pro: string; free: string }>(`
      SELECT COUNT(*) FILTER (WHERE coincash_id != 'CC-SUPPORT') AS total,
             COUNT(*) FILTER (WHERE plan IN ('pro','basico') AND coincash_id != 'CC-SUPPORT') AS pro,
             COUNT(*) FILTER (WHERE plan = 'free' AND coincash_id != 'CC-SUPPORT') AS free
        FROM users
    `),
    pool.query<{ total: string }>(`
      SELECT COALESCE(SUM(scan_count), 0) AS total FROM scan_limits WHERE scan_date = CURRENT_DATE
    `),
  ]);
  return {
    totalUsers: parseInt(usersRes.rows[0]?.total ?? "0", 10),
    proUsers:   parseInt(usersRes.rows[0]?.pro   ?? "0", 10),
    freeUsers:  parseInt(usersRes.rows[0]?.free  ?? "0", 10),
    scansToday: parseInt(scansRes.rows[0]?.total  ?? "0", 10),
  };
}

/** Return total visits, today's visits, online count and per-country breakdown. */
export async function getVisitStats(): Promise<{
  total: number;
  today: number;
  online: number;
  countries: { name: string; code: string; count: number }[];
}> {
  const [totalRes, todayRes, onlineRes, countryRes] = await Promise.all([
    pool.query<{ total: string }>(`SELECT COUNT(*) AS total FROM visit_log`),
    pool.query<{ total: string }>(`SELECT COUNT(*) AS total FROM visit_log WHERE visited_at >= DATE_TRUNC('day', NOW())`),
    pool.query<{ total: string }>(`SELECT COUNT(*) AS total FROM visit_log WHERE visited_at >= NOW() - INTERVAL '5 minutes'`),
    pool.query<{ name: string; code: string; count: string }>(`
      SELECT country AS name, country_code AS code, COUNT(*) AS count
        FROM visit_log
       GROUP BY country, country_code
       ORDER BY count DESC
       LIMIT 5
    `),
  ]);

  const total  = parseInt(totalRes.rows[0]?.total  ?? "0", 10);
  const today  = parseInt(todayRes.rows[0]?.total  ?? "0", 10);
  const online = parseInt(onlineRes.rows[0]?.total ?? "0", 10);

  const countries = countryRes.rows.map((r) => ({
    name:  r.name,
    code:  r.code,
    count: parseInt(r.count, 10),
  }));

  return { total, today, online, countries };
}

// ── Fraud Detection System ─────────────────────────────────────────────────────

/** Create fraud detection tables and extend users with fraud columns. Safe to re-run. */
export async function ensureFraudSystem(): Promise<void> {
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS fraud_score INT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_trusted BOOLEAN NOT NULL DEFAULT false`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_devices (
      cc_id       TEXT NOT NULL,
      device_hash TEXT NOT NULL,
      first_seen  TIMESTAMP NOT NULL DEFAULT NOW(),
      last_seen   TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY (cc_id, device_hash)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS user_devices_cc_id_idx ON user_devices (cc_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS user_devices_hash_idx  ON user_devices (device_hash)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS security_log (
      id          SERIAL PRIMARY KEY,
      cc_id       TEXT NOT NULL DEFAULT '',
      ip          TEXT NOT NULL DEFAULT '',
      device_hash TEXT NOT NULL DEFAULT '',
      action      TEXT NOT NULL,
      details     JSONB,
      logged_at   TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS security_log_cc_id_idx     ON security_log (cc_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS security_log_logged_at_idx ON security_log (logged_at)`);

  console.log("[db] fraud system tables ready");
}

/** Register a device hash for a CC-ID (upsert). Fire-and-forget safe. */
export async function linkDeviceHash(ccId: string, deviceHash: string): Promise<void> {
  if (!ccId || !deviceHash) return;
  await pool.query(
    `INSERT INTO user_devices (cc_id, device_hash, first_seen, last_seen)
     VALUES ($1, $2, NOW(), NOW())
     ON CONFLICT (cc_id, device_hash) DO UPDATE SET last_seen = NOW()`,
    [ccId, deviceHash],
  );
}

/** Count distinct device hashes seen for a CC-ID within the last N hours. */
export async function getUserDeviceCount(ccId: string, windowHours = 24): Promise<number> {
  if (!ccId) return 0;
  const res = await pool.query<{ cnt: string }>(
    `SELECT COUNT(DISTINCT device_hash)::int AS cnt
       FROM user_devices
      WHERE cc_id = $1
        AND last_seen >= NOW() - ($2::int || ' hours')::INTERVAL`,
    [ccId, windowHours],
  );
  return parseInt(res.rows[0]?.cnt as any, 10) || 0;
}

/** Count distinct devices registered to a CC-ID within the last N minutes (for spike detection). */
export async function getDevicesInMinutes(ccId: string, windowMinutes = 60): Promise<number> {
  if (!ccId) return 0;
  const res = await pool.query<{ cnt: string }>(
    `SELECT COUNT(DISTINCT device_hash)::int AS cnt
       FROM user_devices
      WHERE cc_id = $1
        AND first_seen >= NOW() - ($2::int || ' minutes')::INTERVAL`,
    [ccId, windowMinutes],
  );
  return parseInt(res.rows[0]?.cnt as any, 10) || 0;
}

/** Update fraud score for a CC-ID (clamped 0–100). Returns new score. */
export async function updateFraudScore(ccId: string, delta: number): Promise<number> {
  if (!ccId) return 0;
  const res = await pool.query<{ fraud_score: number }>(
    `UPDATE users
        SET fraud_score = GREATEST(0, LEAST(100, COALESCE(fraud_score, 0) + $2))
      WHERE coincash_id = $1
      RETURNING fraud_score`,
    [ccId, delta],
  );
  return res.rows[0]?.fraud_score ?? 0;
}

/** Mark user as trusted: is_trusted=true + fraud_score=0. */
export async function markUserTrusted(ccId: string): Promise<void> {
  if (!ccId) return;
  await pool.query(
    `UPDATE users SET is_trusted = true, fraud_score = 0 WHERE coincash_id = $1`,
    [ccId],
  );
}

/** Append an entry to the security audit log. Fire-and-forget safe. */
export async function logSecurityEvent(
  ccId: string,
  ip: string,
  deviceHash: string,
  action: string,
  details?: Record<string, unknown>,
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO security_log (cc_id, ip, device_hash, action, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [ccId, ip, deviceHash, action, details ? JSON.stringify(details) : null],
    );
  } catch { /* non-fatal */ }
}

/**
 * Decay fraud scores every 24h: subtract 20 from users with
 * no suspicious events logged in the last 24h. Returns count decayed.
 */
export async function decayFraudScores(): Promise<number> {
  const res = await pool.query(
    `UPDATE users
        SET fraud_score = GREATEST(0, fraud_score - 20)
      WHERE fraud_score > 0
        AND is_trusted = false
        AND coincash_id NOT IN (
          SELECT DISTINCT cc_id FROM security_log
           WHERE logged_at >= NOW() - INTERVAL '24 hours'
             AND action IN ('devices_spike','scan_spike','fingerprint_rotation','real_fraud')
        )
      RETURNING coincash_id`,
  );
  return res.rowCount ?? 0;
}

/** Count distinct new CC-IDs created in the past N minutes (global fraud farm detection). */
export async function countNewCcIdsInWindow(windowMinutes: number): Promise<number> {
  const res = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*)::int AS cnt FROM users
      WHERE created_at >= NOW() - ($1::int || ' minutes')::INTERVAL
        AND coincash_id != 'CC-SUPPORT'`,
    [windowMinutes],
  );
  return parseInt(res.rows[0]?.cnt as any, 10) || 0;
}

// ── Fingerprint-based daily scan limits ──────────────────────────────────────

/**
 * Create the fp_scan_limits table.
 * Tracks per-fingerprint daily scan counts independently of CC-ID or IP.
 * Safe to re-run.
 */
export async function ensureFpScanLimitsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fp_scan_limits (
      fp_hash    TEXT NOT NULL,
      scan_date  DATE NOT NULL DEFAULT CURRENT_DATE,
      scan_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (fp_hash, scan_date)
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS fp_scan_limits_date_idx ON fp_scan_limits (scan_date)`,
  );
  console.log("[db] fp_scan_limits table ready");
}

/** Return today's scan count for a device fingerprint hash. */
export async function getFpScanCount(fpHash: string): Promise<number> {
  if (!fpHash) return 0;
  try {
    const res = await pool.query<{ scan_count: number }>(
      `SELECT scan_count FROM fp_scan_limits WHERE fp_hash = $1 AND scan_date = CURRENT_DATE`,
      [fpHash],
    );
    return res.rows[0]?.scan_count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Atomically increment the fingerprint scan counter for today.
 * Returns the updated count.
 */
export async function incrementFpScan(fpHash: string): Promise<number> {
  if (!fpHash) return 0;
  try {
    const res = await pool.query<{ scan_count: number }>(
      `INSERT INTO fp_scan_limits (fp_hash, scan_date, scan_count)
       VALUES ($1, CURRENT_DATE, 1)
       ON CONFLICT (fp_hash, scan_date) DO UPDATE
         SET scan_count = fp_scan_limits.scan_count + 1
       RETURNING scan_count`,
      [fpHash],
    );
    return res.rows[0]?.scan_count ?? 1;
  } catch {
    return 0;
  }
}

export async function getSecurityLog(ccId?: string, limit = 50): Promise<{
  id: number; ccId: string; ip: string; deviceHash: string;
  action: string; details: any; loggedAt: string;
}[]> {
  const res = ccId
    ? await pool.query(
        `SELECT id, cc_id, ip, device_hash, action, details, logged_at
           FROM security_log WHERE cc_id = $1 ORDER BY logged_at DESC LIMIT $2`,
        [ccId, limit],
      )
    : await pool.query(
        `SELECT id, cc_id, ip, device_hash, action, details, logged_at
           FROM security_log ORDER BY logged_at DESC LIMIT $1`,
        [limit],
      );
  return res.rows.map((r) => ({
    id: r.id, ccId: r.cc_id, ip: r.ip, deviceHash: r.device_hash,
    action: r.action, details: r.details, loggedAt: r.logged_at,
  }));
}
