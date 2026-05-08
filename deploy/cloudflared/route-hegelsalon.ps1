param(
  [Parameter(Mandatory = $true)]
  [string]$TunnelName,

  [Parameter(Mandatory = $true)]
  [string]$AppHostname,

  [Parameter(Mandatory = $true)]
  [string]$AdminHostname,

  [string]$WwwHostname = "",

  [string]$CloudflaredPath = $env:CLOUDFLARED_PATH
)

$ErrorActionPreference = "Stop"

if (-not $CloudflaredPath) {
  $CloudflaredPath = "cloudflared"
}

if ($CloudflaredPath -ne "cloudflared" -and -not (Test-Path $CloudflaredPath)) {
  throw "cloudflared.exe not found at $CloudflaredPath"
}

& $CloudflaredPath tunnel route dns $TunnelName $AppHostname
& $CloudflaredPath tunnel route dns $TunnelName $AdminHostname

if ($WwwHostname) {
  & $CloudflaredPath tunnel route dns $TunnelName $WwwHostname
}
