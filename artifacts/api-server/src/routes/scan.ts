// @ts-nocheck
// Scan routes — unified validation + analytics
// POST /api/scan            — validate freemium limit + record scan (returns freemium status)
// GET  /api/scan/stats      — return scan statistics (admin protected)
// GET  /api/scan/block-log  — return recent block events (admin protected)
// DELETE /api/scan/reset    — delete all scan records (admin protected)

import { Router }      from "express";
import { createHash }  from "crypto";
import { pool }        from "../lib/db";
import {
  recordScanFull,
  getScanStats,
  getDeviceStats,
  resetScanStats,
  getUserPlan,
  decrementPaidScans,
  getPaidScansRemaining,
  getScanCountToday,
  getGroupScanCount,
  getDeviceScanCount,
  incrementScanCount,
  incrementGroupScan,
  incrementDeviceScanCount,
  getProDaysRemaining,
  ensureFreemiumUser,
  getDistinctDevicesForIP,
  isIPWhitelisted,
  addIPWhitelist,
  removeIPWhitelist,
  getIPWhitelist,
  isDeviceWhitelisted,
  addDeviceWhitelist,
  removeDeviceWhitelist,
  getDeviceWhitelist,
  getActiveDevice,
  upsertActiveDevice,
  adminSetActiveDevice,
  adminClearActiveDevice,
  linkDeviceHash,
  getUserDeviceCount,
  getDevicesInMinutes,
  updateFraudScore,
  logSecurityEvent,
  countNewCcIdsInWindow,
  FREE_SCAN_LIMIT,
  PRO_DURATION_DAYS,
} from "../lib/db";
import { checkScanRequest, getBlockLog } from "../lib/antiBot";

const router    = Router();
const ADMIN_KEY = "CoinCashAdmin2026";

// ── Helpers ─────────────────────────────────────────────────────────────────────

function getClientIP(req: any): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    return (typeof forwarded === "string" ? forwarded : forwarded[0]).split(",")[0].trim();
  }
  return req.socket?.remoteAddress ?? req.ip ?? "";
}

function getUserAgent(req: any): string {
  return (req.headers["user-agent"] ?? "").toString();
}

function ipHash(ip: string): string {
  if (!ip) return "";
  return createHash("sha256").update(ip).digest("hex");
}

async function geolocate(ip: string): Promise<{ country: string; countryCode: string }> {
  if (!ip || ip === "::1" || ip.startsWith("127.") || ip.startsWith("10.") ||
      ip.startsWith("192.168.") || ip.startsWith("172.")) {
    return { country: "Local", countryCode: "xx" };
  }
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { country: "Desconocido", countryCode: "xx" };
    const data = await res.json();
    if (data.status !== "success") return { country: "Desconocido", countryCode: "xx" };
    return { country: data.country, countryCode: (data.countryCode as string).toLowerCase() };
  } catch {
    return { country: "Desconocido", countryCode: "xx" };
  }
}

// ── POST /api/scan ─────────────────────────────────────────────────────────────
// Unified endpoint: validates limit + records scan + returns freemium status.
// Body: { wallet, ccId, deviceId }
// Returns: { ok, plan, scansToday, remaining, canScan } or error
// ── Fraud computation (observation mode — fire-and-forget, never blocks) ────────
async function computeFraudEvents(
  ccId: string, deviceHash: string, ip: string,
  distinctDevicesForIP: number, scansToday: number,
): Promise<void> {
  if (!ccId) return;
  try {
    const [devCount24h, devCount60m] = await Promise.all([
      getUserDeviceCount(ccId, 24),
      getDevicesInMinutes(ccId, 60),
    ]);

    // +20: >3 unique devices in the last 24h
    if (devCount24h > 3) {
      await updateFraudScore(ccId, 20);
      await logSecurityEvent(ccId, ip, deviceHash, "devices_spike", { devCount24h });
    }

    // +30: excessive scans (> limit * 2) in the current session
    if (scansToday > FREE_SCAN_LIMIT * 2) {
      await updateFraudScore(ccId, 30);
      await logSecurityEvent(ccId, ip, deviceHash, "scan_spike", { scansToday });
    }

    // +40: rapid fingerprint rotation (>5 distinct devices in 60 minutes)
    if (devCount60m > 5) {
      await updateFraudScore(ccId, 40);
      await logSecurityEvent(ccId, ip, deviceHash, "fingerprint_rotation", { devCount60m });
    }

    // -20: normal use (1 device, moderate scans)
    if (devCount24h <= 1 && scansToday <= FREE_SCAN_LIMIT) {
      await updateFraudScore(ccId, -20);
    }
  } catch { /* non-fatal */ }
}

router.post("/scan", async (req, res) => {
  const wallet     = (req.body?.wallet     ?? "").trim();
  const ccId       = (req.body?.ccId       ?? "").trim();
  const deviceId   = (req.body?.deviceId   ?? "").trim();
  const deviceHash = (req.body?.deviceHash ?? "").trim();

  if (!wallet) return res.status(400).json({ error: "wallet required" });

  // Register the user in the users table so they appear in admin (fire-and-forget)
  if (ccId) ensureFreemiumUser(ccId).catch(() => {});

  const ip        = getClientIP(req);

  // Link device fingerprint to this CC-ID for fraud tracking (fire-and-forget)
  if (ccId && deviceHash) linkDeviceHash(ccId, deviceHash).catch(() => {});
  const userAgent = getUserAgent(req);
  const groupId   = ipHash(ip);

  // ── Anti-bot check ─────────────────────────────────────────────────────────
  const blocked = checkScanRequest(ip, userAgent, wallet, ccId || deviceId);
  if (blocked) {
    const BLOCK_MSG: Record<string, string> = {
      bot_ua:          "Solicitud bloqueada: cliente no permitido.",
      ip_rate_limited: "Demasiadas solicitudes desde tu IP. Espera unos minutos.",
      too_fast:        "Espera al menos 3 segundos entre escaneos.",
      wallet_repeat:   "Esa wallet fue analizada recientemente. Intenta más tarde.",
    };
    const msg    = BLOCK_MSG[blocked] ?? "Solicitud bloqueada.";
    const status = blocked === "ip_rate_limited" || blocked === "bot_ua" ? 429 : 200;
    return res.status(status).json({ ok: false, blocked, message: msg });
  }

  // ── Freemium limit validation (backend-enforced) ───────────────────────────
  try {
    let plan: string = "free";
    if (ccId) {
      plan = await getUserPlan(ccId);
    }

    if (plan === "basico") {
      // ── BÁSICO plan: decrement scan budget, record, return ─────────────────
      const newRemaining = await decrementPaidScans(ccId);
      // newRemaining === null means no budget row (should not happen, but treat as depleted)
      if (newRemaining !== null && newRemaining < 0) {
        return res.status(429).json({
          ok: false, error: "limit_reached", plan: "basico",
          canScan: false, remaining: 0, paidScansRemaining: 0,
          message: "Has agotado tus scans del plan Básico.",
        });
      }
      const geo = await geolocate(ip);
      recordScanFull({
        wallet, country: geo.country, countryCode: geo.countryCode,
        deviceId: deviceId || "", ccId: ccId || "",
        ipHash: groupId, planType: "basico",
      }).catch(() => {});
      const remaining = newRemaining ?? (await getPaidScansRemaining(ccId)) ?? 0;
      return res.json({
        ok: true, plan: "basico", scansToday: null,
        remaining, canScan: remaining > 0,
        paidScansRemaining: remaining,
      });

    } else if (plan !== "pro") {
      // ── FREE plan: normal daily limit check ────────────────────────────────
      // Read all counters + evasion signals in parallel
      const [ccScans, groupScans, deviceScans, distinctDevices, devWhitelisted, ipWhitelisted] = await Promise.all([
        ccId     ? getScanCountToday(ccId)          : Promise.resolve(0),
        groupId  ? getGroupScanCount(groupId)        : Promise.resolve(0),
        deviceId ? getDeviceScanCount(deviceId)      : Promise.resolve(0),
        groupId  ? getDistinctDevicesForIP(groupId)  : Promise.resolve(0),
        deviceId ? isDeviceWhitelisted(deviceId)     : Promise.resolve(false),
        groupId  ? isIPWhitelisted(groupId)          : Promise.resolve(false),
      ]);

      // Evasion check: more than 2 distinct devices on same IP today.
      // Bypass if THIS device is individually whitelisted OR the whole IP is whitelisted.
      if (distinctDevices > 2 && !devWhitelisted && !ipWhitelisted) {
        // Fraud score event (observation, non-blocking)
        if (ccId) {
          updateFraudScore(ccId, 20).catch(() => {});
          logSecurityEvent(ccId, ip, deviceHash, "devices_spike", { distinctDevices, groupId }).catch(() => {});
        }
        return res.status(429).json({
          ok:         false,
          blocked:    "evasion",
          plan:       "free",
          canScan:    false,
          remaining:  0,
          scansToday: groupScans,
          limit:      FREE_SCAN_LIMIT,
          message:    "🟡 Actividad inusual detectada (puede ser red compartida). Actualiza a PRO para continuar.",
          ipHash:     groupId,
          deviceId:   deviceId,
        });
      }

      // ── Device conflict check (1 active device per cc_id+IP) ────────────────
      // Only applies when we have both cc_id and groupId (authenticated + IP known)
      if (ccId && groupId && deviceId) {
        const activeDevice = await getActiveDevice(ccId, groupId);
        if (activeDevice && activeDevice.deviceId !== deviceId) {
          // A different device is currently active for this user+IP combination.
          // Auto-displace: make the current device active going forward.
          await upsertActiveDevice(ccId, groupId, deviceId);
          return res.status(429).json({
            ok:        false,
            blocked:   "device_conflict",
            plan:      "free",
            canScan:   false,
            remaining: 0,
            message:   "Otro dispositivo está activo en esta red. Reintenta en unos segundos.",
            deviceId:  deviceId,
          });
        }
        // No conflict: upsert to refresh timestamp and mark this device as active
        if (!activeDevice) {
          await upsertActiveDevice(ccId, groupId, deviceId);
        }
      }

      // Effective count: group pool (IP-based) takes priority when available
      const effectiveScans = groupId
        ? Math.max(ccScans, groupScans)
        : Math.max(ccScans, deviceScans);

      if (effectiveScans >= FREE_SCAN_LIMIT) {
        return res.status(429).json({
          ok:         false,
          error:      "limit_reached",
          plan:       "free",
          scansToday: effectiveScans,
          limit:      FREE_SCAN_LIMIT,
          canScan:    false,
          remaining:  0,
          message:    "Límite diario de scans gratuitos alcanzado.",
        });
      }

      // ── Increment counters ─────────────────────────────────────────────────
      const increments: Promise<any>[] = [];
      if (ccId)     increments.push(incrementScanCount(ccId));
      if (groupId)  increments.push(incrementGroupScan(groupId, deviceId));
      else if (deviceId) increments.push(incrementDeviceScanCount(deviceId));
      const [newCcCount] = await Promise.all(increments);

      const scansToday = (typeof newCcCount === "number") ? newCcCount : (effectiveScans + 1);
      const remaining  = Math.max(0, FREE_SCAN_LIMIT - scansToday);

      // Record scan to DB (fire-and-forget — don't block the response)
      const geo = await geolocate(ip);
      recordScanFull({
        wallet, country: geo.country, countryCode: geo.countryCode,
        deviceId: deviceId || "", ccId: ccId || "",
        ipHash: groupId, planType: "free",
      }).catch(() => {});

      // Refresh active_device timestamp after successful scan (fire-and-forget)
      if (ccId && groupId && deviceId) {
        upsertActiveDevice(ccId, groupId, deviceId).catch(() => {});
      }

      // Fraud score computation — observation mode, never blocks (fire-and-forget)
      if (ccId) {
        computeFraudEvents(ccId, deviceHash, ip, distinctDevices, scansToday).catch(() => {});
      }

      return res.json({ ok: true, plan: "free", scansToday, remaining, canScan: remaining > 0 });

    } else {
      // PRO user — record but don't increment or block
      const geo = await geolocate(ip);
      recordScanFull({
        wallet, country: geo.country, countryCode: geo.countryCode,
        deviceId: deviceId || "", ccId: ccId || "",
        ipHash: groupId, planType: "pro",
      }).catch(() => {});

      const daysRemaining = ccId ? await getProDaysRemaining(ccId) : null;
      return res.json({ ok: true, plan: "pro", scansToday: null, remaining: null, canScan: true, daysRemaining });
    }
  } catch (err: any) {
    console.error("[scan] error:", err?.message);
    // Fail open — don't block user on backend error
    return res.json({ ok: true, plan: "free", scansToday: 0, remaining: FREE_SCAN_LIMIT, canScan: true });
  }
});

// ── GET /api/scan/stats ────────────────────────────────────────────────────────
router.get("/scan/stats", async (req, res) => {
  const key = req.query.key as string | undefined;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: "Unauthorized" });
  const stats = await getScanStats();
  res.json(stats);
});

// ── GET /api/scan/devices ─────────────────────────────────────────────────────
// Returns per-device scan statistics grouped by deviceId.
// Includes IP-sharing abuse detection: devices sharing the same IP hash today
// are flagged as possible_evasion = true.
router.get("/scan/devices", async (req, res) => {
  const key = req.query.key as string | undefined;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: "Unauthorized" });
  try {
    const data = await getDeviceStats();
    res.json(data);
  } catch (err: any) {
    console.error("[scan/devices]", err?.message);
    res.status(500).json({ error: "Error fetching device stats" });
  }
});

// ── GET /api/scan/block-log ────────────────────────────────────────────────────
router.get("/scan/block-log", (req, res) => {
  const key = req.query.key as string | undefined;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: "Unauthorized" });
  res.json({ events: getBlockLog(100) });
});

// ── DELETE /api/scan/reset ─────────────────────────────────────────────────────
router.delete("/scan/reset", async (req, res) => {
  const key = (req.headers["x-admin-key"] ?? req.query.key) as string | undefined;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: "Unauthorized" });
  try {
    const deleted = await resetScanStats();
    console.log(`[scan] Reset: deleted ${deleted} scan records`);
    return res.json({ ok: true, deleted });
  } catch (err: any) {
    console.error("[scan] reset error:", err?.message);
    return res.status(500).json({ error: "Reset failed" });
  }
});

// ── GET /api/scan/whitelist ────────────────────────────────────────────────────
// Returns all whitelisted IP hashes (admin only).
router.get("/scan/whitelist", async (req, res) => {
  const key = req.query.key as string | undefined;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: "Unauthorized" });
  try {
    const list = await getIPWhitelist();
    res.json({ whitelist: list });
  } catch (err: any) {
    console.error("[scan/whitelist] GET error:", err?.message);
    res.status(500).json({ error: "Error fetching whitelist" });
  }
});

// ── POST /api/scan/whitelist ──────────────────────────────────────────────────
// Add an IP hash to the whitelist (marks as legitimate).
// Body: { ipHash, note? }
router.post("/scan/whitelist", async (req, res) => {
  const key = req.headers["x-admin-key"] as string | undefined ?? req.body?.key;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: "Unauthorized" });
  const { ipHash, note = "" } = req.body ?? {};
  if (!ipHash) return res.status(400).json({ error: "ipHash required" });
  try {
    await addIPWhitelist(ipHash, note);
    console.log(`[scan/whitelist] Added: ${ipHash.slice(0, 12)}…`);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[scan/whitelist] POST error:", err?.message);
    res.status(500).json({ error: "Error adding to whitelist" });
  }
});

// ── DELETE /api/scan/whitelist/:ipHash ───────────────────────────────────────
// Remove an IP hash from the whitelist.
router.delete("/scan/whitelist/:ipHash", async (req, res) => {
  const key = (req.headers["x-admin-key"] ?? req.query.key) as string | undefined;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: "Unauthorized" });
  const { ipHash } = req.params;
  try {
    await removeIPWhitelist(ipHash);
    console.log(`[scan/whitelist] Removed: ${ipHash.slice(0, 12)}…`);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[scan/whitelist] DELETE error:", err?.message);
    res.status(500).json({ error: "Error removing from whitelist" });
  }
});

// ── GET /api/scan/active-devices ─────────────────────────────────────────────
// Returns all active_devices rows (admin only).
router.get("/scan/active-devices", async (req, res) => {
  const key = req.query.key as string | undefined;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: "Unauthorized" });
  try {
    const rows = await pool.query<{
      cc_id: string; group_id: string; device_id: string; last_scan_at: string;
    }>(`SELECT cc_id, group_id, device_id, last_scan_at FROM active_devices ORDER BY last_scan_at DESC`);
    res.json({
      activeDevices: rows.rows.map(r => ({
        ccId: r.cc_id, groupId: r.group_id, deviceId: r.device_id, lastScanAt: r.last_scan_at,
      })),
    });
  } catch (err: any) {
    console.error("[scan/active-devices] GET error:", err?.message);
    res.status(500).json({ error: "Error fetching active devices" });
  }
});

// ── POST /api/scan/active-device/clear ──────────────────────────────────────
// Admin: clear/reset the active device lock for a (ccId, groupId) pair.
// Body: { ccId, groupId }
router.post("/scan/active-device/clear", async (req, res) => {
  const key = req.headers["x-admin-key"] as string | undefined ?? req.body?.key;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: "Unauthorized" });
  const { ccId, groupId } = req.body ?? {};
  if (!ccId || !groupId) return res.status(400).json({ error: "ccId and groupId required" });
  try {
    await adminClearActiveDevice(ccId, groupId);
    console.log(`[scan/active-device] Cleared lock for cc:${ccId} grp:${groupId?.slice(0, 8)}…`);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[scan/active-device/clear] error:", err?.message);
    res.status(500).json({ error: "Error clearing active device" });
  }
});

// ── POST /api/scan/active-device/set ─────────────────────────────────────────
// Admin: force-set a specific device as active for a (ccId, groupId) pair.
// Body: { ccId, groupId, deviceId }
router.post("/scan/active-device/set", async (req, res) => {
  const key = req.headers["x-admin-key"] as string | undefined ?? req.body?.key;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: "Unauthorized" });
  const { ccId, groupId, deviceId } = req.body ?? {};
  if (!ccId || !groupId || !deviceId) return res.status(400).json({ error: "ccId, groupId and deviceId required" });
  try {
    await adminSetActiveDevice(ccId, groupId, deviceId);
    console.log(`[scan/active-device] Force-set dev:${deviceId?.slice(0, 8)}… for cc:${ccId}`);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[scan/active-device/set] error:", err?.message);
    res.status(500).json({ error: "Error setting active device" });
  }
});

// ── GET /api/scan/whitelist-device ────────────────────────────────────────────
// Returns all whitelisted device IDs (admin only).
router.get("/scan/whitelist-device", async (req, res) => {
  const key = req.query.key as string | undefined;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: "Unauthorized" });
  try {
    const list = await getDeviceWhitelist();
    res.json({ whitelist: list });
  } catch (err: any) {
    console.error("[scan/whitelist-device] GET error:", err?.message);
    res.status(500).json({ error: "Error fetching device whitelist" });
  }
});

// ── POST /api/scan/whitelist-device ──────────────────────────────────────────
// Add a device_id to the whitelist (marks as legitimate).
// Body: { deviceId, note? }
router.post("/scan/whitelist-device", async (req, res) => {
  const key = req.headers["x-admin-key"] as string | undefined ?? req.body?.key;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: "Unauthorized" });
  const { deviceId, note = "" } = req.body ?? {};
  if (!deviceId) return res.status(400).json({ error: "deviceId required" });
  try {
    await addDeviceWhitelist(deviceId, note);
    console.log(`[scan/whitelist-device] Added: ${deviceId.slice(0, 12)}…`);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[scan/whitelist-device] POST error:", err?.message);
    res.status(500).json({ error: "Error adding device to whitelist" });
  }
});

// ── DELETE /api/scan/whitelist-device/:deviceId ───────────────────────────────
// Remove a device_id from the whitelist.
router.delete("/scan/whitelist-device/:deviceId", async (req, res) => {
  const key = (req.headers["x-admin-key"] ?? req.query.key) as string | undefined;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: "Unauthorized" });
  const { deviceId } = req.params;
  try {
    await removeDeviceWhitelist(deviceId);
    console.log(`[scan/whitelist-device] Removed: ${deviceId.slice(0, 12)}…`);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[scan/whitelist-device] DELETE error:", err?.message);
    res.status(500).json({ error: "Error removing device from whitelist" });
  }
});

export default router;
