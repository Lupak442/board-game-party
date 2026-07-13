@echo off
chcp 65001 >nul

echo =========================================
echo       Board Game Party Server
echo =========================================
echo.

set PATH=%PATH%;C:\Program Files\nodejs\

for /f "delims=" %%i in ('powershell -ExecutionPolicy Bypass -File get_ip.ps1') do set LOCAL_IP=%%i

echo Please enter the following address in your smartphone:
echo.
echo [Wi-Fi Address]
echo http://%LOCAL_IP%:3001
echo.
echo =========================================
echo To STOP the server, simply close this window [X].
echo =========================================
echo.
echo Server Log:

cd server
node server.js
pause
