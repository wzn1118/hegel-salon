param(
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

& $CloudflaredPath tunnel --config $ConfigPath run
