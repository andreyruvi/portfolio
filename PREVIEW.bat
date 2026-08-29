@echo off
title Portfolio - Preview
cd /d "%~dp0"

if not exist "index.html" (
  echo index.html was not found in this folder.
  pause
  exit /b 1
)

echo Opening your portfolio in the browser...
echo.
echo This is the version on YOUR computer, not the live one.
echo When it looks right, double-click PUBLISH.bat to put it online.
echo.
start "" "%CD%\index.html"
timeout /t 3 >nul
