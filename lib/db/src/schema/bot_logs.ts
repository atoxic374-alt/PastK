import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

export const botLogsTable = pgTable("bot_logs", {
  id: serial("id").primaryKey(),
  event: text("event").notNull(),
  message: text("message"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export type BotLog = typeof botLogsTable.$inferSelect;
