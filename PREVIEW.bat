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
echo This is the copy on YOUR computer, not the live website.
echo Everything works here - menu, filters, search, project galleries
echo and Owner edit.
echo.
echo When it looks right, double-click push.bat to publish it.
echo.
start "" "%CD%\index.html"
timeout /t 4 >nul
