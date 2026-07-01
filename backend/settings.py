"""
Configuração do backend "Quase Nada Bots".

Orquestra os bots (workers) como subprocessos e faz stream do log via WebSocket.
Valores sensíveis vêm de variáveis de ambiente (.env na Oracle).
"""
import os
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent
# os workers ficam ao lado: ig-automations-hub/workers/<bot>/
WORKERS_DIR = Path(os.environ.get("WORKERS_DIR", BASE.parent / "workers")).resolve()

# Python que roda os bots (na Oracle, aponte pro venv com playwright instalado)
PYTHON_BIN = os.environ.get("PYTHON_BIN", sys.executable)

# Token simples de API (MVP). Depois evolui pra JWT como o lembretes.
API_TOKEN = os.environ.get("BOTS_API_TOKEN", "troca-esse-token-na-oracle")

# Buffer de log por run (linhas mantidas em memória p/ quem conectar depois)
MAX_LOG_LINES = int(os.environ.get("MAX_LOG_LINES", "3000"))
