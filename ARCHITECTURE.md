# Architecture

## Overview

Hegel Salon is a local-first Node application with a static web frontend,
corpus-aware answer pipeline, browser-agent subsystem, evaluation scripts, and
an optional Android shell.

At a high level:

```text
Browser UI
  -> /api/chat
    -> prompt assembly
    -> corpus retrieval
    -> quote validation
    -> historical reference injection
    -> quality / logic / historiography judges
    -> final answer

Browser UI
  -> /api/computer/*
    -> browserComputer worker
    -> local Edge session
    -> screenshots + action transcript

Optimizer scripts
  -> /api/chat
    -> collect failures
    -> build playbook
    -> feed failure memory back into answer generation
```

## Major Layers

## 1. Frontend

Location:

- `public/index.html`
- `public/app.js`
- `public/styles.css`
- `public/computer-use.js`

Responsibilities:

- render the Hegel Salon interface
- manage chat history
- upload attachments
- show source panels
- expose API config UI
- drive browser-agent UI

The frontend is static and served directly by the Node server.

## 2. HTTP Server

Location:

- `src/server.mjs`

Responsibilities:

- serve static files
- accept `/api/chat`
- accept `/api/config`
- accept `/api/sources`
- accept `/api/computer/*`
- coordinate answer generation, validation, and optimizer memory writes

This file is the orchestration core of the project.

## 3. Prompt and Persona Layer

Location:

- `src/hegelPrompt.mjs`

Responsibilities:

- define the system prompt
- enforce voice, cadence, and source-discipline
- constrain present-day judgment
- constrain quote behavior

This layer should never be treated as decorative styling alone. It exists to
shape the actual argumentative form of the answer.

## 4. Corpus Retrieval Layer

Locations:

- `src/hegelCorpus.mjs`
- `src/hegelContext.mjs`
- `src/hegelParallel.mjs`
- `src/hegelChinese.mjs`
- `src/hegelConcepts.mjs`
- `src/hegelHistorical.mjs`

Responsibilities:

- retrieve relevant corpus chunks
- build concept-aware context
- align parallel citations
- surface Chinese translation layers honestly
- inject historical witnesses for contemporary questions

The output of this layer is not just “search results”; it is structured answer
context.

## 5. Quote Validation Layer

Location:

- `src/hegelQuoteValidation.mjs`

Responsibilities:

- check whether quoted wording actually appears in retrieved evidence
- separate quote-ready wording from interpretation
- strip invalid direct quotations when needed

This layer exists to prevent hallucinated quotation and source laundering.

## 6. Evaluation and Gating Layer

Locations:

- `src/server.mjs`
- `src/argumentEvalMetrics.mjs`
- `src/runFormalLogicStress.mjs`
- `src/runHistoriographyStress.mjs`

Responsibilities:

- quality scoring
- strict logic scoring
- historiography scoring
- answer revision loops
- failure collection for offline evaluation

Important:

The current system aims for high standards but is still experimental. Scores are
useful signals, not proof of perfect correctness.

## 7. Optimization Memory Layer

Locations:

- `src/optimizerMemory.mjs`
- `src/runQualityOptimizer.mjs`

Responsibilities:

- collect low-scoring or weak answers
- synthesize optimizer playbooks
- retrieve similar failure patterns
- feed those patterns back into future generations

This is the current “data-driven improvement” loop in the product.

It is not model fine-tuning in the strict training-pipeline sense. It is an
iterative memory-and-playbook system that uses model-generated summaries of
failure modes to steer future outputs.

## 8. Browser Agent Layer

Locations:

- `src/browserComputer.mjs`
- `src/browserComputerWorker.mjs`
- `public/computer-use.js`

Responsibilities:

- launch a controlled browser session
- inspect page state
- execute navigation/click/input actions
- capture screenshots and action transcript

This is browser-scoped computer use, not full desktop control.

## 9. Android Layer

Location:

- `android-app/`

Responsibilities:

- provide an Android-native entry point
- allow endpoint configuration
- open the web product inside a mobile shell

The Android app is currently an adjunct delivery layer, not an independent
backend.

## Data Directories

### `config/`

- project-level API config
- safe public placeholder in `api.json`
- local private override in `api.local.json`

### `data/corpus/`

- cached source material
- generated chunk manifests
- Chinese corpus metadata

### `data/logs/`

- chat history
- optimizer progress
- optimizer playbook
- optimizer memory

These should be treated as local runtime artifacts, not repository content.

### `tmp/`

- probe scripts
- temporary logs
- release-export scratch files

This directory is intentionally disposable.

## Request Flow

## Chat request

1. frontend submits `messages`
2. server normalizes history
3. attachments are parsed and enriched
4. corpus context is built
5. optimizer memory context is added
6. strict logic scaffold is built when enabled
7. answer is generated
8. quality, strict logic, and historiography judges run
9. revision loop runs when needed
10. final answer is returned and logged

## Optimizer run

1. optimizer script builds a prompt pool
2. prompts are sent through the lightweight optimizer route
3. scores are collected
4. failures are summarized into a playbook
5. playbook is written to `data/logs`
6. future chat generations can read the updated memory

## Publish Strategy

The repository is designed to support a sanitized GitHub release export.

The export should include:

- source code
- static frontend
- public docs
- training examples
- corpus manifests and allowed research assets

The export should exclude:

- local API secrets
- local logs
- temporary probes
- Android local SDK/JDK bundles
- uploads and runtime state

## Design Principle

The project is strongest when it remains honest about three boundaries:

1. where text is grounded
2. where inference begins
3. where optimization data is still weak

Any future architecture change should preserve those three boundaries.
