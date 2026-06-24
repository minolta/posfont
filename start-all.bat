@echo off
title Start POS Services (API & Frontend)
echo ===================================================
echo Starting POS Services...
echo ===================================================

echo.
echo [1/2] Launching POS API (Spring Boot Backend)...
start "POS API Backend" /D "F:\src\pos\api\pos" cmd /k "mvnw.cmd spring-boot:run"

echo.
echo [2/2] Launching POS Frontend (Angular)...
start "POS Frontend" /D "F:\src\pos\postfont2" cmd /k "npm start"

echo.
echo Both services are starting in separate windows.
echo You can close this window now.
timeout /t 5
