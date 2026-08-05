@echo off
echo Configurando o Servidor Ponto para iniciar com o Windows...

set "SCRIPT_DIR=%~dp0"
set "VBS_FILE=%SCRIPT_DIR%iniciar_oculto.vbs"
set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_VBS=%TEMP%\CreateShortcut.vbs"

:: Verifica se o arquivo oculto existe
if not exist "%VBS_FILE%" (
    echo Erro: iniciar_oculto.vbs nao encontrado na pasta!
    pause
    exit /b
)

:: Cria um script VBS temporario para gerar o atalho .lnk na pasta Startup
echo Set oWS = WScript.CreateObject("WScript.Shell") > "%SHORTCUT_VBS%"
echo sLinkFile = "%STARTUP_FOLDER%\Servidor_Ponto.lnk" >> "%SHORTCUT_VBS%"
echo Set oLink = oWS.CreateShortcut(sLinkFile) >> "%SHORTCUT_VBS%"
echo oLink.TargetPath = "%VBS_FILE%" >> "%SHORTCUT_VBS%"
echo oLink.WorkingDirectory = "%SCRIPT_DIR%" >> "%SHORTCUT_VBS%"
echo oLink.Save >> "%SHORTCUT_VBS%"

:: Executa o criador de atalho e o apaga em seguida
cscript /nologo "%SHORTCUT_VBS%"
del "%SHORTCUT_VBS%"

echo.
echo Fechando servidores antigos (se houver)...
taskkill /F /IM Servidor_Ponto.exe >nul 2>&1

echo.
echo Iniciando o servidor em segundo plano agora...
start "" "%VBS_FILE%"

echo.
echo =========================================================
echo PRONTO! O servidor agora esta rodando invisivel.
echo Toda vez que voce ligar o computador, ele iniciara sozinho.
echo =========================================================
pause
