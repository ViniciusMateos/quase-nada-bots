@echo off
rem Recompila o app pra web (depois de mudar o codigo do app). Gera frontend\dist-web,
rem que o painel serve em http://127.0.0.1:8777. Duplo-clique quando quiser atualizar.
cd /d "%~dp0\..\frontend"
echo Recompilando o app pra web (pode levar ~1-2 min)...
call npx expo export --platform web --output-dir dist-web
echo.
echo Pronto. Reinicie o painel (iniciar.bat) se ele estiver aberto.
pause
