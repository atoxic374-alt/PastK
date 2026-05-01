import { Router } from "express";
import { botEngine } from "../lib/bot-engine.js";
import { db } from "@workspace/db";
import { botLogsTable, messagesTable } from "@workspace/db";
import { StartBotBody, SubmitOtpBody, CreateMessageBody, DeleteMessageParams, SearchChannelsQueryParams } from "@workspace/api-zod";
import { desc, eq } from "drizzle-orm";

export const botRouter = Router();

// ─── Bot control ───────────────────────────────────────────────

botRouter.get("/bot/status", (_req, res) => {
  res.json(botEngine.getStatus());
});

botRouter.post("/bot/start", async (req, res) => {
  const parsed = StartBotBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", issues: parsed.error.issues });
    return;
  }
  const { channelName, email, password, intervalSeconds } = parsed.data;
  botEngine.start({ channelName, email, password, intervalSeconds }).catch(() => {});
  res.json(botEngine.getStatus());
});

botRouter.post("/bot/stop", async (_req, res) => {
  await botEngine.stop();
  res.json(botEngine.getStatus());
});

botRouter.post("/bot/otp", async (req, res) => {
  const parsed = SubmitOtpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid OTP body" });
    return;
  }
  await botEngine.submitOtp(parsed.data.code);
  res.json(botEngine.getStatus());
});

botRouter.get("/bot/account", (_req, res) => {
  res.json({ account: botEngine.getAccount() });
});

botRouter.get("/bot/logs", async (_req, res) => {
  const logs = await db
    .select()
    .from(botLogsTable)
    .orderBy(desc(botLogsTable.timestamp))
    .limit(100);
  res.json({ logs });
});

// ─── Channel search (uses Kick public API) ─────────────────────

botRouter.get("/channels/search", async (req, res) => {
  const parsed = SearchChannelsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing query param ?q=" });
    return;
  }
  const q = parsed.data.q;
  try {
    const r = await fetch(
      `https://kick.com/api/v1/search?query=${encodeURIComponent(q)}&limit=8`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
        },
      },
    );
    if (!r.ok) throw new Error(`Kick API ${r.status}`);
    const data: any = await r.json();

    const channels = (data?.channels?.data ?? data?.data?.channels?.data ?? []).map((ch: any) => ({
      slug: ch.slug ?? ch.user?.slug ?? ch.username,
      username: ch.user?.username ?? ch.slug ?? ch.username,
      avatar: ch.user?.profile_pic ?? ch.profile_pic ?? null,
      isLive: ch.is_live ?? ch.livestream !== null,
      viewers: ch.livestream?.viewer_count ?? null,
      streamTitle: ch.livestream?.session_title ?? null,
      category: ch.livestream?.categories?.[0]?.name ?? ch.category?.name ?? null,
      followersCount: ch.followers_count ?? null,
      thumbnail: ch.livestream?.thumbnail?.src ?? null,
    }));

    res.json({ results: channels });
  } catch (err: any) {
    res.status(502).json({ error: err?.message ?? "Kick API error", results: [] });
  }
});

botRouter.get("/channels/:slug/status", async (req, res) => {
  const slug = req.params.slug;
  try {
    const r = await fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(slug)}`, {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
      },
    });
    if (!r.ok) throw new Error(`Kick API ${r.status}`);
    const data: any = await r.json();
    const stream = data.livestream;

    res.json({
      slug: data.slug ?? slug,
      username: data.user?.username ?? slug,
      avatar: data.user?.profile_pic ?? null,
      isLive: !!stream,
      viewers: stream?.viewer_count ?? null,
      streamTitle: stream?.session_title ?? null,
      category: stream?.categories?.[0]?.name ?? null,
      followersCount: data.followers_count ?? null,
      thumbnail: stream?.thumbnail?.src ?? null,
    });
  } catch (err: any) {
    res.status(502).json({ error: err?.message ?? "Kick API error" });
  }
});

// ─── Messages ──────────────────────────────────────────────────

botRouter.get("/messages", async (_req, res) => {
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
