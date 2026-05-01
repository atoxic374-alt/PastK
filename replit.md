# Kick Bot Control Panel

## Overview

لوحة تحكم محلية لبوت Kick.com — يراقب قناة ويرسل رسائل تلقائية أثناء البث المباشر.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Frontend**: React + Vite (artifacts/kick-bot)
- **Backend**: Express 5 + Playwright (artifacts/api-server)
- **Database**: PostgreSQL + Drizzle ORM
- **Browser automation**: Playwright + stealth techniques
- **API codegen**: Orval (from OpenAPI spec)

## Key Features

- تسجيل دخول حقيقي بالإيميل وكلمة المرور
- حفظ الكوكيز محلياً لاستعادة الجلسة
- طبقات حماية: WebDriver spoofing، عشوائية وكيل المستخدم، كتابة إنسانية
- مراقبة حالة البث (مباشر/أوفلاين)
- إرسال رسائل عشوائية من القائمة بفترات متغيرة
- سجل أحداث مباشر

## Architecture

- `artifacts/kick-bot/` — React Vite frontend (preview path: `/`)
- `artifacts/api-server/` — Express backend مع Playwright bot engine
- `lib/db/` — Drizzle schema (messages, bot_logs)
- `lib/api-spec/openapi.yaml` — OpenAPI contract
- `artifacts/api-server/data/cookies/` — جلسات مخزّنة

## Key Commands

- `pnpm run typecheck` — full typecheck
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks
- `pnpm --filter @workspace/db run push` — push DB schema changes
