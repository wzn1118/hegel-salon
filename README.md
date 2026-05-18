# Hegel Salon

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/wzn1118/hegel-salon)

**Hegel Salon is a Chinese-first Hegelian reasoning workspace that combines primary-text grounding, quote discipline, real-world judgment, document understanding, browser-scoped computer use, and a live optimization loop in one runnable product.**

Hegel Salon 不是一个只模仿黑格尔语气的聊天壳。它更像一个思想工作台：把黑格尔语料、概念结构、引文核验、现实判断、附件处理、浏览器代理、用户系统和持续优化机制放进同一个本地优先的 Web 应用里。

## What Is Included

- A static Web frontend served by a Node.js backend.
- Chinese-first Hegelian dialogue with corpus-aware prompt assembly.
- Local German/English public-domain or openly mirrored Hegel corpus under `data/corpus/texts`.
- Concept graph, source anchors, quote validation, self-audit, and historical-reference modules.
- Attachment understanding for PDF, spreadsheets, CSV/TSV, text, JSON, Markdown, and images.
- Browser-scoped computer use for navigation, clicking, typing, scrolling, and screenshot-backed page inspection.
- Multi-user auth mode with login, email verification, admin tooling, CSRF protection, and per-user runtime isolation.
- Per-user API configuration support for model provider, base URL, model, and API key.
- Evaluation and optimization scripts for understanding, formal logic, historiography, concept graph smoke checks, and quality optimization.
- Docker, Docker Compose, Render Blueprint, Cloudflare tunnel docs, and Windows launcher scripts.
- Optional Android shell based on Capacitor for a native mobile entry point.

## Current Status

This repository is a working product prototype, not a finished academic oracle.

It can run locally, serve the Web app, process files, call model APIs, preserve user-scoped state, drive a browser session, and run evaluation or optimization loops. The strict logic, historiography, real-world judgment, and 90-point quality optimization layers are still experimental signals. High-risk or scholarly conclusions should still be reviewed by a human.

## Quick Start

```bash
npm install
npm run start
```

Open:

```text
http://127.0.0.1:3087/
```

Docker:

```bash
docker compose up -d --build
```

## Public Deployment

For a public HTTPS deployment, set production environment variables before first run:

```text
HEGEL_ENABLE_AUTH=1
HEGEL_PUBLIC_BASE_URL=https://your-domain.example
HEGEL_ALLOWED_ORIGINS=https://your-domain.example
HEGEL_API_CONFIG_MASTER_KEY=<long-random-secret>
HEGEL_ADMIN_ACCOUNT=<admin-login>
HEGEL_ADMIN_EMAIL=<admin-email>
HEGEL_ADMIN_PASSWORD=<admin-password>
HEGEL_SMTP_HOST=<smtp-host>
HEGEL_SMTP_PORT=<smtp-port>
HEGEL_SMTP_SECURE=<true-or-false>
HEGEL_SMTP_USER=<smtp-user>
HEGEL_SMTP_PASS=<smtp-password-or-app-password>
HEGEL_MAIL_FROM=Hegel Salon <no-reply@your-domain.example>
```

For Render deployment, use the button above or connect the repository with `render.yaml`.
For Windows + Cloudflare Named Tunnel deployment, see `docs/PUBLIC_WEB_DEPLOYMENT.md`.
For auth, HTTPS, and security details, see `DEPLOY-V4.md` and `docs/SECURITY_DEPLOYMENT.md`.

## Model Configuration

The public repository intentionally does not ship live API keys.

For local development, create:

```text
config/api.local.json
```

Example:

```json
{
  "provider": "openai",
  "model": "gpt-5.4",
  "baseURL": "https://api.openai.com/v1",
  "apiKey": "YOUR_KEY"
}
```

When auth mode is enabled, users can keep model configuration in their own isolated runtime scope unless the deployment locks configuration server-side.

## Project Map

```text
.
|-- public/                  Web UI, styles, browser-use panel, admin UI
|-- src/                     Node server, answer pipeline, corpus, auth, tools, evaluation, optimizer
|-- config/                  Public-safe config templates and local override location
|-- data/corpus/texts/       Redistributable German/English Hegel corpus files
|-- docs/                    GitHub release, public web deployment, and security deployment notes
|-- deploy/                  Cloudflare tunnel and deployment helpers
|-- android-app/             Optional Capacitor Android shell
|-- launch-hegel-salon.cmd   Windows local launcher
|-- start-hegel-salon.cmd    Windows start helper
`-- stop-hegel-salon.cmd     Windows stop helper
```

## Main Runtime Flow

```text
Browser UI
  -> /api/chat
  -> prompt assembly
  -> corpus retrieval
  -> source and quote discipline
  -> historical-reference injection
  -> optional judges / self-audit / revision
  -> final answer

Browser UI
  -> /api/computer/*
  -> controlled browser worker
  -> page actions, screenshots, and action transcript

Optimizer
  -> /api/chat
  -> failure collection
  -> playbook synthesis
  -> optimizer memory
  -> future answer guidance
```

## Important Modules

- `src/server.mjs` is the orchestration core for HTTP routes, chat, attachments, auth-aware runtime state, training, and admin flows.
- `src/hegelPrompt.mjs` defines the Hegelian persona, argument form, source discipline, and judgment constraints.
- `src/hegelCorpus.mjs`, `src/hegelContext.mjs`, and `src/hegelParallel.mjs` build source-aware context from the local corpus.
- `src/hegelConceptGraph.mjs`, `src/hegelDialectic.mjs`, and `src/hegelModeRouter.mjs` add concept structure and mode routing.
- `src/hegelQuoteValidation.mjs` separates quote-ready wording from interpretation.
- `src/hegelHistorical.mjs` strengthens present-day judgment with historical reference patterns.
- `src/browserComputer.mjs` and `src/browserComputerWorker.mjs` power browser-scoped computer use.
- `src/auth.mjs` and `src/userDatabase.mjs` provide user accounts, sessions, admin tools, and per-user state.
- `src/runQualityOptimizer.mjs` and `src/optimizerMemory.mjs` run the current memory-and-playbook optimization loop.

## Useful Scripts

```bash
npm run start
npm run eval:understanding:smoke
npm run eval:understanding:full
npm run eval:formal-stress
npm run eval:historical-stress
npm run smoke:concept-graph
npm run validate:hegel-graph
npm run optimize:90
```

## Data And Privacy Boundaries

This public release is designed to be redistributable. It should include source code, public docs, frontend assets, deployment templates, training examples, and allowed corpus material.

It should not include:

- API keys or SMTP credentials.
- Runtime SQLite databases.
- User sessions, auth records, uploads, or private chat logs.
- Browser profiles or browser-agent state.
- Licensed Chinese translations, private PDFs, ebooks, OCR exports, or local-only research bundles.

Private material should be mounted after cloning through `local-resources/`, private `data/` volumes, or deployment-specific secrets. Do not commit those materials to the public repository.

## Android App

The `android-app/` folder contains a Capacitor-based Android shell. Its role is to provide a native mobile entry point with endpoint configuration and WebView delivery. It is currently an adjunct client layer, not a separate backend.

## Roadmap

- Make the optimizer progress and playbook loop more stable and observable.
- Expand concrete historical case libraries for real-world judgment.
- Improve strict-logic and historiography scoring reliability.
- Surface quote/source confidence more visibly in the UI.
- Harden public deployment defaults and admin operations.
- Package the Android client for a cleaner release flow.

## Recommended GitHub Description

```text
Chinese-first Hegelian reasoning workspace with primary-text grounding, quote validation, document understanding, browser agency, multi-user auth, and optimization memory.
```

## Disclaimer

Hegel Salon tries to improve source discipline, logic discipline, and historical judgment, but it does not guarantee academic correctness. Treat the system as a research-oriented reasoning workspace and review important outputs carefully.
