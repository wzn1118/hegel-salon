$ErrorActionPreference = "SilentlyContinue"

$targets = Get-CimInstance Win32_Process -Filter "name = 'node.exe'" |
  Where-Object {
    ($_.CommandLine -like "*src\\server.mjs*") -or
    ($_.CommandLine -like "*/src/server.mjs*") -or
    ($_.CommandLine -like "*src/server.mjs*") -or
    (
      ($_.CommandLine -like "*hegel-salon*") -and
      ($_.CommandLine -like "*server.mjs*")
    )
  }

if (-not $targets) {
  Write-Output "No running Hegel Salon server was found."
  exit 0
}

foreach ($target in $targets) {
  try {
    Stop-Process -Id $target.ProcessId -Force
    Write-Output "Stopped Hegel Salon server process $($target.ProcessId)."
  } catch {
    Write-Output "Failed to stop process $($target.ProcessId)."
  }
}
