@echo off
title CorNeat Flow — Setup
color 0A

echo.
echo  =====================================================
echo   CorNeat Flow V2 — First-Time Setup
echo   This runs once. After this, use CorNeat Flow.bat
echo  =====================================================
echo.

:: Check Node.js
where node >nul 2>&1
if errorlevel 1 (
  color 0C
  echo  ERROR: Node.js is not installed.
  echo  Please download from https://nodejs.org then run this again.
  pause & exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do set NODE_VER=%%v
echo  Node.js found: %NODE_VER%
echo.

:: ── Step 1: Install server.js dependencies (express, cors) ──────────────────
echo  Step 1/3 - Installing data server dependencies...
cd /d "%~dp0"
call npm install
if errorlevel 1 (
  color 0C & echo. & echo  ERROR: npm install failed for server.js & pause & exit /b 1
)
echo  Data server dependencies installed.
echo.

:: ── Step 2: Install Next.js dependencies ────────────────────────────────────
echo  Step 2/3 - Installing app dependencies...
cd /d "%~dp0corneat-flow-v2"
call npm install
if errorlevel 1 (
  color 0C & echo. & echo  ERROR: npm install failed for Next.js app & pause & exit /b 1
)
echo  App dependencies installed.
echo.

:: ── Step 3: Build Next.js ────────────────────────────────────────────────────
echo  Step 3/3 - Building the app (1-2 minutes)...
call npm run build
if errorlevel 1 (
  color 0C & echo. & echo  ERROR: Build failed - screenshot this and share with your developer. & pause & exit /b 1
)

color 0A
echo.
echo  =====================================================
echo   Setup complete!
echo  =====================================================
echo.
echo  To launch: double-click "CorNeat Flow.bat"
echo.
pause
