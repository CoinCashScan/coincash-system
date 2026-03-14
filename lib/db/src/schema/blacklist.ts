import { pgTable, serial, varchar, bigint, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const blacklistedAddresses = pgTable("blacklisted_addresses", {
  id: serial("id").primaryKey(),
  address: varchar("address", { length: 64 }).notNull().unique(),
  chain: varchar("chain", { length: 20 }).notNull().default("TRON"),
  riskLevel: varchar("risk_level", { length: 20 }).notNull().default("HIGH"),
  freezeBalance: text("freeze_balance").notNull().default("0"),
  freezeTime: bigint("freeze_time", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBlacklistedAddressSchema = createInsertSchema(blacklistedAddresses).omit({
  id: true,
  createdAt: true,
});
export type InsertBlacklistedAddress = z.infer<typeof insertBlacklistedAddressSchema>;
export type BlacklistedAddress = typeof blacklistedAddresses.$inferSelect;
