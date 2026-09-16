@echo off
title IXADCC
cd /d "%~dp0"
if not exist node_modules (
 echo Installing IXADCC dependencies...
 call npm install
)
start "IXADCC SERVER - KEEP OPEN" cmd /k "cd /d ""%~dp0"" && npm start"
timeout /t 4 /nobreak >nul
echo.
echo IXADCC is running locally:
echo Operator: http://localhost:3000/operator.html
echo Caller:   http://localhost:3000/caller.html
echo.
echo For your iPhone test, you need a public HTTPS tunnel.
echo You can run: npx localtunnel --port 3000
echo and use the SAME tunnel URL for both pages.
pause
