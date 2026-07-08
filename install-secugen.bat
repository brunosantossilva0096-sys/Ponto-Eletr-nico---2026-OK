@echo off
title Instalação do Biométrico SecuGen U20 - Ponto Eletrônico
chcp 65001 >nul

:: =====================================================================
:: Verificação e Autoelevação para Administrador
:: =====================================================================
net session >nul 2>&1
if %errorLevel% == 0 (
    goto :START_INSTALL
) else (
    echo ============================================================
    echo [AVISO] Este script precisa de privilégios de Administrador.
    echo Tentando solicitar permissão de Administrador...
    echo ============================================================
    powershell -Command "Start-Process -FilePath '%~fnx0' -Verb RunAs"
    exit /b
)

:START_INSTALL
:: Mudar para o diretório atual do script (evita erros ao executar como Admin)
cd /d "%~dp0"

cls
echo =====================================================================
echo    INSTALADOR AUTOMÁTICO - SECUGEN U20 E SERVIDOR DE PONTO
echo =====================================================================
echo.
echo Este script irá configurar o suporte ao leitor biométrico SecuGen U20
echo e instalar as dependências do servidor em seu computador.
echo.
echo Pressione qualquer tecla para começar...
pause >nul

:: =====================================================================
:: Passo 1: Verificar Node.js
:: =====================================================================
echo.
echo [1/3] Verificando instalação do Node.js...
node -v >nul 2>&1
if %errorLevel% neq 0 (
    echo.
    echo [ERRO] O Node.js não foi encontrado neste sistema.
    echo Por favor, baixe e instale o Node.js em: https://nodejs.org/
    echo Depois de instalar, feche esta janela e execute o script novamente.
    echo.
    pause
    exit /b
)
echo [OK] Node.js detectado.

:: =====================================================================
:: Passo 2: Instalar Dependências NPM
:: =====================================================================
echo.
echo [2/3] Instalando dependências do projeto (npm install)...
call npm install
if %errorLevel% neq 0 (
    echo [ERRO] Falha ao executar 'npm install'. Verifique sua conexão.
    pause
    exit /b
)
echo [OK] Dependências do Node.js instaladas com sucesso.

:: =====================================================================
:: Passo 3: Instalar Drivers do SecuGen U20
:: =====================================================================
echo.
echo [3/3] Instalando drivers do leitor biométrico SecuGen U20...
if not exist "drivers\sgdrvsetupu20x64.msi" (
    echo [ERRO] Arquivo de driver "drivers\sgdrvsetupu20x64.msi" não encontrado.
    echo Certifique-se de que a pasta "drivers" com o arquivo MSI está no mesmo diretório deste script.
    pause
    exit /b
)

echo Iniciando o instalador MSI silencioso...
msiexec /i "drivers\sgdrvsetupu20x64.msi" /passive /norestart
if %errorLevel% neq 0 (
    echo [ERRO] Falha ao instalar os drivers do SecuGen. Código de saída: %errorLevel%
    pause
    exit /b
)
echo [OK] Drivers instalados ou atualizados com sucesso.

:: =====================================================================
:: Conclusão e Execução
:: =====================================================================
echo.
echo =====================================================================
echo    ✅ INSTALAÇÃO CONCLUÍDA COM SUCESSO!
echo =====================================================================
echo.
echo Instruções:
echo 1. Conecte o leitor biométrico SecuGen U20 em uma porta USB.
echo 2. Execute 'npm run server' para iniciar o servidor de biometria.
echo.
set /p CHOICE="Deseja iniciar o servidor biométrico agora? (S/N): "
if /i "%CHOICE%"=="S" (
    echo.
    echo Iniciando o servidor...
    npm run server
) else (
    echo.
    echo Instalação finalizada. Você pode rodar 'npm run server' quando desejar.
    pause
)
