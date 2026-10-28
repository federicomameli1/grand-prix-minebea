@echo off
rem Avvio postazione: server locale + Vivaldi a schermo intero. Prima eseguire una volta: npm install && npm run build
cd /d "%~dp0"
set "BROWSER=%LOCALAPPDATA%\Vivaldi\Application\vivaldi.exe"
if not exist "%BROWSER%" set "BROWSER=%ProgramFiles%\Vivaldi\Application\vivaldi.exe"
start "server" /min cmd /c "npm run preview"
timeout /t 4 /nobreak >nul
rem ponytail: usa il profilo personale di Vivaldi (chiudere Vivaldi prima, altrimenti kiosk e flag audio vengono ignorati).
rem Per i PC aziendali tornare a un profilo dedicato: aggiungere --user-data-dir=C:\gpf-profile
start "" "%BROWSER%" --kiosk --autoplay-policy=no-user-gesture-required http://localhost:8080
