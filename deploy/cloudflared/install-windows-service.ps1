param(
  [Parameter(Mandatory = $true)]
  [string]$TunnelId,

  [Parameter(Mandatory = $true)]
  [string]$ConfigPath,

  [string]$CloudflaredPath = $env:CLOUDFLARED_PATH
)

$ErrorActionPreference = "Stop"

if (-not $CloudflaredPath) {
  $CloudflaredPath = "cloudflared"
}

if ($CloudflaredPath -ne "cloudflared" -and -not (Test-Path $CloudflaredPath)) {
  throw "cloudflared.exe not found at $CloudflaredPath"
}

if (-not (Test-Path $ConfigPath)) {
  throw "Config file not found: $ConfigPath"
}

& $CloudflaredPath service uninstall | Out-Null
& $CloudflaredPath service install | Out-Null

Write-Host "Cloudflared Windows service installed."
Write-Host "Tunnel ID: $TunnelId"
Write-Host "Config: $ConfigPath"
Write-Host "Now run:"
Write-Host "  sc start cloudflared"
