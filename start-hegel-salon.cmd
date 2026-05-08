@echo off
setlocal
cd /d "%~dp0"

if not exist "%~dp0src\server.mjs" (
  echo [Hegel Salon] Please extract the zip to a normal folder first.
  echo [Hegel Salon] Do not run this script from inside the zip preview window.
  pause
  exit /b 1
)

if not exist "config\api.json" (
  copy /y "config\api.example.json" "config\api.json" >nul
)

node "src\server.mjs"

endlocal
