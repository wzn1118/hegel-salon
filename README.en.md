# Hegel Salon

[中文 README](./README.md)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/wzn1118/hegel-salon)

Hegel Salon is a Chinese-first workspace for reading Hegel, working with philosophical questions, and testing source-aware reasoning in a real web application. It is not a chatbot that merely borrows Hegelian vocabulary, and it is not presented as an academic authority. The project is closer to a runnable research desk: a web interface for conversation and documents, a Node.js backend for corpus retrieval and answer discipline, and a set of deployment, evaluation, and optimization tools around it.

The motivation is simple. When a user asks about Hegel, a contemporary problem, a draft paragraph, or an uploaded document, the system should not answer with a fluent but ungrounded gloss. It should make a visible effort to say what comes from text, what is interpretation, what is analogy, and where human judgment is still required. Hegel Salon can run as a private local tool or as an authenticated multi-user web service. It can be used for reading, but it is also a product prototype for combining philosophical corpora, modern language models, quote discipline, browser-scoped agency, and feedback-driven answer improvement.

## What It Does

Hegel Salon brings several layers into one application:

- Chinese-first dialogue for Hegelian and philosophical questions.
- Local corpus retrieval over redistributable German and English materials in `data/corpus/texts/`.
- Quote discipline that tries to keep direct quotation separate from interpretation.
- Concept graph and historical-reference layers for moving from textual explanation to present-day judgment.
- Attachment understanding for PDF, spreadsheets, CSV/TSV, text, JSON, Markdown, and images.
- Browser-scoped Computer Use for navigation, clicking, typing, scrolling, screenshots, and action transcripts.
- Multi-user mode with login, email verification, admin tools, CSRF protection, and isolated per-user runtime state.
- Evaluation and optimization scripts that collect weak answers, score failures, synthesize playbooks, and feed that memory back into later responses.
- Windows launchers, Docker, Render Blueprint, Cloudflare Tunnel documentation, and an optional Android shell.

The word "Hegelian" here is not meant as a decorative voice style. It means the answer should carry more structure: locate the problem in conceptual relations, separate textual support from inference, explain the movement of the argument, and admit what remains uncertain. The project is still a prototype, but it is already a working application rather than a single prompt or static demo.

## Who This Is For

This repository is useful if you want:

- a Chinese-first environment for serious Hegel reading and source-aware discussion;
- a working product architecture for philosophical reasoning rather than a prompt-only experiment;
- a place to study quote validation, corpus retrieval, self-audit, failure memory, and answer revision together;
- a local AI tool that can also be deployed as a private or small-team authenticated web service.

It may feel heavy if you only want a minimal chat demo. It is also not a finished scholarly judge. The best way to treat it is as a serious but unfinished workspace: useful, inspectable, and still open to correction.

## Current Status

Hegel Salon is a working product prototype, not a completed academic system.

It currently can:

- serve the web application locally on port `3087` by default;
- handle chat, attachments, and corpus context through `/api/chat`;
- isolate uploads, chat logs, optimizer state, and browser-agent state per user when auth mode is enabled;
- provide admin tools for users and runtime data;
- call a configured model API through local or server-side configuration;
- run understanding evaluations, formal-logic stress tests, historiography stress tests, concept-graph checks, and quality optimization scripts;
- deploy through Docker, Render, or a Windows origin behind Cloudflare Tunnel.

Boundaries to keep in mind:

- quality, logic, and historiography scores are signals, not proofs of correctness;
- quote validation reduces false quotation but does not replace human collation;
- Computer Use is limited to a controlled browser scope, not full desktop control;
- public deployments still need real secret management, email delivery, HTTPS, upload scanning, and admin policy;
- the repository should not contain private chats, runtime logs, API keys, SMTP credentials, copyrighted Chinese translations, or private research material.

## Quick Start

Install dependencies:

```bash
npm install
```

Start the app:

```bash
npm run start
```

Open:

```text
http://127.0.0.1:3087/
```

On Windows, the portable launcher is:

```text
launch-hegel-salon.cmd
```

To stop the local service:

```text
stop-hegel-salon.cmd
```

Docker:

```bash
docker compose up -d --build
```

## Model Configuration

The public repository does not ship live API keys. For local development, create:

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

In local mode, the browser UI can also write API configuration. In auth mode, project-level browser editing is locked, and runtime state is scoped by user. For a public deployment, keep model credentials on the server side instead of letting end users overwrite shared configuration from the browser.

## Public Deployment

For Render, use the button above or connect the repository with `render.yaml`.

At minimum, prepare:

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

For an internet-facing deployment, also consider:

```text
HEGEL_HIDE_DEV_CODES=1
HEGEL_TRUST_PROXY=1
HEGEL_FORCE_SECURE_COOKIES=1
```

Deployment references:

- [DEPLOY-V4.md](./DEPLOY-V4.md)
- [docs/PUBLIC_WEB_DEPLOYMENT.md](./docs/PUBLIC_WEB_DEPLOYMENT.md)
- [docs/SECURITY_DEPLOYMENT.md](./docs/SECURITY_DEPLOYMENT.md)

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

`npm run optimize:90` is not model fine-tuning. It sends prompts through the current answer pipeline, collects weak responses, summarizes failure patterns into a playbook, and writes optimizer memory that later generations can read.

## Repository Map

```text
.
|-- public/                  Web UI, styles, browser-agent panel, admin entry
|-- src/                     Node server, answer pipeline, corpus, auth, tools, evaluation, optimizer
|-- config/                  Public-safe templates and local private config entry points
|-- data/corpus/texts/       Redistributable German and English Hegel corpus files
|-- docs/                    Public deployment, security deployment, and release notes
|-- deploy/                  Cloudflare Tunnel, Nginx, and deployment helpers
|-- android-app/             Optional Capacitor Android shell
|-- training/                Training and evaluation material
|-- launch-hegel-salon.cmd   Windows one-click launcher
|-- start-hegel-salon.cmd    Windows start helper
`-- stop-hegel-salon.cmd     Windows stop helper
```

Important modules:

- `src/server.mjs`: HTTP routes, chat, attachments, auth, training, admin, and runtime coordination.
- `src/hegelPrompt.mjs`: answer persona, argument form, quote discipline, and judgment boundaries.
- `src/hegelCorpus.mjs`, `src/hegelContext.mjs`, `src/hegelParallel.mjs`: corpus retrieval and source-aware context construction.
- `src/hegelQuoteValidation.mjs`: separation of quote-ready wording from interpretation.
- `src/browserComputer.mjs`, `src/browserComputerWorker.mjs`: browser-scoped Computer Use.
- `src/auth.mjs`, `src/userDatabase.mjs`: accounts, sessions, admin tools, and user isolation.
- `src/runQualityOptimizer.mjs`, `src/optimizerMemory.mjs`: optimization loop and failure memory.

## Data And Privacy Boundaries

This repository is meant to contain code, public docs, frontend assets, deployment templates, example material, and corpus files that can be redistributed. Do not commit:

- API keys, SMTP passwords, or other secrets;
- SQLite runtime databases, user sessions, auth records, uploads, or private chat logs;
- browser profiles, Computer Use state, or screenshot caches;
- copyrighted Chinese translations, private PDFs, ebooks, OCR exports, or local research bundles.

Private material should be added after cloning through `local-resources/`, private `data/` mounts, or deployment-specific secret storage.

## Android Shell

`android-app/` contains an optional Capacitor Android shell. It provides a native mobile entry point, endpoint configuration, and WebView delivery. It is not a separate backend.

## Roadmap

Near-term work worth doing:

- make optimizer progress, failure examples, and playbook changes easier to inspect and roll back;
- expand historical case libraries for present-day judgment;
- improve the stability of formal-logic and historiography scoring;
- show quote confidence and evidence boundaries more clearly in the UI;
- harden public deployment defaults around upload scanning, admin operations, and email verification;
- clean up the Android release flow.

## Recommended GitHub Description

```text
Chinese-first Hegel reading and reasoning workspace with corpus grounding, quote discipline, attachment understanding, browser agency, multi-user deployment, and optimizer memory.
```

## License And Disclaimer

See [LICENSE](./LICENSE).

Hegel Salon tries to improve source discipline, argument discipline, and historical judgment. It does not guarantee academic correctness. Review important claims, direct quotations, and paper-facing output carefully.
