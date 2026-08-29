@echo off
setlocal enabledelayedexpansion
title Portfolio - Publish to GitHub
mode con: cols=84 lines=34
color 0E
cd /d "%~dp0"

cls
echo ==============================================================================
echo    PUBLISH PORTFOLIO
echo    %CD%
echo ==============================================================================
echo.
echo    Before running this, make sure you have extracted
echo    portfolio-update.zip INTO this folder, so that:
echo      - index.html here is the new one
echo      - your new photos are in the images folder
echo.

where git >nul 2>&1
if errorlevel 1 (
  echo    ERROR: Git is not installed. Opening the download page.
  start "" https://git-scm.com/download/win
  goto :fail
)

if not exist ".git" (
  echo    ERROR: This folder is not connected to GitHub.
  echo    Run INSTALL.bat from the setup ZIP instead.
  echo.
  goto :fail
)

REM -- A zip still sitting here usually means it was never extracted.
if exist "portfolio-update.zip" (
  echo    NOTE: portfolio-update.zip is still in this folder.
  echo    If you have not extracted it yet, do that first - right-click it,
  echo    choose "Extract All...", and extract INTO this same folder,
  echo    saying yes when Windows asks to replace files.
  echo.
  choice /c YN /n /m "    Carry on and publish anyway? Y/N "
  if errorlevel 2 goto :cancelled
  echo.
)

echo [1/4] Getting the latest version from GitHub...
git pull --rebase --autostash
if errorlevel 1 (
  echo.
  echo    ERROR: Could not sync with GitHub. Check your internet
  echo    connection and try again.
  echo.
  goto :fail
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
  echo    If you expected changes here, the update zip was probably
  echo    extracted somewhere else. Extract it INTO this folder:
  echo    %CD%
  echo.
  pause
  exit /b 0
)
echo       These files will be published:
echo.
git diff --cached --name-status
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
  goto :fail
)

color 0A
echo.
echo ==============================================================================
echo    PUBLISHED.
echo.
echo    https://andreyruvi.github.io/portfolio/
echo.
echo    Give GitHub about a minute, then refresh the page.
echo    If it still looks old, press Ctrl+F5 to force a reload.
echo ==============================================================================
echo.
choice /c YN /n /m "Open the website now? Y/N "
if errorlevel 2 goto :end
start "" https://andreyruvi.github.io/portfolio/
goto :end

:cancelled
color 0E
echo.
echo    Cancelled. Nothing was published.
echo.
pause
exit /b 0

:fail
color 0C
echo.
echo    Nothing was published.
echo.
pause
exit /b 1

:end
echo.
pause
exit /b 0
