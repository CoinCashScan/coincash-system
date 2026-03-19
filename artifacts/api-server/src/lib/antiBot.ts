/**
 * antiBot.ts — in-memory anti-bot / rate-limit module.
 *
 * All state lives in Maps — no DB, no external deps.
 * Rules enforced:
 *   1. Block known bot User-Agents (curl, python, scraper, …)
 *   2. IP rate limit: max 10 scan requests per minute
 *   3. Wallet repeat: same wallet max 3 times in 10 s → ignore
 *   4. Min delay between scans: 3 s per user key (ccId or IP)
 *   5. Visit dedup: count at most 1 visit per IP every 30 min
 *   6. Block log: last 500 block events kept in memory
 */

// ── Constants ─────────────────────────────────────────────────────────────────
const BOT_UA = /curl|python-requests|python|bot|spider|scraper|wget|mechanize|phantomjs|headless|go-http|java\/|libwww/i;

const IP_SCAN_LIMIT        = 10;          // max scans per window
const IP_SCAN_WINDOW_MS    = 60_000;      // 1 minute window
const IP_BLOCK_DURATION_MS = 5 * 60_000; // block for 5 min after rate exceeded

const WALLET_REPEAT_LIMIT  = 3;           // max same-wallet scans
const WALLET_WINDOW_MS     = 10_000;      // within 10 seconds

const SCAN_MIN_DELAY_MS    = 3_000;       // 3 s between scans per user key

const VISIT_DEDUP_MS       = 30 * 60_000; // 30 min between visits from same IP

const MAX_BLOCK_LOG        = 500;

// ── In-memory stores ──────────────────────────────────────────────────────────

interface IpWindow {
  count:        number;
  windowStart:  number;
  blockedUntil: number;
}

interface SlideWindow {
  count:       number;
  windowStart: number;
}

export interface BlockEvent {
  ts:      number;
  ip:      string;
  reason:  string;
  detail?: string;
}

const ipScanWindows  = new Map<string, IpWindow>();
const walletWindows  = new Map<string, SlideWindow>();
const lastScanTimes  = new Map<string, number>();
const lastVisitTimes = new Map<string, number>();
const blockLog: BlockEvent[] = [];

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(ip: string, reason: string, detail?: string): void {
  const event: BlockEvent = { ts: Date.now(), ip, reason, detail };
  blockLog.unshift(event);
  if (blockLog.length > MAX_BLOCK_LOG) blockLog.length = MAX_BLOCK_LOG;
  console.warn(`[antiBot] BLOCKED ip=${ip} reason=${reason}${detail ? ` detail=${detail}` : ""}`);
}

// ── Periodic cleanup (every 5 min) to prevent unbounded memory growth ─────────

setInterval(() => {
  const now = Date.now();

  for (const [ip, v] of ipScanWindows) {
    if (now - v.windowStart > IP_SCAN_WINDOW_MS * 2 && v.blockedUntil < now) {
      ipScanWindows.delete(ip);
    }
  }
  for (const [w, v] of walletWindows) {
    if (now - v.windowStart > WALLET_WINDOW_MS * 6) walletWindows.delete(w);
  }
  for (const [k, t] of lastScanTimes) {
    if (now - t > 3_600_000) lastScanTimes.delete(k);
  }
  for (const [k, t] of lastVisitTimes) {
    if (now - t > VISIT_DEDUP_MS + 60_000) lastVisitTimes.delete(k);
  }
}, 5 * 60_000).unref();

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Check a scan request against all anti-bot rules.
 * Returns a string error code if blocked, or null if the request is clean.
 * On null return, internal state is updated (last-scan time, windows, etc.).
 */
export function checkScanRequest(
  ip:        string,
  userAgent: string,
  wallet:    string,
  userId:    string,
): string | null {
  const now = Date.now();

  // 1. User-Agent filter
  if (BOT_UA.test(userAgent)) {
    log(ip, "bad-ua", userAgent.slice(0, 100));
    return "bot_ua";
  }

  // 2. IP rate limit
  const iw: IpWindow = ipScanWindows.get(ip) ?? { count: 0, windowStart: now, blockedUntil: 0 };
  if (iw.blockedUntil > now) {
    log(ip, "ip-rate-blocked");
    return "ip_rate_limited";
  }
  if (now - iw.windowStart > IP_SCAN_WINDOW_MS) {
    iw.count = 0;
    iw.windowStart = now;
  }
  iw.count++;
  ipScanWindows.set(ip, iw);
  if (iw.count > IP_SCAN_LIMIT) {
    iw.blockedUntil = now + IP_BLOCK_DURATION_MS;
    log(ip, "ip-rate-limit", `${iw.count} scans in ${IP_SCAN_WINDOW_MS / 1000}s`);
    return "ip_rate_limited";
  }

  // 3. Min delay between scans (per user key)
  const userKey = userId.trim() || ip;
  const lastScan = lastScanTimes.get(userKey) ?? 0;
  if (now - lastScan < SCAN_MIN_DELAY_MS) {
    log(ip, "scan-too-fast", `${now - lastScan}ms since last scan`);
    return "too_fast";
  }

  // 4. Wallet repeat within window
  const ww: SlideWindow = walletWindows.get(wallet) ?? { count: 0, windowStart: now };
  if (now - ww.windowStart > WALLET_WINDOW_MS) {
    ww.count = 0;
    ww.windowStart = now;
  }
  ww.count++;
  walletWindows.set(wallet, ww);
  if (ww.count > WALLET_REPEAT_LIMIT) {
    log(ip, "wallet-repeat", `wallet=${wallet} x${ww.count} in ${WALLET_WINDOW_MS / 1000}s`);
    return "wallet_repeat";
  }

  // All checks passed — record timestamp
  lastScanTimes.set(userKey, now);
  return null;
}

/**
 * Check if a visit from this IP should be counted.
 * Returns true if it should be recorded, false if it should be ignored.
 */
export function checkVisit(ip: string, userAgent: string): boolean {
  // Skip bot user-agents
  if (BOT_UA.test(userAgent)) return false;

  const now  = Date.now();
  const last = lastVisitTimes.get(ip) ?? 0;
  if (now - last < VISIT_DEDUP_MS) return false;

  lastVisitTimes.set(ip, now);
  return true;
}

/** Return the block log (newest first). For admin use. */
export function getBlockLog(limit = 100): BlockEvent[] {
  return blockLog.slice(0, limit);
}
