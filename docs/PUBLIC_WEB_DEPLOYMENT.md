# Hegel Salon Public Web Deployment

This guide turns a local Hegel Salon origin service into a public website with:

- a custom domain
- Cloudflare Named Tunnel
- HTTPS via Cloudflare
- WAF in front of the application
- continuous running on Windows

## Current Local Assumptions

- App server listens on a private origin address such as `127.0.0.1:<origin-port>`
- Auth is enabled
- `cloudflared` is available on `PATH`, or its path is exposed with `CLOUDFLARED_PATH`

## 1. Cloudflare Requirements

You need:

- a Cloudflare account
- a domain already managed by Cloudflare DNS
- permission to add DNS records for the target hostnames

Recommended hostnames:

- `app.your-domain.example`
- `admin.your-domain.example`

## 2. Set Production Environment Variables

Recommended:

```powershell
$env:PORT = "<origin-port>"
$env:HEGEL_ENABLE_AUTH = "1"
$env:HEGEL_PUBLIC_BASE_URL = "https://app.your-domain.example"
$env:HEGEL_FORCE_SECURE_COOKIES = "1"
$env:HEGEL_TRUST_PROXY = "1"
$env:HEGEL_API_CONFIG_MASTER_KEY = "replace-with-a-long-random-secret"
$env:HEGEL_ADMIN_ALLOWED_IPS = "127.0.0.1,::1,<your-vpn-or-office-ip>"
$env:HEGEL_ADMIN_REMOTE_ALLOWED = "0"
$env:HEGEL_ADMIN_2FA_DISABLED = "0"
$env:HEGEL_UPLOAD_SCAN_MODE = "required"
```

## 3. Authenticate cloudflared

Run:

```powershell
$cloudflared = if ($env:CLOUDFLARED_PATH) { $env:CLOUDFLARED_PATH } else { "cloudflared" }
& $cloudflared tunnel login
```

Cloudflare will open an authorization page in your browser. Choose the domain you want the tunnel to manage.

## 4. Create a Named Tunnel

Run:

```powershell
$cloudflared = if ($env:CLOUDFLARED_PATH) { $env:CLOUDFLARED_PATH } else { "cloudflared" }
& $cloudflared tunnel create hegel-salon
```

This prints:

- tunnel UUID
- path to the generated credentials JSON

## 5. Create the Tunnel Config

Copy:

`deploy/cloudflared/config.example.yml`

to a real config file, for example:

`deploy/cloudflared/config.yml`

Then replace:

- `REPLACE_WITH_TUNNEL_UUID`
- `credentials-file`
- `HEGEL_ORIGIN_HOST`
- `HEGEL_ORIGIN_PORT`
- `app.your-domain.example`
- `admin.your-domain.example`

## 6. Route DNS to the Tunnel

Run:

```powershell
$cloudflared = if ($env:CLOUDFLARED_PATH) { $env:CLOUDFLARED_PATH } else { "cloudflared" }
& $cloudflared tunnel route dns hegel-salon app.your-domain.example
& $cloudflared tunnel route dns hegel-salon admin.your-domain.example
```

## 7. Run the Tunnel

For foreground testing:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\cloudflared\run-named-tunnel.ps1 -ConfigPath .\deploy\cloudflared\config.yml
```

## 8. Install as Windows Service

After the foreground run works:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\cloudflared\install-windows-service.ps1 -TunnelId "<your-tunnel-uuid>" -ConfigPath .\deploy\cloudflared\config.yml
sc start cloudflared
```

## 9. Cloudflare WAF Recommendations

Enable:

- Managed WAF rules
- Bot Fight Mode or Super Bot Fight Mode
- Rate limiting for:
  - `/api/auth/login`
  - `/api/auth/register/send-code`
  - `/api/auth/password/send-code`
  - `/api/auth/admin/verify-2fa`

Recommended admin protection:

- restrict `admin.your-domain.example` with Cloudflare Access
- or restrict at DNS/WAF layer to your office/VPN IPs

## 10. TLS

Cloudflare provides HTTPS at the edge automatically once DNS is routed through Cloudflare.

Recommended SSL mode:

- `Full (strict)` if you add an origin certificate locally
- otherwise `Full` as a stepping stone, then move to `Full (strict)`

## 11. Continuous Running

You need both of these to stay up:

- the Node.js app on `3087` by default
- the `cloudflared` service

Recommended Windows strategy:

- run the Node app under NSSM, PM2, or Task Scheduler at startup
- run `cloudflared` as a Windows service

## 12. Health Check

After deployment, verify:

- `https://app.your-domain.example` opens
- `https://admin.your-domain.example/admin.html` opens
- login works
- admin 2FA works
- file upload works
- `Computer Use` is enabled only if the host still has the required browser/runtime

## 13. Important Limitation

The current `Computer Use` implementation depends on local Windows browser automation.
If you move to Linux or a minimal cloud host, you must either:

- adapt `Computer Use` for Linux browser automation
- or disable that feature in production
