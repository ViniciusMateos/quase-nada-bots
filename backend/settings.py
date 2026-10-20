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

# ── story-repost: roda via o story_poster.py do story-poster-qn (posta as peças-vitrine no story
# via instagrapi + proxy residencial), NÃO pelo worker de cookie. Dir do projeto + python do venv
# COMPARTILHADO dos bots (o story-poster não tem venv próprio) + proxy default. Override por env.
# Mesmos env/defaults do story_contas_svc.py (STORY_DIR/STORY_VENV_PY) pra não sair de sincronia.
STORY_DIR = os.environ.get("STORY_DIR", "/home/ubuntu/story-poster-qn")
STORY_VENV_PY = os.environ.get("STORY_VENV_PY", "/home/ubuntu/quase_nada_bots/venv/bin/python")
STORY_PROXY = os.environ.get("STORY_PROXY", "socks5://127.0.0.1:1080")

# ── reconectar conta-vitrine: dir onde o código de verificação (challenge) é gravado pro
# ig_auth do story-poster LER no login do SERVER (story_poster.py --login). É o MESMO path do
# ig_auth.CODIGOS_DIR (STORY_DIR/codigos). O POST /contas/codigo grava codigos/<user>.txt aqui.
# Override por env. STORY_DIR é resolvido acima.
CODIGOS_DIR = os.environ.get("CODIGOS_DIR", os.path.join(STORY_DIR, "codigos"))
