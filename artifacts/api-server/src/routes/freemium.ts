// @ts-nocheck
// Freemium plan routes
// GET  /api/freemium/status?ccId=CC-XXXXXX  — check plan + daily scan count
// POST /api/freemium/record                 — increment scan counter
// POST /api/freemium/upgrade                — Stripe placeholder (future)

import { Router } from "express";
import {
  getUserPlan,
  getScanCountToday,
  incrementScanCount,
  FREE_SCAN_LIMIT,
} from "../lib/db";

const router = Router();

// ── GET /api/freemium/status ──────────────────────────────────────────────────
router.get("/freemium/status", async (req, res) => {
  const ccId = ((req.query.ccId as string) ?? "").trim();
  if (!ccId) return res.status(400).json({ error: "ccId required" });

  try {
    const [plan, scansToday] = await Promise.all([
      getUserPlan(ccId),
      getScanCountToday(ccId),
    ]);

    const isPro      = plan === "pro";
    const canScan    = isPro || scansToday < FREE_SCAN_LIMIT;
    const remaining  = isPro ? null : Math.max(0, FREE_SCAN_LIMIT - scansToday);

    return res.json({ plan, scansToday, limit: FREE_SCAN_LIMIT, canScan, remaining });
  } catch (err: any) {
    console.error("[freemium] status error:", err?.message);
    // On error, allow the scan so we don't block users due to DB issues
    return res.json({ plan: "free", scansToday: 0, limit: FREE_SCAN_LIMIT, canScan: true, remaining: FREE_SCAN_LIMIT });
  }
});

// ── POST /api/freemium/record ─────────────────────────────────────────────────
router.post("/freemium/record", async (req, res) => {
  const ccId = ((req.body?.ccId) ?? "").trim();
  if (!ccId) return res.status(400).json({ error: "ccId required" });

  try {
    const plan = await getUserPlan(ccId);

    if (plan === "pro") {
      return res.json({ ok: true, plan: "pro", scansToday: null, remaining: null });
    }

    const scansToday = await getScanCountToday(ccId);
    if (scansToday >= FREE_SCAN_LIMIT) {
      return res.status(429).json({ error: "limit_reached", limit: FREE_SCAN_LIMIT, scansToday });
    }

    const newCount  = await incrementScanCount(ccId);
    const remaining = Math.max(0, FREE_SCAN_LIMIT - newCount);

    return res.json({ ok: true, plan: "free", scansToday: newCount, remaining });
  } catch (err: any) {
    console.error("[freemium] record error:", err?.message);
    return res.json({ ok: true, plan: "free", scansToday: 0, remaining: FREE_SCAN_LIMIT });
  }
});

// ── POST /api/freemium/upgrade ────────────────────────────────────────────────
// Stripe integration placeholder — ready to wire up in the future.
router.post("/freemium/upgrade", async (req, res) => {
  const ccId = ((req.body?.ccId) ?? "").trim();
  if (!ccId) return res.status(400).json({ error: "ccId required" });

  // TODO: Create Stripe Checkout session here
  // Example (once Stripe key is set):
  //   const session = await stripe.checkout.sessions.create({ ... });
  //   return res.json({ checkoutUrl: session.url });

  return res.json({
    ok:      false,
    pending: true,
    message: "Stripe integration pendiente. Contáctanos en soporte para upgrade.",
  });
});

export default router;
