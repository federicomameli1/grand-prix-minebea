@echo off
rem Avvio postazione: server locale + browser a schermo intero. Prima eseguire una volta: npm install && npm run build
rem Station launcher: local server + fullscreen browser. Run once first: npm install && npm run build
cd /d "%~dp0"
if not exist dist\index.html (
  echo Manca la build: eseguire npm run build
  echo Build missing: run npm run build
  pause
  exit /b 1
)

rem Browser Chromium: Vivaldi, poi Chrome, poi Edge (sempre presente su Windows)
set "BROWSER=%LOCALAPPDATA%\Vivaldi\Application\vivaldi.exe"
if not exist "%BROWSER%" set "BROWSER=%ProgramFiles%\Vivaldi\Application\vivaldi.exe"
if not exist "%BROWSER%" set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%BROWSER%" set "BROWSER=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
if not exist "%BROWSER%" set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"

start "server" /min cmd /c "npm run preview"
timeout /t 4 /nobreak >nul
rem ponytail: usa il profilo personale del browser (chiuderlo prima, altrimenti kiosk e flag audio vengono ignorati).
rem Per i PC aziendali passare a un profilo dedicato: aggiungere --user-data-dir=C:\gpf-profile
start "" "%BROWSER%" --kiosk --autoplay-policy=no-user-gesture-required http://localhost:8080
