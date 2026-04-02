@echo off
echo ================================================
echo  INICIANDO AGENTE DE IMPRESSAO DO RESTAURANTE
echo ================================================
echo.
echo Verificando se o Node.js esta instalado...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo ERRO: Node.js nao encontrado!
    echo Por favor, baixe e instale o Node.js em: https://nodejs.org/
    echo.
    pause
    exit /b
)

echo Iniciando servidor local...
node print-agent.js
pause
