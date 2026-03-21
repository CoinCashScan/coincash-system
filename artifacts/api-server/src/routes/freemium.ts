// @ts-nocheck
// Freemium plan routes
// Public:
//   GET  /api/freemium/status?ccId=...       — check plan + daily scan count
//   POST /api/freemium/record                — increment scan counter
//   POST /api/freemium/request-upgrade       — user requests upgrade ("Ya pagué")
// Admin (require key):
//   GET  /api/freemium/users?key=...         — all users list + stats
//   GET  /api/freemium/pending?key=...       — pending upgrade requests
//   POST /api/freemium/set-plan              — set plan for a user
//   POST /api/freemium/reset-scans           — reset today's scans for a user
//   POST /api/freemium/confirm-upgrade       — confirm payment → PRO

import { Router } from "express";
import { createHash } from "crypto";
import {
  ensureFreemiumUser,
  getUserPlan,
  getProDaysRemaining,
  getScanCountToday,
  incrementScanCount,
  getIpScanCount,
  incrementIpScanCount,
  getDeviceScanCount,
  incrementDeviceScanCount,
  getGroupScanCount,
  incrementGroupScan,
  setUserPlan,
  setPaidPlan,
  getPaidScansRemaining,
  decrementPaidScans,
  isTxUsed,
  markTxUsed,
  clearUpgradeRequest,
  resetScanCount,
  requestUpgrade,
  getUpgradeIntent,
  getAllUsersWithPlans,
  getPendingUpgrades,
  getFreemiumStats,
  identifyDevice,
  getSyncCodeForCC,
  getDeviceBySyncCode,
  recordScanFull,
  fullSystemReset,
  pool,
  FREE_SCAN_LIMIT,
  PRO_DURATION_DAYS,
} from "../lib/db";

const router  = Router();
const ADM_KEY = "CoinCashAdmin2026";

/** SHA-256 hash of the client IP — stored instead of raw IP for privacy. */
function getIpHash(req: any): string {
  const raw = (
    (req.headers["x-forwarded-for"] as string) ?? req.socket?.remoteAddress ?? ""
  ).split(",")[0].trim();
  if (!raw) return "";
  return createHash("sha256").update(raw).digest("hex");
}

function adminGuard(req: any, res: any): boolean {
  const key = req.query.key ?? req.body?.key ?? "";
  if (key !== ADM_KEY) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

// ── POST /api/freemium/identify ───────────────────────────────────────────────
// Resolves a persistent CC-ID from browser fingerprint + IP + UA.
// Body: { fp: string, ua: string, hint?: string }
// Returns: { ccId: string }
router.post("/freemium/identify", async (req, res) => {
  try {
    const fp   = ((req.body?.fp)   ?? "").trim().slice(0, 64);
    const ua   = ((req.body?.ua)   ?? "").slice(0, 512);
    const hint = ((req.body?.hint) ?? "").trim();
    const xfwd = (req.headers["x-forwarded-for"] as string) ?? "";
    const ip   = xfwd || req.socket?.remoteAddress || "";
    console.log(`[identify] fp=${fp.slice(0,8)}… ua=${ua.slice(0,40)}… xfwd="${xfwd}" ip="${ip}" hint=${hint}`);
    const ccId = await identifyDevice(fp, ua, ip, hint);
    console.log(`[identify] → ccId=${ccId}`);
    return res.json({ ccId });
  } catch (err: any) {
    console.error("[freemium/identify]", err?.message);
    return res.status(500).json({ error: "identify failed" });
  }
});

// ── GET /api/freemium/synccode ────────────────────────────────────────────────
// Returns (or lazily generates) the 8-char sync code for a given CC-ID.
// Query: ?ccId=CC-XXXXXX
router.get("/freemium/synccode", async (req, res) => {
  const ccId = ((req.query.ccId as string) ?? "").trim();
  if (!ccId) return res.status(400).json({ error: "ccId required" });
  try {
    const syncCode = await getSyncCodeForCC(ccId);
    if (!syncCode) return res.status(404).json({ error: "no device record found for this ccId" });
    return res.json({ syncCode });
  } catch (err: any) {
    console.error("[freemium/synccode]", err?.message);
    return res.status(500).json({ error: "internal error" });
  }
});

// ── POST /api/freemium/sync ───────────────────────────────────────────────────
// Claims an existing CC-ID via sync code. The caller should persist the returned
// ccId in localStorage and reload.
// Body: { code: string }
// Returns: { ccId: string }
router.post("/freemium/sync", async (req, res) => {
  const code = ((req.body?.code) ?? "").trim();
  if (!code) return res.status(400).json({ error: "code required" });
  try {
    const ccId = await getDeviceBySyncCode(code);
    if (!ccId) return res.status(404).json({ error: "invalid code" });
    return res.json({ ccId });
  } catch (err: any) {
    console.error("[freemium/sync]", err?.message);
    return res.status(500).json({ error: "internal error" });
  }
});

// ── GET /api/freemium/status ──────────────────────────────────────────────────
router.get("/freemium/status", async (req, res) => {
  const ccId  = ((req.query.ccId as string) ?? "").trim();
  if (!ccId) return res.status(400).json({ error: "ccId required" });

  // group_id = SHA256(IP) — all devices sharing an IP share this group pool
  // device_id = UUID from localStorage — fallback when IP is unavailable
  const groupId  = getIpHash(req);
  const deviceId = ((req.query.deviceId ?? "") as string).trim();

  try {
    // Register user row on first visit (fire-and-forget, non-blocking)
    ensureFreemiumUser(ccId).catch(() => {});

    const [plan, ccScans, groupScans, deviceScans] = await Promise.all([
      getUserPlan(ccId),
      getScanCountToday(ccId),
      getGroupScanCount(groupId),                     // primary: shared IP pool
      deviceId ? getDeviceScanCount(deviceId) : Promise.resolve(0), // fallback: solo device
    ]);

    const isPaid = plan === "basico" || plan === "pro";

    // If we have a group (IP resolved) → group total is the limit.
    // If no IP → fall back to individual device count.
    // CC-ID count is always checked as the floor.
    const scansToday    = groupId
      ? Math.max(ccScans, groupScans)
      : Math.max(ccScans, deviceScans);

    // Paid plans: canScan depends on remaining scan budget, not daily limit
    let canScan: boolean;
    let remaining: number | null;
    let paidScansRemaining: number | null = null;

    if (isPaid) {
      paidScansRemaining = await getPaidScansRemaining(ccId);
      if (paidScansRemaining === null) {
        // Legacy unlimited pro (admin-granted without scan budget)
        canScan   = true;
        remaining = null;
      } else {
        canScan   = paidScansRemaining > 0;
        remaining = paidScansRemaining;
      }
    } else {
      canScan   = scansToday < FREE_SCAN_LIMIT;
      remaining = Math.max(0, FREE_SCAN_LIMIT - scansToday);
    }

    const daysRemaining = plan === "pro" ? await getProDaysRemaining(ccId) : null;
    const proExpiresAt  = daysRemaining !== null
      ? new Date(Date.now() + daysRemaining * 86_400_000).toISOString()
      : null;

    return res.json({
      plan, scansToday, limit: FREE_SCAN_LIMIT, canScan, remaining,
      paidScansRemaining, daysRemaining, proExpiresAt, proDurationDays: PRO_DURATION_DAYS,
    });
  } catch (err: any) {
    console.error("[freemium] status error:", err?.message);
    return res.json({ plan: "free", scansToday: 0, limit: FREE_SCAN_LIMIT, canScan: true, remaining: FREE_SCAN_LIMIT, daysRemaining: null, proExpiresAt: null, proDurationDays: PRO_DURATION_DAYS });
  }
});

// ── POST /api/freemium/record ─────────────────────────────────────────────────
router.post("/freemium/record", async (req, res) => {
  const ccId     = ((req.body?.ccId)     ?? "").trim();
  const deviceId = ((req.body?.deviceId) ?? "").trim();
  if (!ccId) return res.status(400).json({ error: "ccId required" });

  // group_id = SHA256(IP) — computed in backend, never trusted from client
  const groupId = getIpHash(req);

  try {
    const plan = await getUserPlan(ccId);

    // Paid plans (basico / pro): decrement scan budget instead of daily limit
    if (plan === "basico" || plan === "pro") {
      const newRemaining = await decrementPaidScans(ccId);
      // If newRemaining is null, this is a legacy unlimited-pro (admin-granted) — allow freely
      if (newRemaining !== null && newRemaining < 0) {
        return res.status(429).json({
          error: "limit_reached", message: "Has agotado tus scans del plan.",
          scansToday: 0, limit: 0,
        });
      }
      return res.json({
        ok: true, plan,
        scansToday: null, remaining: newRemaining,
        paidScansRemaining: newRemaining,
      });
    }

    // Read current group total AND CC-ID count in parallel
    const [ccScans, groupScans, deviceScans] = await Promise.all([
      getScanCountToday(ccId),
      getGroupScanCount(groupId),                                      // primary: group (IP-based)
      deviceId ? getDeviceScanCount(deviceId) : Promise.resolve(0),   // fallback: solo device
    ]);

    // Primary check: group total (blocks ALL devices on same network after 5 scans)
    // Fallback when no IP: individual device count
    const effectiveScans = groupId
      ? Math.max(ccScans, groupScans)
      : Math.max(ccScans, deviceScans);

    if (effectiveScans >= FREE_SCAN_LIMIT) {
      return res.status(429).json({
        error:      "limit_reached",
        limit:      FREE_SCAN_LIMIT,
        scansToday: effectiveScans,
        message:    "Límite diario alcanzado",
      });
    }

    // Increment: group counter (primary) + CC-ID (reference) + device fallback
    const increments: Promise<any>[] = [
      incrementScanCount(ccId),
    ];
    if (groupId) {
      increments.push(incrementGroupScan(groupId, deviceId));
    } else if (deviceId) {
      increments.push(incrementDeviceScanCount(deviceId));
    }
    const [newCcCount] = await Promise.all(increments);

    // Also write to scan_log so the admin device panel can see this device.
    // Fire-and-forget — don't block the response on this.
    recordScanFull({
      wallet:      "",
      country:     "Desconocido",
      countryCode: "xx",
      deviceId:    deviceId || "",
      ccId:        ccId,
      ipHash:      groupId,
      planType:    "free",
    }).catch(() => {});

    const remaining = Math.max(0, FREE_SCAN_LIMIT - (newCcCount as number));
    return res.json({ ok: true, plan: "free", scansToday: newCcCount, remaining });
  } catch (err: any) {
    console.error("[freemium] record error:", err?.message);
    return res.json({ ok: true, plan: "free", scansToday: 0, remaining: FREE_SCAN_LIMIT });
  }
});

// ── POST /api/freemium/request-upgrade ───────────────────────────────────────
// User clicked "Ya pagué" — stores a pending upgrade request with plan intent.
// Body: { ccId, email?, plan: "basico"|"pro", amount: number, scans: number }
router.post("/freemium/request-upgrade", async (req, res) => {
  const ccId   = ((req.body?.ccId)   ?? "").trim();
  const email  = ((req.body?.email)  ?? "").trim();
  const plan   = ((req.body?.plan)   ?? "pro").trim() as "basico" | "pro";
  const amount = parseFloat(req.body?.amount ?? (plan === "basico" ? 9.99 : 19.99));
  const scans  = parseInt(req.body?.scans ?? (plan === "basico" ? 100 : 250), 10);

  if (!ccId) return res.status(400).json({ error: "ccId required" });
  if (!["basico", "pro"].includes(plan)) return res.status(400).json({ error: "plan must be basico|pro" });

  try {
    await requestUpgrade(ccId, email, plan, amount, scans);
    return res.json({ ok: true, message: "Solicitud registrada. Verificando pago en blockchain." });
  } catch (err: any) {
    console.error("[freemium] request-upgrade error:", err?.message);
    return res.status(500).json({ error: "Error al registrar solicitud" });
  }
});

// ── GET /api/freemium/users?key=... ──────────────────────────────────────────
router.get("/freemium/users", async (req, res) => {
  if (!adminGuard(req, res)) return;
  try {
    const [users, stats] = await Promise.all([
      getAllUsersWithPlans(),
      getFreemiumStats(),
    ]);
    return res.json({ users, stats });
  } catch (err: any) {
    console.error("[freemium] users error:", err?.message);
    return res.status(500).json({ error: "Error al obtener usuarios" });
  }
});

// ── GET /api/freemium/pending?key=... ────────────────────────────────────────
router.get("/freemium/pending", async (req, res) => {
  if (!adminGuard(req, res)) return;
  try {
    const pending = await getPendingUpgrades();
    return res.json({ pending });
  } catch (err: any) {
    console.error("[freemium] pending error:", err?.message);
    return res.status(500).json({ error: "Error al obtener pendientes" });
  }
});

// ── POST /api/freemium/set-plan ───────────────────────────────────────────────
router.post("/freemium/set-plan", async (req, res) => {
  if (!adminGuard(req, res)) return;
  const ccId = ((req.body?.ccId) ?? "").trim();
  const plan = ((req.body?.plan) ?? "").trim() as "free" | "basico" | "pro";
  if (!ccId || !["free", "basico", "pro"].includes(plan)) {
    return res.status(400).json({ error: "ccId and plan (free|basico|pro) required" });
  }
  try {
    if (plan === "basico") {
      await setPaidPlan(ccId, "basico", 100);
    } else if (plan === "pro") {
      await setPaidPlan(ccId, "pro", 250);
    } else {
      await setUserPlan(ccId, "free");
    }
    // Notify user in real-time (include scan budget so frontend updates immediately)
    const io = req.app.get("io");
    const scansGranted = plan === "basico" ? 100 : plan === "pro" ? 250 : undefined;
    if (io) io.to(ccId).emit("plan-updated", { ccId, plan, paidScansRemaining: scansGranted });
    return res.json({ ok: true, ccId, plan, paidScansRemaining: scansGranted });
  } catch (err: any) {
    console.error("[freemium] set-plan error:", err?.message);
    return res.status(500).json({ error: "Error al cambiar plan" });
  }
});

// ── POST /api/freemium/reset-scans ────────────────────────────────────────────
router.post("/freemium/reset-scans", async (req, res) => {
  if (!adminGuard(req, res)) return;
  const ccId = ((req.body?.ccId) ?? "").trim();
  if (!ccId) return res.status(400).json({ error: "ccId required" });
  try {
    await resetScanCount(ccId);
    return res.json({ ok: true, ccId });
  } catch (err: any) {
    console.error("[freemium] reset-scans error:", err?.message);
    return res.status(500).json({ error: "Error al resetear scans" });
  }
});

// ── POST /api/freemium/confirm-upgrade ────────────────────────────────────────
// Admin-side manual confirmation.
// Uses the plan stored when the user clicked "Ya pagué" (upgrade_plan / upgrade_scans).
// Falls back to "pro"/250 if no intent was recorded (legacy admin grants).
router.post("/freemium/confirm-upgrade", async (req, res) => {
  if (!adminGuard(req, res)) return;
  const ccId = ((req.body?.ccId) ?? "").trim();
  if (!ccId) return res.status(400).json({ error: "ccId required" });
  try {
    // Try to use the user's recorded intent; fall back to override from body, then to "pro"/250
    const intent = await getUpgradeIntent(ccId);
    const plan  = (intent?.plan  ?? req.body?.plan  ?? "pro") as "basico" | "pro";
    const scans = intent?.scans  ?? (plan === "basico" ? 100 : 250);

    await setPaidPlan(ccId, plan, scans);
    const io = req.app.get("io");
    if (io) io.to(ccId).emit("plan-updated", { ccId, plan, paidScansRemaining: scans });
    console.log(`[confirm-upgrade] ✅ ${ccId} → ${plan} (${scans} scans) [intent: ${intent ? "stored" : "fallback"}]`);
    return res.json({ ok: true, ccId, plan, scans });
  } catch (err: any) {
    console.error("[freemium] confirm-upgrade error:", err?.message);
    return res.status(500).json({ error: "Error al confirmar upgrade" });
  }
});

// ── POST /api/freemium/verify-payment ─────────────────────────────────────────
// Automatic blockchain verification via TronGrid.
// Looks for a USDT TRC20 transfer to our wallet after the user's upgrade_requested_at timestamp.
// Accepts ~10 USDT → basico (100 scans) | ~20 USDT → pro (250 scans).
// Body: { ccId: string }
// Returns: { status: "confirmed", plan, paidScansRemaining, txId }
//        | { status: "pending" }
//        | { status: "error", message }
const TRON_WALLET  = "TM2cRRegda1gQAQY9hGbg6DMscN7okNVA1";
const USDT_TRC20   = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"; // mainnet USDT contract

router.post("/freemium/verify-payment", async (req, res) => {
  const ccId = ((req.body?.ccId) ?? "").trim();
  if (!ccId) return res.status(400).json({ error: "ccId required" });

  const VERIFY_TIMEOUT_MS = 12 * 60 * 1_000; // 12 min — slightly beyond the 10-min frontend poll

  try {
    // 1. Get the timestamp when the user clicked "Ya pagué" and their current plan
    const userRow = await pool.query<{ upgrade_requested_at: string | null; plan: string }>(
      `SELECT upgrade_requested_at, plan FROM users WHERE coincash_id = $1 LIMIT 1`,
      [ccId],
    );
    const row = userRow.rows[0];
    if (!row) return res.json({ status: "pending" });

    const isPaid = row.plan === "basico" || row.plan === "pro";
    const hasPendingIntent = !!row.upgrade_requested_at;

    // Already on a paid plan with NO re-purchase intent → just confirmed
    if (isPaid && !hasPendingIntent) {
      const remaining = await getPaidScansRemaining(ccId);
      return res.json({ status: "confirmed", plan: row.plan, paidScansRemaining: remaining });
    }

    // No pending upgrade request
    if (!hasPendingIntent) {
      return res.json({ status: "pending" });
    }

    const requestedAtMs = new Date(row.upgrade_requested_at!).getTime();

    // ── Timeout check ────────────────────────────────────────────────────────
    // If upgrade was requested more than VERIFY_TIMEOUT_MS ago and we're here,
    // no valid transaction was found → clear the request and tell the frontend.
    if (Date.now() - requestedAtMs > VERIFY_TIMEOUT_MS) {
      await clearUpgradeRequest(ccId);
      console.log(`[verify-payment] ⏱ Timeout — clearing upgrade request for ${ccId}`);
      return res.json({ status: "not_found" });
    }

    // 2. Query TronGrid for recent TRC20 transfers to our wallet
    const tronUrl =
      `https://api.trongrid.io/v1/accounts/${TRON_WALLET}/transactions/trc20` +
      `?limit=50&contract_address=${USDT_TRC20}&only_to=true`;

    let tronData: any;
    try {
      const tronRes = await fetch(tronUrl, {
        headers: { "Accept": "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
      tronData = await tronRes.json();
    } catch (fetchErr: any) {
      console.error("[verify-payment] TronGrid fetch failed:", fetchErr?.message);
      return res.json({ status: "pending", detail: "trongrid_unavailable" });
    }

    if (!Array.isArray(tronData?.data)) {
      console.warn("[verify-payment] Unexpected TronGrid response shape:", JSON.stringify(tronData)?.slice(0, 200));
      return res.json({ status: "pending", detail: "trongrid_bad_response" });
    }

    // 3. Find a valid, unused transaction
    const txs: any[] = tronData.data;
    let found: { txId: string; plan: "basico" | "pro"; scans: number; amountUsdt: number } | null = null;

    for (const tx of txs) {
      const symbol    = tx.token_info?.symbol ?? tx.token_info?.name ?? "";
      const toAddress = tx.to ?? "";
      const amountRaw = parseInt(tx.value ?? "0", 10);
      const amount    = amountRaw / 1_000_000;          // USDT has 6 decimals
      const txTime    = tx.block_timestamp ?? 0;        // Unix ms
      const txId      = tx.transaction_id ?? "";

      // Must be USDT, sent TO our wallet, within 48 h before OR after the upgrade request
      // (user typically pays first, THEN clicks "Ya pagué" — so tx can predate the request)
      const windowMs = 48 * 60 * 60 * 1000;
      if (
        symbol    !== "USDT"   ||
        toAddress !== TRON_WALLET ||
        txTime    <  (requestedAtMs - windowMs) ||
        !txId
      ) continue;

      const isBasico = amount >= 9.5  && amount <= 10.5;
      const isPro    = amount >= 19.5 && amount <= 20.5;
      if (!isBasico && !isPro) continue;

      // Check double-spend guard
      const alreadyUsed = await isTxUsed(txId);
      if (alreadyUsed) continue;

      found = {
        txId,
        plan:       isBasico ? "basico" : "pro",
        scans:      isBasico ? 100 : 250,
        amountUsdt: amount,
      };
      break; // Take the first valid tx
    }

    if (!found) {
      console.log(`[verify-payment] No valid tx found for ${ccId} after ${row.upgrade_requested_at}`);
      return res.json({ status: "pending" });
    }

    // 4. Mark tx as used, then upgrade the user atomically
    await markTxUsed(found.txId, ccId, found.plan, found.amountUsdt);
    await setPaidPlan(ccId, found.plan, found.scans);

    console.log(`[verify-payment] ✅ ${ccId} → ${found.plan} (${found.scans} scans) txId=${found.txId} amount=${found.amountUsdt} USDT`);

    // 5. Emit real-time update to the user's socket room
    const io = req.app.get("io");
    if (io) io.to(ccId).emit("plan-updated", {
      ccId, plan: found.plan, paidScansRemaining: found.scans,
    });

    return res.json({
      status:            "confirmed",
      plan:              found.plan,
      paidScansRemaining: found.scans,
      txId:              found.txId,
      amountUsdt:        found.amountUsdt,
    });
  } catch (err: any) {
    console.error("[freemium/verify-payment]", err?.message);
    return res.status(500).json({ status: "error", message: "Error interno al verificar pago" });
  }
});

// ── POST /api/admin/revert-payment ────────────────────────────────────────────
// Reverts a user from PRO to FREE (or clears a pending upgrade request).
router.post("/admin/revert-payment", async (req, res) => {
  if (!adminGuard(req, res)) return;
  const ccId = ((req.body?.ccId) ?? "").trim();
  if (!ccId) return res.status(400).json({ error: "ccId required" });
  try {
    await setUserPlan(ccId, "free");
    console.log(`[admin] revert-payment → ${ccId} set to FREE`);
    // Notify the specific user in real-time via Socket.io
    const io = req.app.get("io");
    if (io) io.to(ccId).emit("plan-updated", { ccId, plan: "free" });
    return res.json({ ok: true, ccId, plan: "free", reverted: true });
  } catch (err: any) {
    console.error("[admin] revert-payment error:", err?.message);
    return res.status(500).json({ error: "Error al revertir pago" });
  }
});

// ── POST /api/admin/full-reset ────────────────────────────────────────────────
// Wipes ALL operational data and re-seeds system accounts.
// Requires admin key + confirmation token "RESET" in body.
router.post("/admin/full-reset", async (req, res) => {
  if (!adminGuard(req, res)) return;
  const confirm = ((req.body?.confirm) ?? "").trim();
  if (confirm !== "RESET") {
    return res.status(400).json({ error: "Se requiere confirm='RESET' en el cuerpo" });
  }
  try {
    console.log("[admin] ⚠️  Full system reset initiated");
    await fullSystemReset();
    return res.json({ ok: true, message: "Sistema reiniciado completamente. Todas las tablas limpiadas." });
  } catch (err: any) {
    console.error("[admin] full-reset error:", err?.message);
    return res.status(500).json({ error: "Error durante el reset: " + err?.message });
  }
});

export default router;
