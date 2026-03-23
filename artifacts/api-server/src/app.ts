import express, { type Express } from "express";
import cors from "cors";
import path from "path";
import { existsSync } from "fs";
import router from "./routes";
import {
  ensureUsersTable, ensureMessagesTable,
  ensureChatUsersTable, ensureChatContactsTable,
  ensureDmTables, ensureVisitsTable, ensureAccountPinsTable,
  ensureScanTable, ensureFreemiumTable, ensureDeviceTable,
  ensureFraudSystem, ensureFpScanLimitsTable, decayFraudScores,
  deleteOldChatMessages, expireProUsers,
} from "./lib/db";

const app: Express = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Serve wallet-guard static files in production ────────────────────────────
// process.cwd() is the monorepo root in both dev (tsx) and production (node).
// import.meta.url is NOT used here because the CJS build sets it to undefined.
const walletGuardDist = path.join(
  process.cwd(),
  "artifacts", "wallet-guard", "dist", "public",
);

if (existsSync(walletGuardDist)) {
  app.use(express.static(walletGuardDist));
  console.log("[app] Serving wallet-guard static files from", walletGuardDist);
}

// ── API routes ───────────────────────────────────────────────────────────────
app.use("/api", router);

// ── SPA fallback — return index.html for all non-API routes ─────────────────
const indexHtml = path.join(walletGuardDist, "index.html");
if (existsSync(walletGuardDist)) {
  app.use((_req, res) => {
    res.sendFile(indexHtml);
  });
}

// Bootstrap DB tables (sequential so foreign-key-like order is respected)
(async () => {
  try {
    await ensureUsersTable();
    await ensureMessagesTable();
    await ensureChatUsersTable();
    await ensureChatContactsTable();
    await ensureDmTables();
    await ensureVisitsTable();
    await ensureAccountPinsTable();
    await ensureScanTable();
    await ensureFreemiumTable();
    await ensureDeviceTable();
    await ensureFraudSystem();
    await ensureFpScanLimitsTable();

    // ── Chat message cleanup (every hour) ────────────────────────────────────
    const runCleanup = async () => {
      try {
        const deleted = await deleteOldChatMessages();
        if (deleted > 0) console.log(`[cleanup] Deleted ${deleted} support messages older than 24h`);
      } catch (err: any) {
        console.error("[cleanup] Failed:", err?.message);
      }
    };
    await runCleanup();
    setInterval(runCleanup, 60 * 60 * 1000);

    // ── PRO expiry job (every hour) ───────────────────────────────────────────
    // Proactively downgrades any PRO user whose 30-day window has passed,
    // even if they haven't visited the app recently.
    const runProExpiry = async () => {
      try {
        const expired = await expireProUsers();
        if (expired > 0) console.log(`[pro-expiry] Downgraded ${expired} expired PRO user(s) to free`);
      } catch (err: any) {
        console.error("[pro-expiry] Failed:", err?.message);
      }
    };
    await runProExpiry(); // run once at startup to catch any already-expired users
    setInterval(runProExpiry, 60 * 60 * 1000); // then every hour

    // ── Fraud score decay (every 24h) ─────────────────────────────────────────
    setInterval(async () => {
      try {
        const decayed = await decayFraudScores();
        if (decayed > 0) console.log(`[fraud-decay] Reduced score for ${decayed} user(s)`);
      } catch (err: any) {
        console.error("[fraud-decay] Failed:", err?.message);
      }
    }, 24 * 60 * 60 * 1000);
  } catch (err: any) {
    console.error("[app] DB bootstrap failed:", err?.message);
  }
})();

export default app;
