import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { db } from "@workspace/db";
import { botLogsTable, messagesTable } from "@workspace/db";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "..", "data");
const COOKIES_DIR = path.join(DATA_DIR, "cookies");

export type BotState =
  | "idle"
  | "launching"
  | "logging_in"
  | "awaiting_otp"
  | "verifying"
  | "monitoring"
  | "live"
  | "stopped"
  | "error";

export interface AccountInfo {
  username: string;
  email?: string;
  avatar?: string | null;
  followersCount: number;
  followingCount: number;
  verified: boolean;
}

export interface BotStatusData {
  state: BotState;
  channelName?: string;
  isLive: boolean;
  messagesSent: number;
  intervalSeconds: number;
  startedAt?: string | null;
  otpRequired: boolean;
  account?: AccountInfo | null;
  error?: string | null;
  viewers?: number | null;
  streamTitle?: string | null;
}

export interface BotConfig {
  channelName: string;
  email: string;
  password: string;
  intervalSeconds: number;
}

class KickBotEngine {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  private state: BotState = "idle";
  private channelName = "";
  private intervalSeconds = 300;
  private startedAt: string | null = null;
  private messagesSent = 0;
  private isLive = false;
  private otpRequired = false;
  private account: AccountInfo | null = null;
  private error: string | null = null;
  private viewers: number | null = null;
  private streamTitle: string | null = null;

  private otpResolver: ((code: string) => void) | null = null;
  private monitorTimer: ReturnType<typeof setTimeout> | null = null;

  getStatus(): BotStatusData {
    return {
      state: this.state,
      channelName: this.channelName,
      isLive: this.isLive,
      messagesSent: this.messagesSent,
      intervalSeconds: this.intervalSeconds,
      startedAt: this.startedAt,
      otpRequired: this.otpRequired,
      account: this.account,
      error: this.error,
      viewers: this.viewers,
      streamTitle: this.streamTitle,
    };
  }

  getAccount(): AccountInfo | null {
    return this.account;
  }

  // ─── Utilities ────────────────────────────────────────────────

  private cookiesPath(email: string) {
    fs.mkdirSync(COOKIES_DIR, { recursive: true });
    return path.join(COOKIES_DIR, `${email.replace(/[^a-zA-Z0-9]/g, "_")}.json`);
  }

  private ri(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private delay(min: number, max: number) {
    return new Promise<void>((r) => setTimeout(r, this.ri(min, max)));
  }

  private async log(event: string, message?: string) {
    try {
      await db.insert(botLogsTable).values({ event, message: message ?? null });
    } catch {}
  }

  // ─── Browser Setup ─────────────────────────────────────────────

  private async launchBrowser(): Promise<Browser> {
    return chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--disable-dev-shm-usage",
        "--disable-web-security",
        `--window-size=${this.ri(1280, 1440)},${this.ri(800, 920)}`,
        "--lang=ar-SA,ar,en-US",
        "--disable-background-timer-throttling",
        "--disable-renderer-backgrounding",
      ],
    });
  }

  private async buildContext(browser: Browser): Promise<BrowserContext> {
    const agents = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    ];
    const w = this.ri(1280, 1440);
    const h = this.ri(800, 920);

    const ctx = await browser.newContext({
      userAgent: agents[this.ri(0, agents.length - 1)],
      viewport: { width: w, height: h },
      screen: { width: w, height: h },
      locale: "ar-SA",
      timezoneId: "Asia/Riyadh",
      javaScriptEnabled: true,
      bypassCSP: false,
      extraHTTPHeaders: {
        "Accept-Language": "ar-SA,ar;q=0.9,en-US;q=0.8,en;q=0.7",
        "sec-ch-ua": `"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"`,
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
      },
    });

    // Stealth: mask automation fingerprints (script runs in browser context)
    await ctx.addInitScript(`
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', { get: () => Object.assign([{},{},{},{},{}], {length:5}) });
      Object.defineProperty(navigator, 'languages', { get: () => ['ar-SA','ar','en-US','en'] });
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
      window.chrome = { runtime: {}, loadTimes: () => {}, csi: () => {}, app: {} };
      if (navigator.permissions) {
        const _origQuery = navigator.permissions.query.bind(navigator.permissions);
        navigator.permissions.query = (p) =>
          p.name === 'notifications'
            ? Promise.resolve({ state: Notification.permission })
            : _origQuery(p);
      }
    `);

    return ctx;
  }

  // ─── Human simulation helpers ──────────────────────────────────

  private async humanType(page: Page, selector: string, text: string) {
    const el = await page.$(selector);
    if (!el) return false;
    await el.click();
    await this.delay(200, 500);
    // Clear existing content first
    await page.keyboard.press("Control+a");
    await this.delay(100, 200);
    for (const char of text) {
      await page.keyboard.type(char, { delay: this.ri(55, 160) });
      if (Math.random() < 0.05) await this.delay(200, 500); // occasional pause
    }
    return true;
  }

  private async naturalMouseMove(page: Page) {
    const points = Array.from({ length: this.ri(3, 7) }, () => ({
      x: this.ri(100, 1200),
      y: this.ri(100, 700),
    }));
    for (const pt of points) {
      await page.mouse.move(pt.x, pt.y, { steps: this.ri(5, 15) });
      await this.delay(80, 300);
    }
  }

  private async naturalScroll(page: Page, direction: "down" | "up" = "down") {
    const steps = this.ri(3, 8);
    for (let i = 0; i < steps; i++) {
      await page.mouse.wheel(0, direction === "down" ? this.ri(80, 200) : -this.ri(80, 200));
      await this.delay(100, 300);
    }
  }

  // ─── Cookie management ─────────────────────────────────────────

  private async saveCookies(email: string) {
    if (!this.context) return;
    const cookies = await this.context.cookies();
    fs.writeFileSync(this.cookiesPath(email), JSON.stringify(cookies, null, 2));
    await this.log("SESSION", "Cookies saved successfully");
  }

  private async loadCookies(email: string): Promise<boolean> {
    const p = this.cookiesPath(email);
    if (!fs.existsSync(p)) return false;
    try {
      const cookies = JSON.parse(fs.readFileSync(p, "utf-8"));
      await this.context!.addCookies(cookies);
      await this.log("SESSION", "Cookies loaded from disk");
      return true;
    } catch {
      return false;
    }
  }

  // ─── Session verification via Kick API ────────────────────────

  private async verifySession(): Promise<boolean> {
    if (!this.page) return false;
    try {
      // Try Kick's own /api/v1/user endpoint
      const resp = await this.page.evaluate(async () => {
        try {
          const r = await fetch("https://kick.com/api/v1/user", {
            headers: { Accept: "application/json" },
            credentials: "include",
          });
          if (!r.ok) return null;
          return await r.json();
        } catch {
          return null;
        }
      });

      const r = resp as any;
      if (r && r.username) {
        this.account = {
          username: r.username,
          email: r.email ?? undefined,
          avatar: r.profile_pic ?? r.profile_image ?? null,
          followersCount: r.followers_count ?? 0,
          followingCount: r.following_count ?? 0,
          verified: r.is_verified ?? false,
        };
        await this.log("ACCOUNT", `Logged in as @${this.account.username} | Followers: ${this.account.followersCount}`);
        return true;
      }
    } catch {}
    return false;
  }

  // ─── Login flow ────────────────────────────────────────────────

  private async performLogin(email: string, password: string): Promise<void> {
    if (!this.page) return;
    this.state = "logging_in";
    await this.log("LOGIN", `Attempting login for ${email}`);

    // Navigate to kick.com
    await this.page.goto("https://kick.com", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await this.delay(2000, 4000);
    await this.naturalMouseMove(this.page);

    // Find and click login button
    const loginSelectors = [
      'button:has-text("Sign in")',
      'button:has-text("Log in")',
      '[data-testid="login-button"]',
      'a[href*="login"]',
    ];
    let clickedLogin = false;
    for (const sel of loginSelectors) {
      try {
        const btn = await this.page.$(sel);
        if (btn) {
          await btn.click();
          clickedLogin = true;
          await this.delay(1500, 2500);
          break;
        }
      } catch {}
    }
    if (!clickedLogin) {
      await this.page.goto("https://kick.com/login", {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await this.delay(2000, 3000);
    }

    // Fill email
    const emailSelectors = [
      'input[name="email"]',
      'input[type="email"]',
      'input[placeholder*="mail" i]',
      'input[autocomplete="email"]',
    ];
    let typedEmail = false;
    for (const sel of emailSelectors) {
      if (await this.humanType(this.page, sel, email)) {
        typedEmail = true;
        break;
      }
    }
    if (!typedEmail) throw new Error("Could not find email field");

    await this.delay(600, 1200);

    // Fill password
    const passSelectors = [
      'input[name="password"]',
      'input[type="password"]',
    ];
    let typedPass = false;
    for (const sel of passSelectors) {
      if (await this.humanType(this.page, sel, password)) {
        typedPass = true;
        break;
      }
    }
    if (!typedPass) throw new Error("Could not find password field");

    await this.delay(800, 1500);
    await this.naturalMouseMove(this.page);

    // Submit
    const submitSelectors = [
      'button[type="submit"]',
      'button:has-text("Continue")',
      'button:has-text("Sign in")',
      'button:has-text("Log in")',
    ];
    for (const sel of submitSelectors) {
      try {
        const btn = await this.page.$(sel);
        if (btn) {
          await btn.click();
          break;
        }
      } catch {}
    }

    await this.delay(3000, 5000);
    await this.checkForOtp();
  }

  private async checkForOtp(): Promise<void> {
    if (!this.page) return;
    const otpSelectors = [
      'input[name="one_time_password"]',
      'input[placeholder*="code" i]',
      'input[placeholder*="OTP" i]',
      'input[placeholder*="verification" i]',
      'input[autocomplete="one-time-code"]',
      '[data-testid="otp-input"]',
    ];
    for (const sel of otpSelectors) {
      const el = await this.page.$(sel);
      if (el) {
        this.state = "awaiting_otp";
        this.otpRequired = true;
        await this.log("OTP", "OTP input detected — waiting for user to enter code");
        return;
      }
    }

    // Also check for OTP-related text on page
    const pageText = await this.page.evaluate(`document.body.innerText ?? ""`) as string;
    if (
      pageText.toLowerCase().includes("verification code") ||
      pageText.toLowerCase().includes("one-time") ||
      pageText.toLowerCase().includes("otp") ||
      pageText.toLowerCase().includes("رمز التحقق")
    ) {
      this.state = "awaiting_otp";
      this.otpRequired = true;
      await this.log("OTP", "OTP page detected via text — waiting for user");
      return;
    }

    // No OTP — move to verification
    await this.finishLogin(null);
  }

  async submitOtp(code: string): Promise<void> {
    if (this.state !== "awaiting_otp" || !this.page) return;
    await this.log("OTP", `Submitting OTP: ${code}`);

    const otpSelectors = [
      'input[name="one_time_password"]',
      'input[placeholder*="code" i]',
      'input[placeholder*="OTP" i]',
      'input[autocomplete="one-time-code"]',
      '[data-testid="otp-input"]',
    ];
    for (const sel of otpSelectors) {
      if (await this.humanType(this.page, sel, code)) break;
    }

    await this.delay(500, 1000);

    const submitSels = [
      'button[type="submit"]',
      'button:has-text("Verify")',
      'button:has-text("Confirm")',
      'button:has-text("Continue")',
    ];
    for (const sel of submitSels) {
      try {
        const btn = await this.page.$(sel);
        if (btn) { await btn.click(); break; }
      } catch {}
    }

    await this.delay(3000, 5000);
    this.otpRequired = false;
    await this.finishLogin(null);
  }

  private async finishLogin(email: string | null): Promise<void> {
    if (!this.page) return;
    this.state = "verifying";
    await this.log("LOGIN", "Verifying session...");

    // Navigate to homepage to trigger session
    await this.page.goto("https://kick.com", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await this.delay(2000, 4000);

    const ok = await this.verifySession();
    if (ok) {
      if (email) await this.saveCookies(email);
      this.state = "monitoring";
      await this.log("LOGIN", `Session verified as @${this.account?.username}`);
      this.startMonitoring();
    } else {
      this.state = "error";
      this.error = "Login verification failed — check credentials";
      await this.log("ERROR", this.error);
    }
  }

  // ─── Channel monitoring ────────────────────────────────────────

  private startMonitoring() {
    const tick = async () => {
      if (this.state !== "monitoring" && this.state !== "live") return;
      try {
        await this.checkChannelStatus();
        if (this.isLive) {
          await this.sendChatMessage();
        }
      } catch (err: any) {
        await this.log("ERROR", err?.message ?? String(err));
      }
      if (this.state === "monitoring" || this.state === "live") {
        const jitter = this.ri(-30, 30);
        this.monitorTimer = setTimeout(tick, (this.intervalSeconds + jitter) * 1000);
      }
    };
    tick();
  }

  private async checkChannelStatus(): Promise<void> {
    if (!this.page) return;

    // Use Kick API for status check (lighter than loading the full page)
    const data = await this.page.evaluate(async (slug: string) => {
      try {
        const r = await fetch(`https://kick.com/api/v2/channels/${slug}`, {
          headers: { Accept: "application/json" },
          credentials: "include",
        });
        if (!r.ok) return null;
        return await r.json();
      } catch {
        return null;
      }
    }, this.channelName);

    const wasLive = this.isLive;

    if (data) {
      const d = data as any;
      const stream = d.livestream;
      this.isLive = !!stream;
      this.viewers = stream?.viewer_count ?? null;
      this.streamTitle = stream?.session_title ?? d.user?.stream_title ?? null;
      this.state = this.isLive ? "live" : "monitoring";
    } else {
      // Fallback: navigate to channel page and check visually
      const currentUrl = this.page.url();
      if (!currentUrl.includes(this.channelName)) {
        await this.page.goto(`https://kick.com/${this.channelName}`, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        await this.delay(2000, 4000);
        await this.naturalScroll(this.page, "down");
        await this.delay(1000, 2000);
        await this.naturalScroll(this.page, "up");
      }
      this.isLive = (await this.page.evaluate(
        `!!(document.querySelector(".live-badge") || document.querySelector('[class*="live-badge"]') || document.querySelector('[data-testid*="live"]'))`
      )) as boolean;
      this.state = this.isLive ? "live" : "monitoring";
    }

    if (this.isLive && !wasLive) {
      await this.log("LIVE_START", `${this.channelName} went LIVE! Viewers: ${this.viewers ?? "?"} | ${this.streamTitle ?? ""}`);
    } else if (!this.isLive && wasLive) {
      await this.log("LIVE_END", `${this.channelName} went offline`);
    } else if (!this.isLive) {
      await this.log("CHECK", `${this.channelName} is offline — next check in ${this.intervalSeconds}s`);
    }
  }

  private async sendChatMessage(): Promise<void> {
    if (!this.page) return;

    const msgs = await db.select().from(messagesTable);
    if (!msgs.length) {
      await this.log("INFO", "No messages in list — add messages to enable auto-chat");
      return;
    }

    const msg = msgs[this.ri(0, msgs.length - 1)];

    // Make sure we are on the channel page
    const currentUrl = this.page.url();
    if (!currentUrl.includes(this.channelName)) {
      await this.page.goto(`https://kick.com/${this.channelName}`, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await this.delay(3000, 5000);
    }

    // Natural behavior before typing
    await this.naturalMouseMove(this.page);
    await this.delay(500, 1500);

    const chatSelectors = [
      '[data-testid="chat-input"]',
      'div[contenteditable="true"][class*="chat"]',
      'div[contenteditable="true"]',
      'textarea[placeholder*="chat" i]',
      'textarea[placeholder*="Send" i]',
      'input[placeholder*="Send" i]',
    ];

    let sent = false;
    for (const sel of chatSelectors) {
      const el = await this.page.$(sel);
      if (el) {
        await el.click();
        await this.delay(300, 700);
        // Type with human speed
        for (const char of msg.text) {
          await this.page.keyboard.type(char, { delay: this.ri(50, 130) });
        }
        await this.delay(300, 800);
        await this.page.keyboard.press("Enter");
        sent = true;
        break;
      }
    }

    if (sent) {
      this.messagesSent++;
      await this.log("MESSAGE_SENT", `"${msg.text}"`);
      // Natural post-send behavior
      await this.delay(500, 1500);
      await this.naturalMouseMove(this.page);
    } else {
      await this.log("WARNING", "Chat input not found — channel may require account follow or login");
    }
  }

  // ─── Public API ────────────────────────────────────────────────

  async start(config: BotConfig): Promise<void> {
    if (this.state !== "idle" && this.state !== "stopped" && this.state !== "error") return;

    this.state = "launching";
    this.channelName = config.channelName;
    this.intervalSeconds = config.intervalSeconds;
    this.startedAt = new Date().toISOString();
    this.messagesSent = 0;
    this.isLive = false;
    this.otpRequired = false;
    this.account = null;
    this.error = null;
    this.viewers = null;
    this.streamTitle = null;

    await this.log("BOT_START", `Launching for channel: ${config.channelName}`);

    try {
      this.browser = await this.launchBrowser();
      this.context = await this.buildContext(this.browser);
      this.page = await this.context.newPage();

      // Try to restore session from cookies
      const hadCookies = await this.loadCookies(config.email);
      if (hadCookies) {
        await this.page.goto("https://kick.com", {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        await this.delay(2000, 4000);
        const valid = await this.verifySession();
        if (valid) {
          await this.log("SESSION", `Restored session for @${(this.account as AccountInfo | null)?.username}`);
          this.state = "monitoring";
          this.startMonitoring();
          return;
        }
        await this.log("SESSION", "Saved session expired — logging in again");
      }

      // Fresh login
      await this.performLogin(config.email, config.password);
      if ((this.state as BotState) === "monitoring") {
        await this.saveCookies(config.email);
      }
    } catch (err: any) {
      this.state = "error";
      this.error = err?.message ?? String(err);
      await this.log("ERROR", this.error ?? "Unknown error");
      await this.cleanupBrowser();
    }
  }

  async stop(): Promise<void> {
    if (this.monitorTimer) { clearTimeout(this.monitorTimer); this.monitorTimer = null; }
    this.state = "stopped";
    this.isLive = false;
    this.otpRequired = false;
    this.otpResolver = null;
    await this.log("BOT_STOP", "Bot stopped by user");
    await this.cleanupBrowser();
  }

  private async cleanupBrowser(): Promise<void> {
    try { await this.page?.close(); } catch {}
    try { await this.context?.close(); } catch {}
    try { await this.browser?.close(); } catch {}
    this.page = null;
    this.context = null;
    this.browser = null;
  }
}

export const botEngine = new KickBotEngine();
