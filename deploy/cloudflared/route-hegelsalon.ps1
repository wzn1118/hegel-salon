param(
  [Parameter(Mandatory = $true)]
  [string]$TunnelName
)

$ErrorActionPreference = "Stop"
$cloudflaredPath = "C:\Program Files (x86)\cloudflared\cloudflared.exe"

if (-not (Test-Path $cloudflaredPath)) {
  throw "cloudflared.exe not found at $cloudflaredPath"
}

& $cloudflaredPath tunnel route dns $TunnelName "hegelsalon.com"
& $cloudflaredPath tunnel route dns $TunnelName "www.hegelsalon.com"
& $cloudflaredPath tunnel route dns $TunnelName "admin.hegelsalon.com"
