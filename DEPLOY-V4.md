# Hegel Salon V4 Deployment

## What V4 adds

V4 turns the local-first salon into a multi-user web deployment with:

- account + password login
- email verification code on registration
- per-user runtime isolation for uploads, chat logs, optimizer state, and computer-use state
- optional native HTTPS startup in Node

## Runtime model

When auth mode is enabled, the server stops behaving like an open local tool and starts behaving like a session app.

Per-user state is written under:

```text
data/users/<user-id>/
```

Each user gets separate:

- `uploads/`
- `logs/chat-history.jsonl`
- `logs/optimizer-progress.json`
- `logs/optimizer-playbook.json`
- `logs/optimizer-judge-prompt.txt`
- `computer/state.json`
- `computer/worker.pid`

## 1. Enable public auth mode

Set:

```text
HEGEL_ENABLE_AUTH=1
```

When auth mode is on:

- `/api/chat` requires login
- training endpoints require login
- computer-use endpoints require login
- admin endpoints require an `admin` role
- project API config editing is locked from the browser UI

## 2. Bootstrap an administrator

Recommended environment variables:

```text
HEGEL_ADMIN_ACCOUNT=adminroot
HEGEL_ADMIN_EMAIL=admin@example.com
HEGEL_ADMIN_PASSWORD=CHANGE_THIS_PASSWORD
```

You can also promote existing users by account or email:

```text
HEGEL_ADMIN_ACCOUNTS=alice,bob
HEGEL_ADMIN_EMAILS=owner@example.com
```

## 3. Configure model access

Recommended:

```text
config/api.local.json
```

Example:

```json
{
  "provider": "openai",
  "model": "gpt-5.4",
  "baseURL": "https://api.openai.com/v1",
  "apiKey": "YOUR_SERVER_SIDE_KEY"
}
```

For a public deployment, keep this server-side. Do not let end users overwrite it.

## 4. Configure email delivery

Recommended:

```text
config/mail.local.json
```

Example:

```json
{
  "mode": "smtp",
  "host": "smtp.example.com",
  "port": 465,
  "secure": true,
  "user": "mailer@example.com",
  "pass": "YOUR_SMTP_PASSWORD",
  "from": "Hegel Salon <no-reply@example.com>"
}
```

The checked-in `config/mail.json` is only a placeholder.

If SMTP is not configured, the app falls back to `console` mode for local testing and returns a development verification code in the API response.

For a public deployment, set real SMTP and avoid exposing development codes. If needed, you can force-hide them with:

```text
HEGEL_HIDE_DEV_CODES=1
```

## 5. HTTPS options

### Option A: direct HTTPS in Node

Set:

```text
HEGEL_TLS_KEY_PATH=/path/to/privkey.pem
HEGEL_TLS_CERT_PATH=/path/to/fullchain.pem
PORT=443
HEGEL_ENABLE_AUTH=1
```

Then start:

```bash
npm run start
```

### Option B: reverse proxy HTTPS

Run Hegel Salon on an internal port such as `3088`, then terminate TLS in Caddy or Nginx.

Recommended extra setting behind a proxy:

```text
HEGEL_FORCE_SECURE_COOKIES=1
HEGEL_ENABLE_AUTH=1
PORT=<origin-port>
```

Example Caddy:

```caddy
your-domain.com {
  reverse_proxy 127.0.0.1:<origin-port>
}
```

## 6. Start

Windows example:

```powershell
$env:HEGEL_ENABLE_AUTH='1'
$env:PORT='<origin-port>'
node src/server.mjs
```

HTTPS direct example:

```powershell
$env:HEGEL_ENABLE_AUTH='1'
$env:PORT='443'
$env:HEGEL_TLS_KEY_PATH='C:\certs\privkey.pem'
$env:HEGEL_TLS_CERT_PATH='C:\certs\fullchain.pem'
node src/server.mjs
```

## 7. Security notes

- Use HTTPS in production.
- Keep API keys only on the server.
- Keep SMTP credentials only on the server.
- The browser config panel is intentionally locked in auth mode.
- The admin panel is visible only to `admin` users.
- Session cookies are `HttpOnly`, `SameSite=Strict`, and high priority.
- State-changing requests are protected with a CSRF token header.
- Suspicious non-browser clients are blocked on authenticated and sensitive endpoints unless they come from a trusted internal loopback path.
- Login / register / send-code endpoints are rate limited in-memory, and chat/history/admin paths also have abuse throttling.
- Authenticated users keep their own per-user history memory by default. If you need to disable that, set `HEGEL_PERSIST_USER_CONTENT=0`.
- Uploaded files are deleted after local extraction by default unless `HEGEL_RETAIN_UPLOADS=1`.
- If you deploy behind a proxy, set `HEGEL_FORCE_SECURE_COOKIES=1`.

## 8. What to test after deploy

1. Register a new account and confirm the verification email arrives.
2. Log in from two different accounts and confirm training prompt values do not match across users.
3. Upload a file in one account and confirm another account cannot see the resulting state.
4. Log in as admin and confirm the admin panel can list users, revoke sessions, and clear user runtime data.
5. Confirm `/api/config` is blocked from the browser UI in auth mode.
6. Confirm the site is reachable through `https://`.
