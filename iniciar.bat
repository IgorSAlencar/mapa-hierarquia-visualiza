@echo off
setlocal

cd /d "%~dp0"

echo Iniciando frontend...
start "Mapa Hierarquia - Frontend" cmd /k "npm run dev"

echo Iniciando API...
start "Mapa Hierarquia - API" cmd /k "node server/index.js"

echo Iniciando worker de visitas (a feature flag define se permanecerá ativo)...
start "Mapa Hierarquia - Worker" cmd /k "npm run worker:visits"

echo Frontend, API e worker habilitado iniciados em janelas separadas.
endlocal
