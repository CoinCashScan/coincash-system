import { Router } from "express";
import { relayUSDTTransfer, isRelayerConfigured } from "../lib/tronRelayer.js";

const relayRouter = Router();

/**
 * POST /relay/usdt
 * Body: { signedTx: object, userAddress: string }
 *
 * Receives a user-signed TRC20 USDT transaction.
 * Attempts energy delegation (sponsored) and broadcasts the tx.
 * The user's private key is never sent to or stored on this server.
 */
relayRouter.post("/relay/usdt", async (req, res) => {
  const { signedTx, userAddress } = req.body;

  if (!signedTx || typeof signedTx !== "object") {
    res.status(400).json({ error: "signedTx is required and must be an object." });
    return;
  }
  if (!signedTx.txID || !signedTx.raw_data || !Array.isArray(signedTx.signature)) {
    res.status(400).json({ error: "signedTx must include txID, raw_data, and signature." });
    return;
  }
  if (!userAddress || typeof userAddress !== "string") {
    res.status(400).json({ error: "userAddress is required." });
    return;
  }

  try {
    const result = await relayUSDTTransfer(signedTx, userAddress);
    res.json({
      txId:         result.txId,
      sponsored:    result.sponsored,
      feeMode:      result.feeMode,
      relayerActive: isRelayerConfigured(),
    });
  } catch (err: any) {
    console.error("[relay] Error:", err?.message);
    res.status(500).json({ error: err?.message ?? "Error al transmitir la transacción." });
  }
});

/**
 * GET /relay/status
 * Returns whether the relayer is configured and capable of sponsoring transactions.
 */
relayRouter.get("/relay/status", (_req, res) => {
  res.json({
    relayerActive: isRelayerConfigured(),
    sponsoredTransactions: isRelayerConfigured(),
  });
});

export default relayRouter;
