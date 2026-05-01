# Kick Bot Control Panel

## Overview

لوحة تحكم محلية لبوت Kick.com — يراقب قناة ويدخل اللايف تلقائياً ويرسل رسائل مع محاكاة إنسانية كاملة.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Frontend**: React + Vite (artifacts/kick-bot, preview: /)
- **Backend**: Express 5 + Playwright (artifacts/api-server, preview: /api)
- **Database**: PostgreSQL + Drizzle ORM
- **Browser automation**: Playwright + stealth techniques
- **API codegen**: Orval (from OpenAPI spec in lib/api-spec/openapi.yaml)

## Bot State Machine

`idle → launching → logging_in → awaiting_otp → verifying → monitoring → live → stopped/error`

### Monitoring Loop (offline)
- يفحص API كل `intervalSeconds` ثانية (عبر `page.evaluate`)
- عند اكتشاف اللايف → `enterLiveStream()`

### Live Loop (داخل اللايف)
- يرسل رسائل كل `intervalSeconds ± 45s` عشوائي
- يفحص API بصمت كل 2 دقيقة (`quietCheckStillLive`) بدون navigation
- يحاكي سلوك مشاهد طبيعي بين الرسائل (`idleViewerBehavior`)
- عند انتهاء اللايف → يعود لـ monitoring تلقائياً

## Key Features

- تسجيل دخول حقيقي بالإيميل/كلمة المرور عبر Playwright
- OTP modal مع auto-focus عند الطلب
- حفظ/استعادة cookies محلياً
- دخول اللايف: navigation + scroll طبيعي + hover على الفيديو
- إرسال رسائل مع كتابة إنسانية حرفاً بحرف مع أخطاء عشوائية
- مراقبة صامتة أثناء اللايف (لا navigation لتجنب الكشف)
- إحصاءات: وقت في اللايف، عدد الجلسات، المشاهدون
- بحث القنوات عبر متصفح البوت (Cloudflare bypass)
- آخر بثوث القناة (recent streams)
- أيقونات SVG متحركة بدل Unicode

## Stealth Layers

- WebDriver property masking
- Navigator plugins spoof (3 real plugins)
- Languages/timezone/hardware spoof
- chrome.runtime/loadTimes/csi spoof
- Human typing (typos + backspace simulation)
- Mouse trajectory simulation
- ±45s jitter on message intervals
- Idle viewer behaviors (scroll chat, hover video)
- Quiet API check (no page navigation while in live)
- Sequential human-like page navigation

## Architecture

- `artifacts/kick-bot/` — React Vite frontend (preview: /)
- `artifacts/api-server/` — Express backend with Playwright bot engine
- `artifacts/api-server/src/lib/bot-engine.ts` — core bot engine
- `artifacts/api-server/src/routes/bot.ts` — API routes
- `lib/db/` — Drizzle schema (messages, bot_logs tables)
- `lib/api-spec/openapi.yaml` — OpenAPI contract (v0.3.0)
- `lib/api-client-react/` — generated React Query hooks
- `lib/api-zod/` — generated Zod validators
- `artifacts/api-server/data/cookies/` — saved sessions

## Key Commands

- `pnpm run typecheck` — full typecheck (builds libs first)
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks from spec
- `pnpm --filter @workspace/db run push` — push DB schema changes

## API Notes

- Kick blocks server-side direct API calls (Cloudflare TLS fingerprinting)
- Solution: `botEngine.browserFetch(url)` routes through Playwright browser when active
- When bot not running → search/status return empty gracefully with `error: "start_bot_first"`
- Bot's internal monitoring always uses `page.evaluate()` — never blocked
