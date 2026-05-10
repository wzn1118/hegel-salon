# GitHub Release Guide

## What Is Included

- Web frontend and Node backend.
- User login, email verification, per-user API configuration, upload handling, training, memory, and admin tooling.
- German and English Hegel corpus files under `data/corpus/texts`.
- Docker, Docker Compose, and Render Blueprint deployment files.

## What Is Deliberately Excluded

- Runtime SQLite databases.
- User sessions and login records.
- API keys and SMTP passwords.
- Uploaded files.
- Browser profiles.
- Licensed Chinese translations, PDFs, ebooks, and OCR exports.

These exclusions protect users and keep the public repository redistributable.
Operators who own rights to additional texts can mount them privately through
`local-resources/` or a private `data/corpus/chinese` volume.

## One-Command Local Deployment

```bash
docker compose up -d --build
```

Open:

```text
http://127.0.0.1:3087/
```

For production, replace `HEGEL_API_CONFIG_MASTER_KEY` in `docker-compose.yml`
with a long random secret before running.

## Render Deployment

Use the Render button in `README.md`, or connect the GitHub repository manually
and use `render.yaml`.

Required production settings:

```text
HEGEL_PUBLIC_BASE_URL=https://your-domain.example
HEGEL_ALLOWED_ORIGINS=https://your-domain.example
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

Render persistent disk is enabled in the blueprint so user data survives restarts
and redeploys.

## Corpus Behavior

On first run, `src/hegelCorpus.mjs` reads `data/corpus/texts` and creates:

```text
data/corpus/generated/manifest.json
data/corpus/generated/chunks.json
```

Those files are generated runtime artifacts and are ignored by Git.

## Private Corpus Import Pattern

For materials you are allowed to process but should not redistribute:

```text
local-resources/
data/corpus/chinese/
```

Mount those folders as private volumes on your own server. Do not commit them to
the public repository.

