import express, { type Express } from "express";
import cors from "cors";
import router from "./routes";
import {
  ensureUsersTable, ensureMessagesTable,
  ensureChatUsersTable, ensureChatContactsTable,
} from "./lib/db";

const app: Express = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Bootstrap DB tables (sequential so foreign-key-like order is respected)
(async () => {
  try {
    await ensureUsersTable();
    await ensureMessagesTable();
    await ensureChatUsersTable();
    await ensureChatContactsTable();
  } catch (err: any) {
    console.error("[app] DB bootstrap failed:", err?.message);
  }
})();

export default app;
