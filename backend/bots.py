"""
Registro dos bots e montagem da linha de comando de cada run.

Cada bot é um worker em ig-automations-hub/workers/<dir>/, rodado como
`python main.py <flags>`. Aqui a gente só descreve cada um e traduz os
parâmetros vindos da API em flags da CLI.
"""
import json

from settings import WORKERS_DIR

BOTS = {
    "auto-like": {
        "nome": "Auto Likes", "dir": "auto-like-instagram",
        "tem_modos": True, "tem_chats": True,
        "descricao": "Segue os curtidores dos posts compartilhados num chat.",
    },
    "dm-followers": {
        "nome": "DM Followers", "dir": "dm-followers",
        "tem_modos": True, "tem_chats": False,
        "descricao": "Manda DM pros novos seguidores.",
    },
    "brecho-tracker": {
        "nome": "Brechó", "dir": "brecho-tracker",
        "tem_modos": False, "tem_chats": False,
        "descricao": "Raspa o brechó e atualiza a planilha.",
    },
}


def existe(bot_id):
    return bot_id in BOTS


def bot_dir(bot_id):
    return WORKERS_DIR / BOTS[bot_id]["dir"]


def montar_cmd(bot_id, params):
    """Traduz params (dict da API) em argumentos da CLI do bot."""
    b = BOTS[bot_id]
    args = ["main.py"]
    p = params or {}
    if p.get("dry_run"):
        args.append("--dry-run")
    if b["tem_modos"] and p.get("modo"):
        args += ["--modo", str(p["modo"])]
    if b["tem_chats"] and p.get("chat"):
        args += ["--chat", str(p["chat"])]
    if p.get("limite") is not None:
        args += ["--limite", str(p["limite"])]
    if p.get("start_from"):                       # dm-followers
        args += ["--start-from", str(p["start_from"])]
    if p.get("start_after"):                      # auto-like
        args += ["--start-after", str(p["start_after"])]
    if p.get("full"):                             # brecho
        args.append("--full")
    if p.get("rematch"):                          # brecho
        args.append("--rematch")
    for x in p.get("extra", []) or []:
        args.append(str(x))
    return args


# ───────────── modos (perfis.json) e chats (chats.json) ─────────────
def _ler_json(bot_id, nome, default):
    f = bot_dir(bot_id) / nome
    if f.exists():
        try:
            return json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            pass
    return default


def _gravar_json(bot_id, nome, data):
    f = bot_dir(bot_id) / nome
    f.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def ler_modos(bot_id):
    return _ler_json(bot_id, "perfis.json", {})


def gravar_modos(bot_id, data):
    _gravar_json(bot_id, "perfis.json", data)


def ler_chats(bot_id):
    return _ler_json(bot_id, "chats.json", [])


def gravar_chats(bot_id, data):
    _gravar_json(bot_id, "chats.json", data)
