import { Router } from "express";
import {
  fetchFFRate,
  createSwapQuote,
  executeSwap,
  createExternalSwapOrder,
  isSwapAvailable,
  getRelayerB58,
  COINCASH_FEE_USDT,
  QUOTE_TTL_MS,
  type SwapDirection,
} from "../lib/swapEngine.js";
import { isFFConfigured, ffGetOrder } from "../lib/fixedFloat.js";

const swapRouter = Router();

/**
 * GET /swap/rate
 * Returns current TRX/USDT exchange rate from FixedFloat (falls back to CoinGecko).
 * The relayerAddress is where the user sends their input tokens.
 */
swapRouter.get("/swap/rate", async (_req, res) => {
  try {
    const { trxUsd, trxPerUsdt } = await fetchFFRate();
    res.json({
      trxUsd,
      trxPerUsdt,
      feeRate:        0,              // no CoinCash % swap fee — FF spread built-in
      coinCashFee:    COINCASH_FEE_USDT,
      relayerAddress: getRelayerB58(),
      swapAvailable:  isSwapAvailable(),
      ffConfigured:   isFFConfigured(),
      quoteTTLms:     QUOTE_TTL_MS,
      provider:       "fixedfloat",
    });
  } catch (err: any) {
    res.status(503).json({ error: err?.message ?? "No se pudo obtener el precio." });
  }
});

/**
 * POST /swap/quote
 * Creates a server-side quote using FixedFloat /price (one-time use, 90 s TTL).
 * Body: { direction: "usdt_to_trx" | "trx_to_usdt", inputAmount: number }
 */
swapRouter.post("/swap/quote", async (req, res) => {
  const { direction, inputAmount } = req.body;

  if (!direction || !["usdt_to_trx", "trx_to_usdt"].includes(direction)) {
    res.status(400).json({ error: "direction must be usdt_to_trx or trx_to_usdt." });
    return;
  }
  const amt = parseFloat(String(inputAmount).replace(/,/g, "."));
  if (!amt || amt <= 0) {
    res.status(400).json({ error: "inputAmount must be a positive number." });
    return;
  }

  try {
    const quote = await createSwapQuote(direction as SwapDirection, amt);
    res.json(quote);
  } catch (err: any) {
    res.status(503).json({ error: err?.message ?? "Error al crear cotización." });
  }
});

/**
 * POST /swap/execute
 * Executes a swap:
 *  1. Creates FixedFloat order (gets deposit address + expected output)
 *  2. Broadcasts user's pre-signed input tx (user → relayer)
 *  3. Relayer forwards swapAmount to FF deposit address
 *  4. FF delivers output to user's wallet (async — may take a few minutes)
 *  5. Logs the full order to database
 *
 * Body: { quoteId: string, signedInputTx: object, userAddress: string }
 */
swapRouter.post("/swap/execute", async (req, res) => {
  const { quoteId, signedInputTx, userAddress } = req.body;

  if (!quoteId || typeof quoteId !== "string") {
    res.status(400).json({ error: "quoteId is required." });
    return;
  }
  if (!signedInputTx || typeof signedInputTx !== "object" ||
      !signedInputTx.txID || !signedInputTx.raw_data || !Array.isArray(signedInputTx.signature)) {
    res.status(400).json({ error: "signedInputTx must include txID, raw_data, and signature." });
    return;
  }
  if (!userAddress || typeof userAddress !== "string") {
    res.status(400).json({ error: "userAddress is required." });
    return;
  }

  try {
    const result = await executeSwap(quoteId, signedInputTx, userAddress);
    res.json(result);
  } catch (err: any) {
    console.error("[swap/execute] Error:", err?.message);
    res.status(500).json({ error: err?.message ?? "Error al ejecutar el swap." });
  }
});

/**
 * POST /swap/external-order
 * Creates a swap order without requiring a CoinCash wallet or relayer.
 * The user receives a deposit address to send funds from any external wallet.
 * The swap provider delivers the output token directly to destinationAddress.
 *
 * Body: { direction: "usdt_to_trx" | "trx_to_usdt", inputAmount: number, destinationAddress: string }
 */
swapRouter.post("/swap/external-order", async (req, res) => {
  const { direction, inputAmount, destinationAddress } = req.body;

  if (!direction || !["usdt_to_trx", "trx_to_usdt"].includes(direction)) {
    res.status(400).json({ error: "direction debe ser usdt_to_trx o trx_to_usdt." });
    return;
  }
  const amt = parseFloat(String(inputAmount).replace(/,/g, "."));
  if (!amt || amt <= 0) {
    res.status(400).json({ error: "inputAmount debe ser un número positivo." });
    return;
  }
  if (!destinationAddress || typeof destinationAddress !== "string" || destinationAddress.trim().length < 10) {
    res.status(400).json({ error: "destinationAddress es requerida." });
    return;
  }

  try {
    const order = await createExternalSwapOrder(
      direction as SwapDirection,
      amt,
      destinationAddress.trim(),
    );
    res.json(order);
  } catch (err: any) {
    console.error("[swap/external-order] Error:", err?.message);
    res.status(503).json({ error: err?.message ?? "Error al crear la orden de intercambio." });
  }
});

/**
 * GET /swap/order-status?id=orderId&token=orderToken
 * Polls the swap provider for the current status of an order.
 */
swapRouter.get("/swap/order-status", async (req, res) => {
  const { id, token } = req.query as Record<string, string>;
  if (!id)    { res.status(400).json({ error: "id es requerido." }); return; }
  if (!token) { res.status(400).json({ error: "token es requerido." }); return; }
  try {
    const status = await ffGetOrder(id, token);
    res.json(status);
  } catch (err: any) {
    console.error("[swap/order-status] Error:", err?.message);
    res.status(503).json({ error: err?.message ?? "Error al consultar el estado del pedido." });
  }
});

export default swapRouter;
