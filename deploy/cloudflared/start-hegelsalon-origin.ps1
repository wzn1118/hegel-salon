param(
  [string]$AdminAllowedIps = "127.0.0.1,::1",
  [string]$PublicBaseUrl = "https://app.your-domain.example",
  [string]$AllowedOrigins = "https://app.your-domain.example,https://www.your-domain.example,https://admin.your-domain.example"
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Resolve-Path (Join-Path $scriptDir "..\\..")
Set-Location $projectRoot

$env:PORT = "3098"
$env:HEGEL_ENABLE_AUTH = "1"
$env:HEGEL_TRUST_PROXY = "1"
$env:HEGEL_FORCE_SECURE_COOKIES = "1"
$env:HEGEL_PUBLIC_BASE_URL = $PublicBaseUrl
$env:HEGEL_ALLOWED_ORIGINS = $AllowedOrigins
$env:HEGEL_ADMIN_ALLOWED_IPS = $AdminAllowedIps

node src/server.mjs
