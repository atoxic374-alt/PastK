import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { db } from "@workspace/db";
import { botLogsTable, messagesTable } from "@workspace/db";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "..", "data");
const COOKIES_DIR = path.join(DATA_DIR, "cookies");

// ─── Types ─────────────────────────────────────────────────────

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
  liveEnteredAt?: string | null;
  liveSessionCount: number;
  streamStartedAt?: string | null;
  otpRequired: boolean;
  account?: AccountInfo | null;
  error?: string | null;
  viewers?: number | null;
  streamTitle?: string | null;
  category?: string | null;
  channelFollowers?: number | null;
}

export interface BotConfig {
  channelName: string;
  email: string;
  password: string;
  intervalSeconds: number;
}

// ─── Engine ────────────────────────────────────────────────────

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
  private category: string | null = null;
  private channelFollowers: number | null = null;
  private liveEnteredAt: string | null = null;
  private liveSessionCount = 0;
  private streamStartedAt: string | null = null;

  // Timers
  private monitorTimer: ReturnType<typeof setTimeout> | null = null;
  private liveTimer: ReturnType<typeof setTimeout> | null = null;
  private quietCheckTimer: ReturnType<typeof setTimeout> | null = null;
  private idleBehaviorTimer: ReturnType<typeof setTimeout> | null = null;

  // ─── Public status ───────────────────────────────────────────

  getStatus(): BotStatusData {
    return {
      state: this.state,
      channelName: this.channelName,
      isLive: this.isLive,
      messagesSent: this.messagesSent,
      intervalSeconds: this.intervalSeconds,
      startedAt: this.startedAt,
      liveEnteredAt: this.liveEnteredAt,
      liveSessionCount: this.liveSessionCount,
      streamStartedAt: this.streamStartedAt,
      otpRequired: this.otpRequired,
      account: this.account,
      error: this.error,
      viewers: this.viewers,
      streamTitle: this.streamTitle,
      category: this.category,
      channelFollowers: this.channelFollowers,
    };
  }

  getAccount(): AccountInfo | null {
    return this.account;
  }

  // Make an API call through the browser context (bypasses Cloudflare)
  async browserFetch(url: string): Promise<any | null> {
    if (!this.page) return null;
    try {
      return await this.page.evaluate(async (u: string) => {
        try {
          const r = await fetch(u, {
            headers: { Accept: "application/json" },
            credentials: "include",
          });
          if (!r.ok) return null;
          return await r.json();
        } catch { return null; }
      }, url);
    } catch {
      return null;
    }
  }

  hasBrowser(): boolean {
    return !!this.page;
  }

  // ─── Utilities ───────────────────────────────────────────────

  private cookiesPath(email: string) {
    fs.mkdirSync(COOKIES_DIR, { recursive: true });
    return path.join(COOKIES_DIR, `${email.replace(/[^a-zA-Z0-9]/g, "_")}.json`);
  }

  private ri(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private rf(min: number, max: number) {
    return Math.random() * (max - min) + min;
  }

  private delay(minMs: number, maxMs: number) {
    return new Promise<void>((r) => setTimeout(r, this.ri(minMs, maxMs)));
  }

  private async log(event: string, message?: string) {
    try {
      await db.insert(botLogsTable).values({ event, message: message ?? null });
    } catch {}
  }

  // ─── Browser setup ───────────────────────────────────────────

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
        "--disable-backgrounding-occluded-windows",
      ],
    });
  }

  private async buildContext(browser: Browser): Promise<BrowserContext> {
    const agents = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.6312.107 Safari/537.36",
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

    // Stealth: mask automation fingerprints
    await ctx.addInitScript(`
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', {
        get: () => Object.assign([
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
          { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' }
        ], { length: 3 })
      });
      Object.defineProperty(navigator, 'languages', { get: () => ['ar-SA', 'ar', 'en-US', 'en'] });
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
      Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 });
      window.chrome = {
        runtime: { onConnect: { addListener: () => {} }, onMessage: { addListener: () => {} } },
        loadTimes: () => ({ firstPaintTime: 0, requestTime: Date.now() / 1000 }),
        csi: () => ({ onloadT: Date.now(), pageT: Date.now(), startE: Date.now(), tran: 15 }),
        app: { isInstalled: false }
      };
      if (navigator.permissions) {
        const _origQuery = navigator.permissions.query.bind(navigator.permissions);
        navigator.permissions.query = (p) =>
          p.name === 'notifications'
            ? Promise.resolve({ state: Notification.permission })
            : _origQuery(p);
      }
      // Hide automation-related properties
      delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
      delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
      delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
    `);

    return ctx;
  }

  // ─── Human simulation ────────────────────────────────────────

  private async humanType(page: Page, selector: string, text: string): Promise<boolean> {
    const el = await page.$(selector);
    if (!el) return false;
    await el.click();
    await this.delay(200, 600);
    await page.keyboard.press("Control+a");
    await this.delay(80, 200);
    for (const char of text) {
      await page.keyboard.type(char, { delay: this.ri(60, 175) });
      if (Math.random() < 0.04) await this.delay(150, 450); // occasional thinking pause
      if (Math.random() < 0.02) {
        // simulate typo + backspace
        await page.keyboard.type("x", { delay: 50 });
        await this.delay(100, 250);
        await page.keyboard.press("Backspace");
        await this.delay(80, 200);
      }
    }
    return true;
  }

  private async naturalMouseMove(page: Page, points = 4) {
    const viewport = page.viewportSize() ?? { width: 1280, height: 800 };
    for (let i = 0; i < points; i++) {
      await page.mouse.move(
        this.ri(50, viewport.width - 50),
        this.ri(50, viewport.height - 50),
        { steps: this.ri(6, 18) }
      );
      await this.delay(60, 280);
    }
  }

  private async naturalScroll(page: Page, direction: "down" | "up" = "down", steps?: number) {
    const n = steps ?? this.ri(2, 6);
    for (let i = 0; i < n; i++) {
      await page.mouse.wheel(0, direction === "down" ? this.ri(80, 220) : -this.ri(80, 220));
      await this.delay(90, 320);
    }
  }

  // Idle behaviors while watching a live stream — simulates a natural viewer
  private async idleViewerBehavior(page: Page): Promise<void> {
    const action = this.ri(0, 5);
    switch (action) {
      case 0:
        // Scroll chat area up and back
        await this.naturalScroll(page, "up", this.ri(2, 4));
        await this.delay(800, 2000);
        await this.naturalScroll(page, "down", this.ri(2, 4));
        break;
      case 1:
        // Move mouse to video area (simulate watching)
        await page.mouse.move(this.ri(200, 900), this.ri(100, 450), { steps: this.ri(8, 20) });
        await this.delay(400, 1200);
        break;
      case 2:
        // Move mouse over chat
        await page.mouse.move(this.ri(900, 1200), this.ri(200, 600), { steps: this.ri(5, 12) });
        await this.delay(300, 800);
        break;
      case 3:
        // Just linger — no action (afk-like)
        await this.delay(1000, 3000);
        break;
      default:
        await this.naturalMouseMove(page, 2);
        break;
    }
  }

  // Schedule random idle behaviors while in live
  private scheduleIdleBehavior(): void {
    if (this.idleBehaviorTimer) clearTimeout(this.idleBehaviorTimer);
    const nextMs = this.ri(30, 90) * 1000; // every 30–90 seconds
    this.idleBehaviorTimer = setTimeout(async () => {
      if (this.state === "live" && this.page) {
        try { await this.idleViewerBehavior(this.page); } catch {}
        this.scheduleIdleBehavior(); // reschedule
      }
    }, nextMs);
  }

  // ─── Cookie management ───────────────────────────────────────

  private async saveCookies(email: string) {
    if (!this.context) return;
    const cookies = await this.context.cookies();
    fs.writeFileSync(this.cookiesPath(email), JSON.stringify(cookies, null, 2));
    await this.log("SESSION", "Cookies saved to disk");
  }

  private async loadCookies(email: string): Promise<boolean> {
    const p = this.cookiesPath(email);
    if (!fs.existsSync(p)) return false;
    try {
      const cookies = JSON.parse(fs.readFileSync(p, "utf-8"));
      await this.context!.addCookies(cookies);
      await this.log("SESSION", "Cookies loaded from disk — attempting session restore");
      return true;
    } catch {
      return false;
    }
  }

  // ─── Session verification ────────────────────────────────────

  private async verifySession(): Promise<boolean> {
    if (!this.page) return false;
    try {
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
        await this.log("ACCOUNT", `Authenticated as @${this.account.username} (Followers: ${this.account.followersCount})`);
        return true;
      }
    } catch {}
    return false;
  }

  // ─── Login flow ──────────────────────────────────────────────

  private async performLogin(email: string, password: string): Promise<void> {
    if (!this.page) return;
    this.state = "logging_in";
    await this.log("LOGIN", `Attempting login for ${email}`);

    // Step 1: Navigate to Kick home
    await this.page.goto("https://kick.com", { waitUntil: "domcontentloaded", timeout: 30000 });
    await this.delay(2000, 4000);
    await this.naturalMouseMove(this.page);

    // Step 2: Find and click login button
    const loginSelectors = [
      'button:has-text("Sign in")',
      'button:has-text("Log in")',
      '[data-testid="login-button"]',
      'a[href*="login"]',
      'button[aria-label*="login" i]',
    ];
    let clickedLogin = false;
    for (const sel of loginSelectors) {
      try {
        const btn = await this.page.$(sel);
        if (btn) {
          await this.naturalMouseMove(this.page, 2);
          await btn.hover();
          await this.delay(300, 600);
          await btn.click();
          clickedLogin = true;
          await this.delay(1500, 2800);
          break;
        }
      } catch {}
    }
    if (!clickedLogin) {
      await this.page.goto("https://kick.com/login", { waitUntil: "domcontentloaded", timeout: 30000 });
      await this.delay(2000, 3500);
    }

    // Step 3: Fill email with human typing
    await this.naturalMouseMove(this.page, 2);
    const emailSelectors = [
      'input[name="email"]',
      'input[type="email"]',
      'input[placeholder*="mail" i]',
      'input[autocomplete="email"]',
    ];
    let typedEmail = false;
    for (const sel of emailSelectors) {
      if (await this.humanType(this.page, sel, email)) { typedEmail = true; break; }
    }
    if (!typedEmail) throw new Error("Could not locate email field on login page");

    await this.delay(700, 1400);

    // Step 4: Tab to password or click it
    await this.page.keyboard.press("Tab");
    await this.delay(300, 600);
    const passSelectors = [
      'input[name="password"]',
      'input[type="password"]',
      'input[autocomplete="current-password"]',
    ];
    let typedPass = false;
    for (const sel of passSelectors) {
      if (await this.humanType(this.page, sel, password)) { typedPass = true; break; }
    }
    if (!typedPass) throw new Error("Could not locate password field on login page");

    await this.delay(900, 1800);
    await this.naturalMouseMove(this.page, 2);

    // Step 5: Submit
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
          await btn.hover();
          await this.delay(200, 500);
          await btn.click();
          break;
        }
      } catch {}
    }

    await this.delay(3500, 6000);
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
      'input[maxlength="6"]',
      'input[maxlength="8"]',
    ];
    for (const sel of otpSelectors) {
      const el = await this.page.$(sel);
      if (el) {
        this.state = "awaiting_otp";
        this.otpRequired = true;
        await this.log("OTP", "OTP input detected — waiting for user to provide code");
        return;
      }
    }

    // Fallback: check page text
    const pageText = await this.page.evaluate(`document.body.innerText ?? ""`) as string;
    const lower = pageText.toLowerCase();
    if (
      lower.includes("verification code") ||
      lower.includes("one-time") ||
      lower.includes("otp") ||
      lower.includes("رمز التحقق") ||
      lower.includes("enter the code")
    ) {
      this.state = "awaiting_otp";
      this.otpRequired = true;
      await this.log("OTP", "OTP page detected via page text — waiting for user");
      return;
    }

    // No OTP needed
    await this.finishLogin(null);
  }

  async submitOtp(code: string): Promise<void> {
    if (this.state !== "awaiting_otp" || !this.page) return;
    await this.log("OTP", `Submitting OTP code: ${code}`);

    // Small delay before typing — simulate reading the OTP
    await this.delay(500, 1200);

    const otpSelectors = [
      'input[name="one_time_password"]',
      'input[placeholder*="code" i]',
      'input[placeholder*="OTP" i]',
      'input[autocomplete="one-time-code"]',
      '[data-testid="otp-input"]',
      'input[maxlength="6"]',
      'input[maxlength="8"]',
    ];
    for (const sel of otpSelectors) {
      if (await this.humanType(this.page, sel, code)) break;
    }

    await this.delay(600, 1200);

    const submitSels = [
      'button[type="submit"]',
      'button:has-text("Verify")',
      'button:has-text("Confirm")',
      'button:has-text("Continue")',
      'button:has-text("Submit")',
    ];
    for (const sel of submitSels) {
      try {
        const btn = await this.page.$(sel);
        if (btn) {
          await btn.hover();
          await this.delay(200, 400);
          await btn.click();
          break;
        }
      } catch {}
    }

    await this.delay(3500, 6000);
    this.otpRequired = false;
    await this.finishLogin(null);
  }

  private async finishLogin(email: string | null): Promise<void> {
    if (!this.page) return;
    this.state = "verifying";
    await this.log("LOGIN", "Verifying login session...");

    await this.page.goto("https://kick.com", { waitUntil: "domcontentloaded", timeout: 30000 });
    await this.delay(2000, 4000);
    await this.naturalMouseMove(this.page);

    const ok = await this.verifySession();
    if (ok) {
      if (email) await this.saveCookies(email);
      this.state = "monitoring";
      await this.log("LOGIN", `Login successful — @${this.account?.username} — starting channel monitor`);
      this.startMonitorLoop();
    } else {
      this.state = "error";
      this.error = "Login verification failed — check credentials and try again";
      await this.log("ERROR", this.error);
    }
  }

  // ─── Monitor loop (offline state) ───────────────────────────

  private startMonitorLoop(): void {
    const check = async () => {
      if (this.state !== "monitoring") return;
      try {
        await this.checkChannelLiveStatus();
      } catch (err: any) {
        await this.log("WARNING", `Monitor check failed: ${err?.message}`);
      }
      if (this.state === "monitoring") {
        const jitter = this.ri(-20, 30);
        this.monitorTimer = setTimeout(check, (this.intervalSeconds + jitter) * 1000);
      }
    };
    // Start first check after a short delay
    this.monitorTimer = setTimeout(check, this.ri(3000, 6000));
  }

  private async checkChannelLiveStatus(): Promise<void> {
    if (!this.page) return;

    await this.log("CHECK", `Checking if ${this.channelName} is live...`);

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

    if (data) {
      const d = data as any;
      const stream = d.livestream;
      this.channelFollowers = d.followers_count ?? null;

      if (stream) {
        this.isLive = true;
        this.viewers = stream.viewer_count ?? null;
        this.streamTitle = stream.session_title ?? null;
        this.category = stream.categories?.[0]?.name ?? null;
        this.streamStartedAt = stream.created_at ?? null;

        await this.log("LIVE_START", `🔴 ${this.channelName} LIVE! Viewers: ${this.viewers ?? "?"} | ${this.streamTitle ?? "No title"}`);
        await this.enterLiveStream();
      } else {
        this.isLive = false;
        await this.log("CHECK", `${this.channelName} is offline — will check again in ~${this.intervalSeconds}s`);
      }
    } else {
      await this.log("WARNING", `Could not reach Kick API for ${this.channelName}`);
    }
  }

  // ─── Enter live stream ───────────────────────────────────────

  private async enterLiveStream(): Promise<void> {
    if (!this.page) return;

    await this.log("LIVE_START", `Navigating to live stream: kick.com/${this.channelName}`);

    // Step 1: Navigate to channel page
    const currentUrl = this.page.url();
    if (!currentUrl.includes(`/${this.channelName}`)) {
      await this.page.goto(`https://kick.com/${this.channelName}`, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await this.delay(3000, 5000);
    }

    // Step 2: Natural entry behavior — scroll around, look at chat
    await this.naturalMouseMove(this.page, this.ri(3, 6));
    await this.delay(1500, 3000);
    await this.naturalScroll(this.page, "down", this.ri(2, 4));
    await this.delay(1000, 2000);
    await this.naturalScroll(this.page, "up", this.ri(1, 3));
    await this.delay(500, 1500);

    // Step 3: Hover over video area (simulate clicking play / engaging)
    await this.page.mouse.move(this.ri(300, 700), this.ri(150, 400), { steps: this.ri(10, 20) });
    await this.delay(800, 2000);
    await this.page.mouse.click(this.ri(300, 700), this.ri(150, 400));
    await this.delay(500, 1500);

    // Step 4: Look at chat area
    await this.page.mouse.move(this.ri(900, 1200), this.ri(200, 500), { steps: this.ri(8, 15) });
    await this.delay(1000, 2500);

    // Transition to live state
    this.state = "live";
    this.liveEnteredAt = new Date().toISOString();
    this.liveSessionCount++;

    if (this.monitorTimer) { clearTimeout(this.monitorTimer); this.monitorTimer = null; }

    await this.log("LIVE_START", `Entered live stream as @${this.account?.username} | Session #${this.liveSessionCount}`);

    // Start parallel systems
    this.startLiveMessageLoop();
    this.startQuietLiveCheck();
    this.scheduleIdleBehavior();
  }

  // ─── Live message loop ───────────────────────────────────────

  private startLiveMessageLoop(): void {
    const tick = async () => {
      if (this.state !== "live") return;
      try {
        await this.sendChatMessage();
      } catch (err: any) {
        await this.log("WARNING", `Message send failed: ${err?.message}`);
      }
      if (this.state === "live") {
        const jitter = this.ri(-30, 45);
        this.liveTimer = setTimeout(tick, (this.intervalSeconds + jitter) * 1000);
      }
    };
    // First message after a short warm-up delay (looks natural)
    const warmup = this.ri(15, 45) * 1000;
    this.liveTimer = setTimeout(tick, warmup);
  }

  // ─── Quiet live check (no navigation) ───────────────────────

  private startQuietLiveCheck(): void {
    // Check every 2 minutes via API without changing page
    const checkInterval = 120 * 1000;

    const check = async () => {
      if (this.state !== "live") return;
      try {
        const stillLive = await this.quietCheckStillLive();
        if (!stillLive) {
          await this.log("LIVE_END", `${this.channelName} stream ended — returning to monitor mode`);
          this.isLive = false;
          this.liveEnteredAt = null;
          this.viewers = null;
          this.streamTitle = null;
          this.category = null;
          this.streamStartedAt = null;
          this.state = "monitoring";

          // Clear live timers
          if (this.liveTimer) { clearTimeout(this.liveTimer); this.liveTimer = null; }
          if (this.idleBehaviorTimer) { clearTimeout(this.idleBehaviorTimer); this.idleBehaviorTimer = null; }

          // Navigate away from channel (looks natural)
          if (this.page) {
            await this.delay(this.ri(5, 20) * 1000, this.ri(20, 40) * 1000);
            try {
              await this.page.goto("https://kick.com", { waitUntil: "domcontentloaded", timeout: 15000 });
              await this.naturalMouseMove(this.page, 3);
            } catch {}
          }

          // Restart monitor loop
          this.startMonitorLoop();
          return;
        } else {
          // Update viewers
          this.quietCheckTimer = setTimeout(check, checkInterval);
        }
      } catch {
        this.quietCheckTimer = setTimeout(check, checkInterval);
      }
    };

    this.quietCheckTimer = setTimeout(check, checkInterval);
  }

  private async quietCheckStillLive(): Promise<boolean> {
    if (!this.page) return false;
    try {
      const data = await this.page.evaluate(async (slug: string) => {
        try {
          const r = await fetch(`https://kick.com/api/v2/channels/${slug}`, {
            headers: { Accept: "application/json" },
            credentials: "include",
          });
          if (!r.ok) return null;
          return await r.json();
        } catch { return null; }
      }, this.channelName);

      if (!data) return true; // assume live if API failed (don't abort)
      const d = data as any;
      if (d.livestream) {
        this.viewers = d.livestream.viewer_count ?? this.viewers;
        return true;
      }
      return false;
    } catch {
      return true;
    }
  }

  // ─── Send chat message ───────────────────────────────────────

  private async sendChatMessage(): Promise<void> {
    if (!this.page) return;

    const msgs = await db.select().from(messagesTable);
    if (!msgs.length) {
      await this.log("INFO", "No messages configured — add messages in the Messages tab");
      return;
    }

    const msg = msgs[this.ri(0, msgs.length - 1)];

    // Make sure we are on the channel page
    const currentUrl = this.page.url();
    if (!currentUrl.includes(this.channelName)) {
      await this.log("INFO", "Navigating back to channel page...");
      await this.page.goto(`https://kick.com/${this.channelName}`, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await this.delay(3000, 5000);
      await this.naturalMouseMove(this.page, 3);
    }

    // Pre-send idle behavior
    await this.delay(800, 2500);
    await this.naturalMouseMove(this.page, 2);

    // Find chat input — try multiple selectors
    const chatSelectors = [
      '[data-testid="chat-input"]',
      'div[contenteditable="true"][class*="chat"]',
      'div[contenteditable="true"][aria-label*="chat" i]',
      'div[contenteditable="true"]',
      'textarea[placeholder*="Send" i]',
      'textarea[placeholder*="chat" i]',
      'input[placeholder*="Send" i]',
    ];

    let sent = false;
    for (const sel of chatSelectors) {
      const el = await this.page.$(sel);
      if (!el) continue;
      try {
        // Move mouse to chat area naturally
        const box = await el.boundingBox();
        if (box) {
          await this.page.mouse.move(
            box.x + this.rf(10, box.width - 10),
            box.y + this.rf(5, box.height - 5),
            { steps: this.ri(8, 18) }
          );
          await this.delay(200, 500);
        }
        await el.click();
        await this.delay(400, 900);

        // Type with human speed, character by character
        for (const char of msg.text) {
          await this.page.keyboard.type(char, { delay: this.ri(55, 145) });
          if (Math.random() < 0.03) await this.delay(200, 500); // thinking pause
        }

        await this.delay(350, 900);
        await this.page.keyboard.press("Enter");
        sent = true;
        break;
      } catch {}
    }

    if (sent) {
      this.messagesSent++;
      await this.log("MESSAGE_SENT", `"${msg.text}" → ${this.channelName}`);
      // Post-send natural behavior
      await this.delay(600, 1800);
      await this.naturalMouseMove(this.page, 2);
    } else {
      await this.log("WARNING", "Chat input not found — may need login or page reload");
    }
  }

  // ─── Public API ──────────────────────────────────────────────

  async start(config: BotConfig): Promise<void> {
    if (this.state !== "idle" && this.state !== "stopped" && this.state !== "error") return;

    // Reset state
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
    this.category = null;
    this.channelFollowers = null;
    this.liveEnteredAt = null;
    this.liveSessionCount = 0;
    this.streamStartedAt = null;

    await this.log("BOT_START", `Launching bot for channel: ${config.channelName} | Interval: ${config.intervalSeconds}s`);

    try {
      this.browser = await this.launchBrowser();
      this.context = await this.buildContext(this.browser);
      this.page = await this.context.newPage();

      // Try to restore session from cookies first
      const hadCookies = await this.loadCookies(config.email);
      if (hadCookies) {
        await this.page.goto("https://kick.com", { waitUntil: "domcontentloaded", timeout: 30000 });
        await this.delay(2500, 5000);
        await this.naturalMouseMove(this.page);
        const valid = await this.verifySession();
        if (valid) {
          await this.log("SESSION", `Session restored for @${(this.account as AccountInfo | null)?.username} — no login needed`);
          await this.saveCookies(config.email); // refresh cookies
          this.state = "monitoring";
          this.startMonitorLoop();
          return;
        }
        await this.log("SESSION", "Saved session expired — performing fresh login");
      }

      // Fresh login flow
      await this.performLogin(config.email, config.password);
      if ((this.state as BotState) === "monitoring") {
        await this.saveCookies(config.email);
      }
    } catch (err: any) {
      this.state = "error";
      this.error = err?.message ?? String(err);
      await this.log("ERROR", this.error ?? "Unknown error during start");
      await this.cleanupBrowser();
    }
  }

  async stop(): Promise<void> {
    // Clear all timers
    if (this.monitorTimer) { clearTimeout(this.monitorTimer); this.monitorTimer = null; }
    if (this.liveTimer) { clearTimeout(this.liveTimer); this.liveTimer = null; }
    if (this.quietCheckTimer) { clearTimeout(this.quietCheckTimer); this.quietCheckTimer = null; }
    if (this.idleBehaviorTimer) { clearTimeout(this.idleBehaviorTimer); this.idleBehaviorTimer = null; }

    this.state = "stopped";
    this.isLive = false;
    this.otpRequired = false;
    this.liveEnteredAt = null;

    await this.log("BOT_STOP", `Bot stopped | Messages sent: ${this.messagesSent} | Sessions: ${this.liveSessionCount}`);
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
