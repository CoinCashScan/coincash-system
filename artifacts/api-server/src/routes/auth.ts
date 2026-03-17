// @ts-nocheck
// Account PIN routes — protect account recovery
// POST /api/auth/pin/set     { ccId, pinHash }    — create or update PIN
// POST /api/auth/pin/verify  { ccId, pinHash }    — returns { valid: boolean }
// GET  /api/auth/pin/exists/:ccId                 — returns { exists: boolean }

import { Router } from "express";
import { setAccountPin, getAccountPinHash, hasPinSet } from "../lib/db";

const router = Router();
const CC_RE  = /^CC-\d{6}$/;

// GET /api/auth/pin/exists/:ccId
router.get("/auth/pin/exists/:ccId", async (req, res) => {
  const { ccId } = req.params;
  if (!CC_RE.test(ccId)) return res.status(400).json({ error: "Invalid CC-ID" });
  const exists = await hasPinSet(ccId);
  res.json({ exists });
});

// POST /api/auth/pin/set  — store or update the hashed PIN for a CC-ID
router.post("/auth/pin/set", async (req, res) => {
  const { ccId, pinHash } = req.body ?? {};
  if (!CC_RE.test(ccId))         return res.status(400).json({ error: "Invalid CC-ID" });
  if (typeof pinHash !== "string" || pinHash.length < 8)
    return res.status(400).json({ error: "Invalid pinHash" });

  await setAccountPin(ccId, pinHash);
  res.json({ ok: true });
});

// POST /api/auth/pin/verify  — check whether the supplied hash matches the stored one
router.post("/auth/pin/verify", async (req, res) => {
  const { ccId, pinHash } = req.body ?? {};
  if (!CC_RE.test(ccId)) return res.status(400).json({ error: "Invalid CC-ID" });

  const stored = await getAccountPinHash(ccId);
  if (!stored) return res.json({ valid: false, reason: "no_pin" });

  const valid = stored === pinHash;
  res.json({ valid });
});

export default router;
