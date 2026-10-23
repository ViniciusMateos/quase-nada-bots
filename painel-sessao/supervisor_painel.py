#!/usr/bin/env python3
"""Supervisor do APP WEB (painel-sessao) — deixa http://quase-nada-bots.localhost sempre no ar.

Sobe o painel_sessao.py (sem abrir navegador) e RE-SOBE se ele cair, com espera crescente
(5s → 60s) pra não ficar em loop se algo quebrar de vez. Se o painel já estiver respondendo
(ex: alguém rodou o iniciar.bat antigo), só fica olhando.

Liga no BOOT do PC: um .vbs no Startup do Windows (QuaseNada-PainelWeb.vbs) roda este arquivo
escondido (pythonw). Logs: painel.log (saída do painel) e supervisor_painel.log.
Pra atualizar o código do painel: edite e mate o processo do painel_sessao.py — ele volta sozinho.
"""
import datetime
import os
import subprocess
import sys
import time
import urllib.request

AQUI = os.path.dirname(os.path.abspath(__file__))
PAINEL = os.path.join(AQUI, "painel_sessao.py")
LOG = os.path.join(AQUI, "supervisor_painel.log")
LOG_PAINEL = os.path.join(AQUI, "painel.log")
# o pythonw não tem console: o painel roda no python.exe (mesma pasta), escondido
PY = os.path.join(os.path.dirname(sys.executable), "python.exe")
if not os.path.exists(PY):
    PY = sys.executable
SEM_JANELA = 0x08000000 if os.name == "nt" else 0


def log(msg):
    linha = f"[{datetime.datetime.now():%d/%m %H:%M:%S}] {msg}"
    try:
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(linha + "\n")
    except Exception:
        pass


def no_ar():
    """O painel já responde (porta 80 ou a reserva 8777)?"""
    for url in ("http://127.0.0.1/", "http://127.0.0.1:8777/"):
        try:
            with urllib.request.urlopen(url, timeout=3) as r:
                if r.status == 200:
                    return True
        except Exception:
            pass
    return False


def main():
    # um supervisor só: a porta-trava fica presa enquanto este processo vive
    import socket
    trava = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        trava.bind(("127.0.0.1", 47877))
    except OSError:
        return   # já tem outro supervisor cuidando
    log("supervisor do painel no ar")
    espera = 5
    while True:
        if no_ar():
            time.sleep(30)
            continue
        log("subindo o painel…")
        env = dict(os.environ, QN_PANEL_NO_BROWSER="1", PYTHONIOENCODING="utf-8")
        t0 = time.time()
        try:
            with open(LOG_PAINEL, "a", encoding="utf-8") as out:
                proc = subprocess.Popen([PY, PAINEL], cwd=AQUI, env=env, stdout=out,
                                        stderr=subprocess.STDOUT, creationflags=SEM_JANELA)
                proc.wait()
            log(f"o painel saiu (código {proc.returncode})")
        except Exception as e:
            log(f"não consegui subir o painel: {e}")
        # caiu logo de cara → espera mais antes de tentar de novo; rodou um tempo → volta rápido
        espera = 5 if time.time() - t0 > 120 else min(espera * 2, 60)
        time.sleep(espera)


if __name__ == "__main__":
    main()
