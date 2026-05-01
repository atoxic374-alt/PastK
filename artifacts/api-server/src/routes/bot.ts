import { Router } from "express";
import { botEngine } from "../lib/bot-engine.js";
import { db } from "@workspace/db";
import { botLogsTable, messagesTable } from "@workspace/db";
import { StartBotBody, SubmitOtpBody, CreateMessageBody, DeleteMessageParams, SearchChannelsQueryParams } from "@workspace/api-zod";
import { desc, eq } from "drizzle-orm";

export const botRouter = Router();

// Full browser-like headers to avoid 403 from Kick CDN
const KICK_HEADERS = {
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "ar-SA,ar;q=0.9,en-US;q=0.8,en;q=0.7",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache",
  "Referer": "https://kick.com/",
  "Origin": "https://kick.com",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
};

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
  // Start async — don't await (bot runs in background)
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
  // Submit OTP async — bot handles timing internally
  botEngine.submitOtp(parsed.data.code).catch(() => {});
  res.json({ submitted: true });
});

botRouter.get("/bot/account", (_req, res) => {
  res.json({ account: botEngine.getAccount() });
});

botRouter.get("/bot/logs", async (_req, res) => {
  const logs = await db
    .select()
    .from(botLogsTable)
    .orderBy(desc(botLogsTable.timestamp))
    .limit(150);
  res.json({ logs });
});

// ─── Channel search ────────────────────────────────────────────

botRouter.get("/channels/search", async (req, res) => {
  const parsed = SearchChannelsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing query param ?q=", results: [] });
    return;
  }
  const q = parsed.data.q;

  const parseChannels = (data: any) => {
    const raw = data?.channels?.data ?? data?.data?.channels?.data ?? data?.data ?? [];
    return (Array.isArray(raw) ? raw : []).map((ch: any) => ({
      slug: ch.slug ?? ch.user?.slug ?? ch.username ?? "",
      username: ch.user?.username ?? ch.slug ?? ch.username ?? "",
      avatar: ch.user?.profile_pic ?? ch.profile_pic ?? null,
      isLive: !!(ch.is_live ?? (ch.livestream !== null && ch.livestream !== undefined)),
      viewers: ch.livestream?.viewer_count ?? null,
      streamTitle: ch.livestream?.session_title ?? null,
      category: ch.livestream?.categories?.[0]?.name ?? ch.category?.name ?? null,
      followersCount: ch.followers_count ?? null,
      thumbnail: ch.livestream?.thumbnail?.src ?? null,
      streamStartedAt: ch.livestream?.created_at ?? null,
    }));
  };

  // Try browser-based fetch first (bypasses Cloudflare)
  if (botEngine.hasBrowser()) {
    const data = await botEngine.browserFetch(
      `https://kick.com/api/v1/search?query=${encodeURIComponent(q)}&limit=10`
    );
    if (data) {
      res.json({ results: parseChannels(data) });
      return;
    }
  }

  // Fallback: direct server request
  try {
    const r = await fetch(
      `https://kick.com/api/v1/search?query=${encodeURIComponent(q)}&limit=10`,
      { headers: KICK_HEADERS },
    );
    if (!r.ok) throw new Error(`${r.status}`);
    res.json({ results: parseChannels(await r.json()) });
  } catch {
    // Kick blocks server requests — return empty with note
    res.json({ results: [], error: "start_bot_first" });
  }
});

// ─── Channel live status ───────────────────────────────────────

botRouter.get("/channels/:slug/status", async (req, res) => {
  const slug = req.params.slug;

  const parseChannel = (data: any) => {
    const stream = data.livestream;
    return {
      slug: data.slug ?? slug,
      username: data.user?.username ?? slug,
      avatar: data.user?.profile_pic ?? null,
      isLive: !!stream,
      viewers: stream?.viewer_count ?? null,
      streamTitle: stream?.session_title ?? null,
      category: stream?.categories?.[0]?.name ?? null,
      followersCount: data.followers_count ?? null,
      thumbnail: stream?.thumbnail?.src ?? null,
      streamStartedAt: stream?.created_at ?? null,
    };
  };

  // Try browser-based fetch first
  if (botEngine.hasBrowser()) {
    const data = await botEngine.browserFetch(`https://kick.com/api/v2/channels/${slug}`);
    if (data) { res.json(parseChannel(data)); return; }
  }

  try {
    const r = await fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(slug)}`, {
      headers: KICK_HEADERS,
    });
    if (!r.ok) throw new Error(`Kick API ${r.status}`);
    res.json(parseChannel(await r.json()));
  } catch (err: any) {
    res.status(502).json({ error: err?.message ?? "Kick API error" });
  }
});

// ─── Channel recent streams ────────────────────────────────────

botRouter.get("/channels/:slug/recent-streams", async (req, res) => {
  const slug = req.params.slug;
  try {
    let data: any = null;

    // Try browser-based fetch first
    if (botEngine.hasBrowser()) {
      data = await botEngine.browserFetch(
        `https://kick.com/api/v2/channels/${slug}/videos?page=1&limit=10`
      );
    }

    // Fallback: direct request
    if (!data) {
      const r = await fetch(
        `https://kick.com/api/v2/channels/${encodeURIComponent(slug)}/videos?page=1&limit=10`,
        { headers: KICK_HEADERS },
      );
      if (!r.ok) { res.json({ streams: [], totalStreams: null }); return; }
      data = await r.json();
    }

    if (!data) {
      res.json({ streams: [], totalStreams: null });
      return;
    }

    const raw = data?.data ?? data?.videos ?? data ?? [];
    const streams = (Array.isArray(raw) ? raw : []).map((v: any) => ({
      id: v.id ?? 0,
      title: v.session_title ?? v.title ?? null,
      startedAt: v.start_time ?? v.created_at ?? null,
      endedAt: v.end_time ?? null,
      durationSeconds: v.duration ?? null,
      peakViewers: v.views ?? v.viewer_count ?? null,
      category: v.categories?.[0]?.name ?? v.category?.name ?? null,
      thumbnail: v.thumbnail?.src ?? v.thumbnail ?? null,
    }));

    res.json({
      streams,
      totalStreams: data?.total ?? data?.meta?.total ?? streams.length,
    });
  } catch {
    res.json({ streams: [], totalStreams: null });
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
