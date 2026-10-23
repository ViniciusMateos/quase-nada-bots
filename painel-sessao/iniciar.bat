@echo off
rem App web dos Quase Nada Bots: http://quase-nada-bots.localhost
rem Ele ja liga sozinho com o PC (QuaseNada-PainelWeb.vbs no Iniciar) e volta se cair.
rem Este atalho garante o supervisor rodando e abre o endereco no navegador.
cd /d "%~dp0"
start "" "C:\Users\vinim\AppData\Local\Programs\Python\Python312\pythonw.exe" "%~dp0supervisor_painel.py"
timeout /t 4 /nobreak >nul
start "" http://quase-nada-bots.localhost
