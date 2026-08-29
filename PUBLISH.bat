@echo off
setlocal enabledelayedexpansion
title Portfolio - Publish to GitHub
mode con: cols=80 lines=28
color 0E
cd /d "%~dp0"

cls
echo ==========================================================================
echo    PUBLISH PORTFOLIO
echo    %CD%
echo ==========================================================================
echo.

where git >nul 2>&1
if errorlevel 1 (
  echo    ERROR: Git is not installed. Opening the download page.
  start "" https://git-scm.com/download/win
  pause
  exit /b 1
)

if not exist ".git" (
  echo    ERROR: This folder is not connected to GitHub.
  echo    Run INSTALL.bat from the setup ZIP instead.
  echo.
  pause
  exit /b 1
)

echo [1/4] Getting the latest version from GitHub...
git pull --rebase --autostash
if errorlevel 1 (
  echo.
  echo    ERROR: Could not sync with GitHub. Check your internet
  echo    connection and try again.
  echo.
  pause
  exit /b 1
)
echo       OK.

echo.
echo [2/4] Looking for your changes...
git add -A
git diff --cached --quiet
if !errorlevel!==0 (
  echo.
  echo    Nothing has changed - your site is already up to date.
  echo.
  pause
  exit /b 0
)
git diff --cached --name-only
echo.

echo [3/4] Saving the changes...
git commit -m "Update portfolio %DATE% %TIME%"
echo       OK.

echo.
echo [4/4] Sending to GitHub...
git push
if errorlevel 1 (
  echo.
  echo    ERROR: The push failed.
  echo    If a GitHub login window appeared, sign in and run this again.
  echo.
  pause
  exit /b 1
)

color 0A
echo.
echo ==========================================================================
echo    PUBLISHED.
echo.
echo    https://andreyruvi.github.io/portfolio/
echo.
echo    GitHub is rebuilding the site now. Give it about one minute,
echo    then refresh the page. If it still looks old, press Ctrl+F5.
echo ==========================================================================
echo.
choice /c YN /n /m "Open the website now? (Y/N) "
if errorlevel 2 goto :end
start "" https://andreyruvi.github.io/portfolio/
:end
echo.
pause
