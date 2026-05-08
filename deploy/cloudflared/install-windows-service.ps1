param(
  [Parameter(Mandatory = $true)]
  [string]$TunnelId,

  [Parameter(Mandatory = $true)]
  [string]$ConfigPath
)

$ErrorActionPreference = "Stop"

$cloudflaredPath = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
if (-not (Test-Path $cloudflaredPath)) {
  throw "cloudflared.exe not found at $cloudflaredPath"
}

if (-not (Test-Path $ConfigPath)) {
  throw "Config file not found: $ConfigPath"
}

& $cloudflaredPath service uninstall | Out-Null
& $cloudflaredPath service install | Out-Null

Write-Host "Cloudflared Windows service installed."
Write-Host "Tunnel ID: $TunnelId"
Write-Host "Config: $ConfigPath"
Write-Host "Now run:"
Write-Host "  sc start cloudflared"
