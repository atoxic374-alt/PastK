import { Router } from "express";
import { botEngine } from "../lib/bot-engine.js";
import { db } from "@workspace/db";
import { botLogsTable, messagesTable } from "@workspace/db";
import { StartBotBody, CreateMessageBody, DeleteMessageParams } from "@workspace/api-zod";
import { desc, eq } from "drizzle-orm";

export const botRouter = Router();

botRouter.get("/bot/status", async (req, res) => {
  res.json(botEngine.getStatus());
});

botRouter.post("/bot/start", async (req, res) => {
  const parsed = StartBotBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const { channelName, intervalSeconds, email, password } = parsed.data as any;
  botEngine.start({ channelName, email, password, intervalSeconds }).catch(() => {});
  res.json(botEngine.getStatus());
});

botRouter.post("/bot/stop", async (req, res) => {
  await botEngine.stop();
  res.json(botEngine.getStatus());
});

botRouter.get("/bot/logs", async (req, res) => {
  const logs = await db
    .select()
    .from(botLogsTable)
    .orderBy(desc(botLogsTable.timestamp))
    .limit(50);
  res.json({ logs });
});

botRouter.get("/messages", async (req, res) => {
  const messages = await db.select().from(messagesTable).orderBy(desc(messagesTable.createdAt));
  res.json({ messages });
});

botRouter.post("/messages", async (req, res) => {
  const parsed = CreateMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const [msg] = await db.insert(messagesTable).values({ text: parsed.data.text }).returning();
  res.status(201).json(msg);
});

botRouter.delete("/messages/:id", async (req, res) => {
  const parsed = DeleteMessageParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(messagesTable).where(eq(messagesTable.id, parsed.data.id));
  res.json({ success: true });
});
