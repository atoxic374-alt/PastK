import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { db } from "@workspace/db";
import { botLogsTable, messagesTable } from "@workspace/db";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COOKIES_DIR = path.join(__dirname, "..", "..", "data", "cookies");

export interface BotConfig {
  channelName: string;
  email: string;
  password: string;
  intervalSeconds: number;
}

export interface BotStatusData {
  running: boolean;
  channelName?: string;
  isLive: boolean;
  messagesSent: number;
  intervalSeconds: number;
  startedAt?: string | null;
}

class KickBotEngine {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private running = false;
  private isLive = false;
  private messagesSent = 0;
  private channelName = "";
  private intervalSeconds = 300;
  private startedAt: string | null = null;
  private messageLoop: ReturnType<typeof setTimeout> | null = null;
  private checkLoop: ReturnType<typeof setTimeout> | null = null;

  getStatus(): BotStatusData {
    return {
      running: this.running,
      channelName: this.channelName,
      isLive: this.isLive,
      messagesSent: this.messagesSent,
      intervalSeconds: this.intervalSeconds,
      startedAt: this.startedAt,
    };
  }

  private cookiesPath(email: string): string {
    fs.mkdirSync(COOKIES_DIR, { recursive: true });
    const safe = email.replace(/[^a-zA-Z0-9]/g, "_");
    return path.join(COOKIES_DIR, `${safe}.json`);
  }

  private async log(event: string, message?: string) {
    try {
      await db.insert(botLogsTable).values({ event, message: message ?? null });
    } catch {
    }
  }

  private randomInt(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private async randomDelay(min = 500, max = 1500) {
    await new Promise((r) => setTimeout(r, this.randomInt(min, max)));
  }

  private async simulateHumanTyping(page: Page, selector: string, text: string) {
    await page.click(selector);
    await this.randomDelay(300, 700);
    for (const char of text) {
      await page.type(selector, char, { delay: this.randomInt(60, 180) });
    }
  }

  private async launch(): Promise<Browser> {
    const args = [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
      "--disable-web-security",
      "--disable-features=IsolateOrigins,site-per-process",
      "--lang=ar-SA,ar",
      `--window-size=${this.randomInt(1280, 1440)},${this.randomInt(800, 900)}`,
    ];

    return await chromium.launch({
      headless: true,
      args,
    });
  }

  private async createStealthContext(browser: Browser): Promise<BrowserContext> {
    const userAgents = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    ];

    const ctx = await browser.newContext({
      userAgent: userAgents[this.randomInt(0, userAgents.length - 1)],
      viewport: { width: this.randomInt(1280, 1440), height: this.randomInt(800, 900) },
      locale: "ar-SA",
      timezoneId: "Asia/Riyadh",
      permissions: ["geolocation"],
      extraHTTPHeaders: {
        "Accept-Language": "ar-SA,ar;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
      },
      javaScriptEnabled: true,
      bypassCSP: false,
      ignoreHTTPSErrors: false,
    });

    await ctx.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, "languages", { get: () => ["ar-SA", "ar", "en-US"] });
      (window as any).chrome = { runtime: {} };
      const origQuery = window.navigator.permissions.query;
      (window.navigator.permissions as any).query = (parameters: PermissionDescriptor) =>
        parameters.name === "notifications"
          ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
          : origQuery(parameters);
    });

    return ctx;
  }

  async start(config: BotConfig) {
    if (this.running) return;
    this.running = true;
    this.channelName = config.channelName;
    this.intervalSeconds = config.intervalSeconds;
    this.startedAt = new Date().toISOString();
    this.messagesSent = 0;
    this.isLive = false;

    await this.log("BOT_START", `Starting bot for channel: ${config.channelName}`);

    try {
      this.browser = await this.launch();
      this.context = await this.createStealthContext(this.browser);
      this.page = await this.context.newPage();

      const cookiesFile = this.cookiesPath(config.email);
      let loggedIn = false;

      if (fs.existsSync(cookiesFile)) {
        await this.log("SESSION", "Found saved session, loading cookies...");
        const cookies = JSON.parse(fs.readFileSync(cookiesFile, "utf-8"));
        await this.context.addCookies(cookies);

        await this.page.goto("https://kick.com", { waitUntil: "domcontentloaded", timeout: 30000 });
        await this.randomDelay(2000, 4000);

        const isAuth = await this.page.evaluate(() => {
          return document.cookie.includes("kick_session") || !!document.querySelector('[data-testid="user-menu"]') || !!document.querySelector(".user-avatar");
        });

        if (isAuth) {
          loggedIn = true;
          await this.log("SESSION", "Session restored successfully");
        } else {
          await this.log("SESSION", "Session expired, logging in again...");
        }
      }

      if (!loggedIn) {
        await this.login(config.email, config.password);
        const newCookies = await this.context.cookies();
        fs.writeFileSync(cookiesFile, JSON.stringify(newCookies, null, 2));
        await this.log("SESSION", "New session saved to cookies");
      }

      this.startChannelMonitoring(config);
    } catch (err: any) {
      await this.log("ERROR", err?.message ?? String(err));
      await this.stop();
    }
  }

  private async login(email: string, password: string) {
    if (!this.page) return;
    await this.log("LOGIN", `Logging in as ${email}`);

    await this.page.goto("https://kick.com", { waitUntil: "domcontentloaded", timeout: 30000 });
    await this.randomDelay(2000, 3500);

    const loginBtn = await this.page.$('button[data-testid="login-button"], a[href*="login"], button:has-text("Log in"), button:has-text("Sign in")');
    if (loginBtn) {
      await loginBtn.click();
      await this.randomDelay(1000, 2000);
    } else {
      await this.page.goto("https://kick.com/login", { waitUntil: "domcontentloaded", timeout: 30000 });
      await this.randomDelay(1500, 3000);
    }

    const emailSelectors = ['input[type="email"]', 'input[name="email"]', 'input[placeholder*="mail"]', 'input[autocomplete="email"]'];
    let emailField: any = null;
    for (const sel of emailSelectors) {
      emailField = await this.page.$(sel);
      if (emailField) break;
    }
    if (emailField) {
      await this.simulateHumanTyping(this.page, emailSelectors.find(async (s) => await this.page!.$(s))! || emailSelectors[0], email);
    }

    await this.randomDelay(500, 1000);

    const passSelectors = ['input[type="password"]', 'input[name="password"]'];
    for (const sel of passSelectors) {
      const passField = await this.page.$(sel);
      if (passField) {
        await this.simulateHumanTyping(this.page, sel, password);
        break;
      }
    }

    await this.randomDelay(500, 1200);

    const submitSelectors = ['button[type="submit"]', 'button:has-text("Log in")', 'button:has-text("Sign in")', 'button:has-text("Continue")'];
    for (const sel of submitSelectors) {
      const btn = await this.page.$(sel);
      if (btn) {
        await btn.click();
        break;
      }
    }

    await this.page.waitForTimeout(5000);
    await this.log("LOGIN", "Login submitted, waiting for session...");
  }

  private startChannelMonitoring(config: BotConfig) {
    const check = async () => {
      if (!this.running || !this.page) return;
      try {
        await this.checkIfLive();
        if (this.isLive) {
          await this.sendScheduledMessage();
        }
      } catch (err: any) {
        await this.log("ERROR", err?.message ?? String(err));
      }
      if (this.running) {
        const jitter = this.randomInt(-30, 30);
        const delay = (this.intervalSeconds + jitter) * 1000;
        this.checkLoop = setTimeout(check, delay);
      }
    };

    check();
  }

  private async checkIfLive() {
    if (!this.page) return;
    const url = `https://kick.com/${this.channelName}`;
    const current = this.page.url();

    if (!current.includes(this.channelName)) {
      await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await this.randomDelay(2000, 4000);
    }

    const wasLive = this.isLive;
    this.isLive = await this.page.evaluate(() => {
      const indicators = [
        document.querySelector(".live-badge"),
        document.querySelector('[class*="live"]'),
        document.querySelector('[data-testid*="live"]'),
        document.querySelector(".status-badge"),
        document.querySelector('[class*="LIVE"]'),
      ];
      return indicators.some((el) => el !== null);
    });

    if (this.isLive && !wasLive) {
      await this.log("LIVE_START", `Channel ${this.channelName} went live!`);
    } else if (!this.isLive && wasLive) {
      await this.log("LIVE_END", `Channel ${this.channelName} went offline`);
    } else if (!this.isLive) {
      await this.log("CHECK", `Channel ${this.channelName} is offline`);
    }
  }

  private async sendScheduledMessage() {
    if (!this.page) return;

    const msgs = await db.select().from(messagesTable);
    if (msgs.length === 0) {
      await this.log("INFO", "No messages to send");
      return;
    }

    const msg = msgs[this.randomInt(0, msgs.length - 1)];

    try {
      const chatInputSelectors = [
        '[data-testid="chat-input"]',
        'div[contenteditable="true"]',
        'textarea[placeholder*="chat"]',
        'input[placeholder*="chat"]',
        'div[role="textbox"]',
      ];

      let sent = false;
      for (const sel of chatInputSelectors) {
        const input = await this.page.$(sel);
        if (input) {
          await input.click();
          await this.randomDelay(300, 700);
          await this.page.keyboard.type(msg.text, { delay: this.randomInt(50, 120) });
          await this.randomDelay(300, 600);
          await this.page.keyboard.press("Enter");
          sent = true;
          break;
        }
      }

      if (sent) {
        this.messagesSent++;
        await this.log("MESSAGE_SENT", `Sent: "${msg.text}"`);

        await this.page.mouse.move(this.randomInt(300, 900), this.randomInt(200, 600));
        await this.randomDelay(500, 1500);
      } else {
        await this.log("WARNING", "Could not find chat input");
      }
    } catch (err: any) {
      await this.log("ERROR", `Failed to send message: ${err?.message}`);
    }
  }

  async stop() {
    this.running = false;
    this.isLive = false;
    if (this.checkLoop) clearTimeout(this.checkLoop);
    if (this.messageLoop) clearTimeout(this.messageLoop);
    try { await this.page?.close(); } catch {}
    try { await this.context?.close(); } catch {}
    try { await this.browser?.close(); } catch {}
    this.page = null;
    this.context = null;
    this.browser = null;
    await this.log("BOT_STOP", "Bot stopped");
  }
}

export const botEngine = new KickBotEngine();
