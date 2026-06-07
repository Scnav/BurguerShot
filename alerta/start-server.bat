@echo off
echo.
echo ========================================
echo    Rust Skin Watch - Monitor de Precos
echo ========================================
echo.
echo Iniciando servidor backend...
echo.

:: Verifica se Node.js está instalado
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Node.js nao encontrado!
    echo Por favor instale Node.js de: https://nodejs.org/
    pause
    exit /b 1
)

:: Inicia o servidor
echo [OK] Node.js detectado
echo [OK] Iniciando server.js na porta 3000...
echo.

node server.js

if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Falha ao iniciar servidor
    pause
    exit /b 1
)
