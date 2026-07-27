@echo off
setlocal

cd /d "%~dp0"

echo Iniciando frontend...
start "Mapa Hierarquia - Frontend" cmd /k "npm run dev"

echo Iniciando API...
start "Mapa Hierarquia - API" cmd /k "node server/index.js"

echo Frontend e API iniciados em janelas separadas.
endlocal
