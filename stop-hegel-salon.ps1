$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$controllerPath = Join-Path $projectRoot "local-resources\launcher\launcher-controller.ps1"

if (-not (Test-Path $controllerPath)) {
  throw "Missing launcher controller script at $controllerPath."
}

. $controllerPath

$status = Get-LauncherStatus
$hadServer = [bool]$status.serverRunning
$hadTunnel = [bool]$status.publicRunning

Stop-AllLauncherProcesses

if ($hadServer -or $hadTunnel) {
  Write-Output "Stopped Hegel Salon launcher processes."
} else {
  Write-Output "No running Hegel Salon launcher processes were found."
}
