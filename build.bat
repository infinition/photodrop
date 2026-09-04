@echo off
title PhotoDrop - Compilation EXE
cd /d "c:\DEV\coding\Github\photodrop"

echo ========================================================
echo   PhotoDrop - Compilation de l'installateur EXE
echo ========================================================
echo.
echo Compilation en cours, patientez...
echo.
npm run build
echo.
echo Terminé. Les fichiers EXE sont dans le dossier dist\
echo.
pause
