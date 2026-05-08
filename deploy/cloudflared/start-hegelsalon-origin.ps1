param(
  [string]$AdminAllowedIps = "127.0.0.1,::1"
)

$ErrorActionPreference = "Stop"
Set-Location "E:\hegel-salon-portable-full"

$env:PORT = "3098"
$env:HEGEL_ENABLE_AUTH = "1"
$env:HEGEL_TRUST_PROXY = "1"
$env:HEGEL_FORCE_SECURE_COOKIES = "1"
$env:HEGEL_PUBLIC_BASE_URL = "https://hegelsalon.com"
$env:HEGEL_ALLOWED_ORIGINS = "https://hegelsalon.com,https://www.hegelsalon.com,https://admin.hegelsalon.com"
$env:HEGEL_ADMIN_ALLOWED_IPS = $AdminAllowedIps

node src/server.mjs
