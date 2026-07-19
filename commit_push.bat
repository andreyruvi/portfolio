@echo off
echo ==========================
echo Git Commit and Push
echo ==========================

git add .

git commit -m "update index"

git push origin main

echo.
echo ==========================
echo Done!
echo ==========================
pause