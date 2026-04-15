@echo off
:: CorNeat Flow Launcher
:: Uses PowerShell to start Node invisibly — no terminal window stays open.

cd /d "%~dp0"

:: Verify the build exists before trying to launch
if not exist "corneat-flow-v2\.next\" (
  echo.
  echo  CorNeat Flow has not been set up yet.
  echo.
  echo  Please run "Setup CorNeat Flow.bat" first.
  echo.
  pause
  exit /b 1
)

:: Start node launcher.js with no visible window using PowerShell
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command ^
  "Start-Process 'node' -ArgumentList '%~dp0corneat-flow-v2\launcher.js' -WorkingDirectory '%~dp0' -WindowStyle Hidden"
