param(
  [ValidateSet("launcher", "local", "public")]
  [string]$Mode = "launcher",
  [int]$Port = 3087,
  [switch]$OpenBrowser,
  [string]$DataDir = ""
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

$launcherPath = Join-Path $projectRoot "local-resources\launcher\Hegel-Salon-Launcher.ps1"
$controllerPath = Join-Path $projectRoot "local-resources\launcher\launcher-controller.ps1"

if (-not (Test-Path $launcherPath)) {
  throw "Missing launcher UI script at $launcherPath."
}

if (-not (Test-Path $controllerPath)) {
  throw "Missing launcher controller script at $controllerPath."
}

if ($Mode -eq "launcher") {
  & $launcherPath
  exit $LASTEXITCODE
}

. $controllerPath

$resolvedDataDir = if ([string]::IsNullOrWhiteSpace($DataDir)) {
  Resolve-PreferredDataDir
} else {
  $DataDir
}

if ($Mode -eq "local") {
  $status = Start-LocalServer -Port $Port -DataDir $resolvedDataDir
  if ($OpenBrowser) {
    Start-Process $status.localUrl
  }
  exit 0
}

if ($Mode -eq "public") {
  $status = Start-PublicTunnel -Port $Port -DataDir $resolvedDataDir
  if ($OpenBrowser) {
    Start-Process $status.localUrl
  }
  exit 0
}
