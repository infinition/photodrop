@echo off
setlocal
title PhotoDrop

rem ===========================================================
rem  PhotoDrop: lance l'application de bureau Electron, serveur
rem  HTTP et fenetre inclus.
rem
rem  Le script se place dans son propre dossier: un double clic
rem  depuis l'explorateur marche aussi bien qu'un appel depuis
rem  une console ouverte ailleurs.
rem ===========================================================

cd /d "%~dp0"

where npm >nul 2>&1
if errorlevel 1 (
    echo.
    echo   Node.js n'est pas installe, ou npm n'est pas dans le PATH.
    echo   Installez-le depuis https://nodejs.org puis relancez ce script.
    echo.
    pause
    exit /b 1
)

echo.
echo   Le serveur ecoute sur le port 3456.
echo   Fermez la fenetre PhotoDrop pour arreter le tout.
echo.

call npm start
exit /b %ERRORLEVEL%
