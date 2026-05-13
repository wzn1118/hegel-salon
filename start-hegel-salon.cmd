@echo off
setlocal
cd /d "%~dp0"

if not exist "%~dp0launch-hegel-salon.ps1" (
  echo [Hegel Salon] Please extract the zip to a normal folder first.
  echo [Hegel Salon] Do not run this script from inside the zip preview window.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch-hegel-salon.ps1" -Mode public -OpenBrowser
endlocal
