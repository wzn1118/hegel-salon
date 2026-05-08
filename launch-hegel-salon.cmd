@echo off
setlocal
cd /d "%~dp0"

if not exist "%~dp0src\server.mjs" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$current = (Get-Location).Path; " ^
    "if ($current -match '(?i)^(.*?\\.zip)(?:[\\\\/].*)?$') { " ^
    "  $zipPath = $matches[1]; " ^
    "  $parent = [System.IO.Path]::GetDirectoryName($zipPath); " ^
    "  $target = Join-Path $parent ([System.IO.Path]::GetFileNameWithoutExtension($zipPath)); " ^
    "  Expand-Archive -LiteralPath $zipPath -DestinationPath $parent -Force; " ^
    "  Start-Process (Join-Path $target 'launch-hegel-salon.cmd'); " ^
    "  exit 0; " ^
    "} else { exit 2 }"
  if %errorlevel%==0 exit /b 0
  echo [Hegel Salon] Please extract the zip to a normal folder first.
  echo [Hegel Salon] Do not run this script from inside the zip preview window.
  pause
  exit /b 1
)

if not exist "%~dp0launch-hegel-salon.ps1" (
  echo [Hegel Salon] Missing launch-hegel-salon.ps1. Please extract the full package.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch-hegel-salon.ps1"
endlocal
