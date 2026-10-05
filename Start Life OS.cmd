@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Install Node.js 22.13 or newer first.
 pause
 exit /b 1
)
if not exist node_modules call npm ci
if not exist dist\index.html call npm run build
start "" "http://127.0.0.1:4317"
call npm start
pause

