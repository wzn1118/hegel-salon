param(
  [Parameter(Mandatory = $true)]
  [string]$TunnelName,

  [Parameter(Mandatory = $true)]
  [string]$AppHostname,

  [Parameter(Mandatory = $true)]
  [string]$AdminHostname,

  [string]$WwwHostname = ""
)

$ErrorActionPreference = "Stop"
$cloudflaredPath = "C:\Program Files (x86)\cloudflared\cloudflared.exe"

if (-not (Test-Path $cloudflaredPath)) {
  throw "cloudflared.exe not found at $cloudflaredPath"
}

& $cloudflaredPath tunnel route dns $TunnelName $AppHostname
& $cloudflaredPath tunnel route dns $TunnelName $AdminHostname

if ($WwwHostname) {
  & $cloudflaredPath tunnel route dns $TunnelName $WwwHostname
}
