$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

$configPath = Join-Path $projectRoot "config\api.json"
$examplePath = Join-Path $projectRoot "config\api.example.json"

if (-not (Test-Path $configPath) -and (Test-Path $examplePath)) {
  Copy-Item -LiteralPath $examplePath -Destination $configPath -Force
}

$existing = Get-CimInstance Win32_Process -Filter "name = 'node.exe'" |
  Where-Object { $_.CommandLine -like "*src\server.mjs*" } |
  Select-Object -First 1

if (-not $existing) {
  Start-Process -FilePath node -ArgumentList "src/server.mjs" -WorkingDirectory $projectRoot | Out-Null
}

for ($i = 0; $i -lt 40; $i++) {
  try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:3087/" -UseBasicParsing -TimeoutSec 2
    if ($response.StatusCode -eq 200) {
      Start-Process "http://127.0.0.1:3087/"
      exit 0
    }
  } catch {
    Start-Sleep -Milliseconds 500
  }
}

Start-Process "http://127.0.0.1:3087/"
