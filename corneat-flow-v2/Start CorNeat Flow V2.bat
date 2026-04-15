@echo off
title CorNeat Flow V2

echo.
echo  ==========================================
echo   CorNeat Flow V2  ^|  Starting up...
echo  ==========================================
echo.

:: ── Check Node is installed ──────────────────────────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
  echo  ERROR: Node.js not found.
  echo  Please download and install it from https://nodejs.org
  echo  Choose the LTS version.
  pause
  exit /b 1
)

:: ── Move into the v2 project folder ──────────────────────────────────────────
cd /d "%~dp0corneat-flow-v2"

:: ── Install dependencies if node_modules is missing ──────────────────────────
if not exist "node_modules\" (
  echo  First run: installing dependencies ^(this takes ~1 min^)...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo  ERROR: npm install failed. Check your internet connection.
    pause
    exit /b 1
  )
)

:: ── Start the existing data server (port 3001) alongside Next.js (port 3000) ─
echo  Starting data server on port 3001...
start "CorNeat Data Server" /min cmd /c "cd /d "%~dp0" && node server.js"

:: Give the data server a moment to start
timeout /t 2 /nobreak >nul

:: ── Start Next.js dev server ──────────────────────────────────────────────────
echo  Starting Next.js on http://localhost:3000
echo.
echo  Press Ctrl+C to stop.
echo.

npm run dev

pause
