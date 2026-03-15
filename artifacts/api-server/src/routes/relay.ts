import { Router } from "express";
import {
  relayUSDTTransfer,
  isRelayerConfigured,
  getTreasuryAddress,
  getServiceFeeUSDT,
} from "../lib/tronRelayer.js";

const relayRouter = Router();

/**
 * POST /relay/usdt
 * Body: { signedTx: object, feeTx?: object, userAddress: string }
 *
 * Receives user-signed USDT transaction(s).
 * - feeTx (optional): pre-signed 1 USDT service fee transfer to CoinCash treasury
 * - signedTx: the main USDT transfer to the recipient
 *
 * Flow:
 *   1. Broadcast feeTx (service fee → treasury) if present
 *   2. Attempt energy delegation / rental for the user
 *   3. Broadcast signedTx (main transfer)
 *
 * The user's private key is never sent to or stored on this server.
 */
relayRouter.post("/relay/usdt", async (req, res) => {
  const { signedTx, feeTx, userAddress } = req.body;

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

  // feeTx validation — optional but must be well-formed if provided
  const validFeeTx =
    feeTx &&
    typeof feeTx === "object" &&
    feeTx.txID &&
    feeTx.raw_data &&
    Array.isArray(feeTx.signature)
      ? feeTx
      : null;

  try {
    const result = await relayUSDTTransfer(signedTx, userAddress, validFeeTx);
    res.json({
      txId:          result.txId,
      feeTxId:       result.feeTxId,
      sponsored:     result.sponsored,
      feeMode:       result.feeMode,
      relayerActive: isRelayerConfigured(),
    });
  } catch (err: any) {
    console.error("[relay] Error:", err?.message);
    res.status(500).json({ error: err?.message ?? "Error al transmitir la transacción." });
  }
});

/**
 * GET /relay/status
 * Returns relayer configuration, treasury address, and service fee amount.
 */
relayRouter.get("/relay/status", (_req, res) => {
  res.json({
    relayerActive:         isRelayerConfigured(),
    sponsoredTransactions: isRelayerConfigured(),
    treasuryAddress:       getTreasuryAddress(),
    serviceFeeUSDT:        getServiceFeeUSDT(),
  });
});

export default relayRouter;
