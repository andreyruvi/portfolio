@echo off
setlocal enabledelayedexpansion
title Portfolio - Push to GitHub
mode con: cols=88 lines=38
color 0E

REM ===========================================================================
REM  push.bat — publishes this folder to GitHub Pages.
REM
REM  Works from wherever you extracted it: the repository is this file's own
REM  folder. Sets the repository up on first run, then just commits and pushes.
REM
REM  No password or token is stored here. Git for Windows handles the login
REM  through its Credential Manager the first time you push, and remembers it.
REM ===========================================================================

set "REPO_URL=https://github.com/andreyruvi/portfolio.git"
set "BRANCH=main"
set "SITE=https://andreyruvi.github.io/portfolio/"

REM -- The folder this file lives in, without the trailing backslash.
set "REPO_DIR=%~dp0"
if "%REPO_DIR:~-1%"=="\" set "REPO_DIR=%REPO_DIR:~0,-1%"

cls
echo ==============================================================================
echo    PUBLISH PORTFOLIO
echo.
echo    Folder:   %REPO_DIR%
echo    GitHub:   %REPO_URL%
echo    Website:  %SITE%
echo ==============================================================================
echo.

cd /d "%REPO_DIR%" 2>nul
if errorlevel 1 (
  echo    ERROR: Could not open this folder.
  goto :fail
)

if not exist "index.html" (
  echo    ERROR: index.html is not in this folder, so this does not look like
  echo    the portfolio.
  echo.
  echo    Make sure push.bat sits in the same folder as index.html.
  goto :fail
)

REM ------------------------------------------------------------- [1] Git ----
echo [1/6] Checking that Git is installed...
where git >nul 2>&1
if errorlevel 1 (
  echo.
  echo    ERROR: Git is not installed on this computer.
  echo.
  echo    I am opening the download page. Install it with the DEFAULT
  echo    options - just keep clicking Next - then run push.bat again.
  echo.
  start "" https://git-scm.com/download/win
  goto :fail
)
for /f "tokens=*" %%v in ('git --version') do set "GITVER=%%v"
echo       OK - !GITVER!

REM --------------------------------------------------- [2] repository set-up ----
echo.
echo [2/6] Checking the repository...
git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo       First run - setting this folder up as a Git repository.
  git init -q
  if errorlevel 1 (
    echo    ERROR: git init failed.
    goto :fail
  )
  git checkout -q -B %BRANCH%
  set "FIRSTRUN=1"
) else (
  echo       Already a Git repository.
)

REM -- Remote: add it if missing, refuse to touch it if it points elsewhere.
set "ORIGIN="
for /f "delims=" %%u in ('git remote get-url origin 2^>nul') do set "ORIGIN=%%u"
if "!ORIGIN!"=="" (
  echo       Adding the GitHub remote.
  git remote add origin "%REPO_URL%"
  set "ORIGIN=%REPO_URL%"
) else (
  echo !ORIGIN! | find /i "andreyruvi/portfolio" >nul
  if errorlevel 1 (
    echo.
    echo    ERROR: This folder is already connected to a different project:
    echo      !ORIGIN!
    echo.
    echo    I will not change that. Move this folder aside and extract the
    echo    portfolio into a fresh one.
    goto :fail
  )
)
echo       Remote: !ORIGIN!

REM -- Identity, so the commit can be made at all.
set "GITNAME="
set "GITMAIL="
for /f "delims=" %%n in ('git config user.name 2^>nul') do set "GITNAME=%%n"
for /f "delims=" %%e in ('git config user.email 2^>nul') do set "GITMAIL=%%e"
if "!GITNAME!"=="" git config user.name "andreyruvi"
if "!GITMAIL!"=="" git config user.email "andreyruvi@users.noreply.github.com"

REM ------------------------------------------------------- [3] sync remote ----
echo.
echo [3/6] Getting the latest version from GitHub...
echo       ^(the first time, a GitHub login window may open in your browser^)
if defined FIRSTRUN (
  git fetch origin %BRANCH% 2>nul
  if errorlevel 1 (
    echo       Nothing on GitHub yet, or it could not be reached - continuing.
  ) else (
    REM Adopt the remote history without touching a single file on disk, so
    REM what is in this folder becomes the next commit rather than a conflict.
    git reset --mixed FETCH_HEAD >nul
    echo       Remote history adopted. Your files are untouched.
  )
) else (
  git pull --rebase --autostash
  if errorlevel 1 (
    echo.
    echo    ERROR: Could not sync with GitHub.
    echo    Check your internet connection, then run push.bat again.
    goto :fail
  )
  echo       OK.
)

REM -- One-time tidy. The stylesheet and scripts moved from assets/ into css/
REM    and js/, and PUBLISH.bat became push.bat. Extracting the update over the
REM    folder cannot remove the old copies, so remove them here — but only once
REM    the replacements are actually present.
if exist "css\style.css" if exist "js\app.js" (
  if exist "assets" (
    echo       Removing the old assets folder, replaced by css\ and js\.
    rd /s /q "assets"
  )
  if exist "PUBLISH.bat" (
    echo       Removing PUBLISH.bat, replaced by push.bat.
    del /q "PUBLISH.bat"
  )
)

REM ------------------------------------------------------ [4] what changed ----
echo.
echo [4/6] Looking for changes...
git add -A
git diff --cached --quiet
if !errorlevel!==0 (
  echo.
  echo    Nothing has changed - your website is already up to date.
  echo.
  echo    If you expected changes, check that you extracted the update zip
  echo    INTO this folder:
  echo    %REPO_DIR%
  echo.
  pause
  exit /b 0
)
echo.
echo       These files will be published:
echo       ------------------------------------------------------------------
git diff --cached --name-status
echo       ------------------------------------------------------------------
echo.

REM ---------------------------------------------------------- [5] commit ----
echo [5/6] Saving the changes...
git commit -q -m "Update portfolio %DATE% %TIME%"
if errorlevel 1 (
  echo    ERROR: The commit failed.
  goto :fail
)
echo       OK.

REM ------------------------------------------------------------ [6] push ----
echo.
echo [6/6] Sending to GitHub...
if defined FIRSTRUN (
  git push -u origin %BRANCH%
) else (
  git push
)
if errorlevel 1 (
  echo.
  echo    ERROR: The push failed. The usual reasons:
  echo.
  echo      - The GitHub login window was closed. Run push.bat again and
  echo        sign in when the browser opens.
  echo      - No internet connection.
  echo      - Someone else changed the repository. Run push.bat again -
  echo        it pulls first, so a second run usually succeeds.
  echo.
  echo    Nothing was lost. Your commit is saved locally and will be sent
  echo    the next time push.bat succeeds.
  goto :fail
)

color 0A
echo.
echo ==============================================================================
echo    PUBLISHED.
echo.
echo    %SITE%
echo.
echo    GitHub Pages rebuilds in about a minute. Refresh the page then.
echo    If it still looks old, press Ctrl+F5 to force a reload.
echo ==============================================================================
echo.
choice /c YN /n /m "Open the website now? Y/N "
if errorlevel 2 goto :end
start "" %SITE%
goto :end

:fail
color 0C
echo.
echo ==============================================================================
echo    Nothing was published.
echo ==============================================================================
echo.
pause
exit /b 1

:end
echo.
pause
exit /b 0
