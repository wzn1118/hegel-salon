# Contributing

## Scope

This repository mixes product code, corpus tooling, local cache management,
experimental evaluation, and Android packaging.

Contributions are welcome, but they should preserve three priorities:

1. Primary-text discipline
2. Product stability
3. Honest evaluation

## Before You Start

Read these files first:

- [README.md](./README.md)
- [PRODUCT.md](./PRODUCT.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)

If your change touches answer quality, also inspect:

- `src/server.mjs`
- `src/hegelPrompt.mjs`
- `src/hegelContext.mjs`
- `src/hegelHistorical.mjs`
- `src/hegelQuoteValidation.mjs`

If your change touches optimization or scoring, also inspect:

- `src/runFormalLogicStress.mjs`
- `src/runHistoriographyStress.mjs`
- `src/runQualityOptimizer.mjs`
- `src/optimizerMemory.mjs`

## Local Setup

Install dependencies:

```bash
npm install
```

Create a local API config:

```text
config/api.local.json
```

Do not commit real keys to `config/api.json`.

Start the app:

```bash
npm run start
```

Default local URL:

```text
http://127.0.0.1:3087/
```

## Contribution Principles

### 1. Do not fake grounding

If a claim is not actually supported by retrieved material, do not write code
that makes it look supported.

### 2. Do not weaken quote discipline

Never loosen the distinction between:

- checked quotation
- text-based interpretation
- model inference

### 3. Keep evaluation honest

Do not make scoring scripts look better by hiding failures, changing definitions
mid-run, or silently dropping hard prompts.

### 4. Preserve user-facing usability

If you add a new guardrail, prompt layer, or scoring pass, make sure the product
still answers in a reasonable amount of time.

### 5. Protect publishability

Do not commit:

- real API keys
- personal chat logs
- temporary probe scripts
- local optimizer artifacts
- local Android SDK/JDK bundles

Use:

- `.gitignore`
- `config/api.local.json`
- `tmp/`
- `data/logs/`

as intended.

## Pull Request Guidance

When opening a PR, include:

### What changed

Explain the user-facing effect first.

### Why it changed

Explain the failure mode, product need, or quality issue you are addressing.

### How you verified it

At minimum, say which of these you ran:

- `node --check src/server.mjs`
- `node --check` for any modified script
- manual `/api/chat` smoke test
- `npm run eval:formal-stress`
- `npm run eval:historical-stress`
- `npm run optimize:90` with a small iteration count

### Risks

Call out:

- performance regressions
- prompt brittleness
- increased latency
- new failure modes in scoring or retrieval

## Recommended Contribution Areas

Good contribution targets:

- UI polish and configurability
- corpus retrieval quality
- quote validation clarity
- historical reference quality
- latency reduction
- optimization progress visibility
- Android shell quality

High-risk areas that require extra care:

- prompt core in `src/hegelPrompt.mjs`
- final answer gating in `src/server.mjs`
- evaluation definitions in `src/runFormalLogicStress.mjs`
- historiography checks in `src/runHistoriographyStress.mjs`

## Style

- Prefer small, reviewable diffs
- Keep prose precise
- Keep code comments rare and useful
- Avoid adding “smart” abstractions with no user benefit
- If a new feature needs explanation, document it in the repo

## Release-Ready Changes

If your PR is meant for a public GitHub release, verify:

- no local keys are committed
- no logs or temporary scripts are present
- release docs are updated
- the export script still produces a clean release directory
