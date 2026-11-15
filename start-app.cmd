@echo off
setlocal EnableExtensions
title LinguaBuddy Local Launcher

rem ---------------------------------------------------------------
rem  LinguaBuddy launcher - low false-positive edition
rem  * fixed absolute paths only, no PATH mutation
rem  * no executable discovery, no dynamic command construction
rem  * normal visible server window (nothing hidden or minimized)
rem  * loopback-only server: 127.0.0.1 (single network interface)
rem  * opens a browser that actually exists instead of relying on
rem    the system URL handler, which can point to an uninstalled app
rem  Override: set LINGUA_NODE / LINGUA_BROWSER to full exe paths
rem ---------------------------------------------------------------

set "ROOT=C:\Users\Administrator\WorkBuddy\2026-11-09-22-14-29\lingua-buddy"
set "APPURL=http://127.0.0.1:5173/"
set "CHECKER=%ROOT%\check-server.cjs"
set "VITE=%ROOT%\node_modules\vite\bin\vite.js"
set "NODE_EXE=C:\Users\Administrator\.workbuddy\binaries\node\versions\22.22.2-6\node.exe"
set "EDGE=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
set "SE360=%USERPROFILE%\AppData\Roaming\360se6\Application\360se.exe"
set "BROWSER="

if defined LINGUA_NODE if exist "%LINGUA_NODE%" set "NODE_EXE=%LINGUA_NODE%"
if not exist "%NODE_EXE%" goto NO_NODE
if not exist "%VITE%" goto NO_VITE

cd /d "%ROOT%"

rem "Already running?" probe. A signed OS component goes first, so the
rem common case still works even if a security product blocks cmd -> node.exe.
set "CURL=%WINDIR%\System32\curl.exe"
if not exist "%CURL%" goto CHECK_WITH_NODE
"%CURL%" -s -o nul -f "%APPURL%"
if not errorlevel 1 goto READY

:CHECK_WITH_NODE
"%NODE_EXE%" "%CHECKER%"
if not errorlevel 1 goto READY

echo.
echo   Starting the LinguaBuddy local server ...
echo   A normal visible window keeps it alive. Close that window to stop.
echo.
start "LinguaBuddy Server - close to stop" "%NODE_EXE%" "%VITE%" --host 127.0.0.1 --port 5173 --strictPort
timeout /t 3 /nobreak >nul
"%NODE_EXE%" "%CHECKER%"
if errorlevel 1 goto FAILED

:READY
rem A stale default-browser registration makes "start URL" fail with an
rem "app not found" dialog even though everything else worked. Pick a
rem browser whose executable is present, with an explicit override first.
if defined LINGUA_BROWSER if exist "%LINGUA_BROWSER%" set "BROWSER=%LINGUA_BROWSER%"
if defined BROWSER goto OPEN_BROWSER
if exist "%EDGE%" set "BROWSER=%EDGE%"
if defined BROWSER goto OPEN_BROWSER
if exist "%SE360%" set "BROWSER=%SE360%"
if defined BROWSER goto OPEN_BROWSER

start "" "%APPURL%"
echo   No known browser found; used the system URL handler as a fallback.
echo   If nothing opened, paste this address into your browser: %APPURL%
exit /b 0

:OPEN_BROWSER
start "" "%BROWSER%" "%APPURL%"
echo   LinguaBuddy is ready: %APPURL%
echo   Browser: %BROWSER%
exit /b 0

:FAILED
echo.
echo   The server did not answer in time. Start it manually:
echo     cd /d "%ROOT%"
echo     "%NODE_EXE%" "%VITE%" --host 127.0.0.1 --port 5173
echo.
pause
exit /b 1

:NO_NODE
echo.
echo   [ERROR] node.exe not found: "%NODE_EXE%"
echo   Fix: set LINGUA_NODE to the full path of node.exe, then run again.
echo.
pause
exit /b 1

:NO_VITE
echo.
echo   [ERROR] Vite not found: "%VITE%"
echo   Fix: run "npm install" inside "%ROOT%" once.
echo.
pause
exit /b 1
