@echo off
setlocal
title PhotoDrop - Compilation

rem ===========================================================
rem  PhotoDrop: compile les installateurs Windows (NSIS et EXE
rem  portable) dans le dossier dist\.
rem ===========================================================

cd /d "%~dp0"

where npm >nul 2>&1
if errorlevel 1 (
    echo.
    echo   Node.js n'est pas installe, ou npm n'est pas dans le PATH.
    echo.
    pause
    exit /b 1
)

echo.
echo   Compilation des installateurs Windows en cours...
echo   Les fichiers sortent dans dist\.
echo.

call npm run build
exit /b %ERRORLEVEL%
