# Hegel Salon Security Deployment Guide

## Goals

This guide describes the recommended production hardening posture for Hegel Salon.

The application now supports:

- encrypted user API key storage in SQLite
- IP + account dual login rate limiting
- administrator email-based 2FA
- admin endpoint access restricted to local or whitelisted IPs
- upload type/size allowlists and optional malware scanning
- strict cookie and CSRF protections
- dedicated `security_audit_events` and `security_alerts` tables

## Recommended Environment Variables

Set these in production:

```env
PORT=3098
HEGEL_ENABLE_AUTH=1
HEGEL_PUBLIC_BASE_URL=https://your-domain.example
HEGEL_FORCE_SECURE_COOKIES=1
HEGEL_TRUST_PROXY=1
HEGEL_API_CONFIG_MASTER_KEY=replace-with-a-long-random-secret
HEGEL_ADMIN_ALLOWED_IPS=127.0.0.1,::1,10.0.0.10
HEGEL_ADMIN_REMOTE_ALLOWED=0
HEGEL_ADMIN_2FA_DISABLED=0
HEGEL_UPLOAD_SCAN_MODE=required
```

Notes:

- `HEGEL_API_CONFIG_MASTER_KEY` should be a strong secret managed by your deployment platform.
- `HEGEL_TRUST_PROXY=1` should be enabled only when traffic is behind a trusted reverse proxy.
- `HEGEL_ADMIN_ALLOWED_IPS` should contain only explicit administrator source IPs or VPN egress IPs.
- `HEGEL_UPLOAD_SCAN_MODE=required` is recommended for internet-facing deployments.
- keep `HEGEL_ADMIN_2FA_DISABLED=0` in production.

## Reverse Proxy

Deploy behind a reverse proxy such as Nginx, Caddy, or Cloudflare Tunnel.

The reverse proxy should:

- terminate TLS
- forward only sanitized `X-Forwarded-For` / `X-Forwarded-Proto`
- enforce request body limits
- rate-limit abusive traffic before it reaches Node.js
- block obvious bot traffic

### Minimum reverse proxy controls

- limit request body size to 16 MB or less
- rate-limit `/api/auth/login`, `/api/auth/register/send-code`, `/api/auth/password/send-code`
- deny access to admin routes except from VPN or allowlisted IPs

## WAF

Recommended options:

- Cloudflare WAF
- Azure Front Door WAF
- AWS WAF
- Nginx App Protect or ModSecurity if self-hosting

Recommended WAF rules:

- block common SQLi payloads
- block common XSS payloads
- challenge high-frequency auth traffic
- challenge traffic with suspicious automation signatures
- geo-restrict admin routes if appropriate

## TLS

Requirements:

- use HTTPS only in production
- redirect HTTP to HTTPS
- use modern TLS certificates from Let’s Encrypt or your cloud provider
- keep `HEGEL_FORCE_SECURE_COOKIES=1`

## Logging

Capture and retain:

- successful logins
- failed logins
- administrator 2FA challenges and verifications
- password reset requests
- admin actions
- upload rejections
- malware scan failures
- session revocations

Do not log:

- raw API keys
- passwords
- reset codes
- session tokens

## Alerting

Create alerts for:

- repeated failed login attempts against one account
- repeated failed login attempts from one IP
- failed administrator 2FA verification
- access to admin endpoints from non-allowlisted IPs
- malware detection in uploads
- sudden spikes in upload rejections
- repeated CSRF failures
- repeated suspicious client blocks

## Admin Access

Recommended production policy:

- keep admin access behind VPN
- keep `HEGEL_ADMIN_REMOTE_ALLOWED=0`
- populate `HEGEL_ADMIN_ALLOWED_IPS` with VPN egress IPs only
- optionally put `/admin.html` behind an extra reverse-proxy auth gate

## Malware Scanning

The app supports best-effort Windows Defender scanning for uploaded files.

Recommended production policy:

- install and keep Microsoft Defender active
- set `HEGEL_UPLOAD_SCAN_MODE=required`
- monitor upload scan failures

If you deploy on Linux:

- add ClamAV or another AV service
- wire the upload scan helper to your scanner CLI or daemon

## Backup and Key Management

- back up SQLite regularly
- store the encryption master key outside the repo
- rotate the master key using a planned migration window
- test restore procedures

## Next Recommended Hardening Steps

- add true admin second factor authentication
- move audit logs into an append-only or external logging sink
- add anomaly scoring for login behavior
- add security headers and CSP validation at the reverse proxy layer too
