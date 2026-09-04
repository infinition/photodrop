@echo off
title PhotoDrop
cd /d "c:\DEV\coding\Github\photodrop"

echo ========================================================
echo   PhotoDrop - Transfert Photos Android vers PC
echo ========================================================
echo.
echo Lancement du serveur local...
timeout /t 1 /nobreak >nul
start "" http://localhost:3456
node server.js
pause
