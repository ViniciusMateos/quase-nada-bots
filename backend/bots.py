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
        "tem_modos": True, "tem_chats": True, "tem_ig": True,
        "descricao": "Segue os curtidores dos posts compartilhados num chat.",
    },
    "dm-followers": {
        "nome": "DM Followers", "dir": "dm-followers",
        "tem_modos": True, "tem_chats": False, "tem_ig": True,
        "descricao": "Manda DM pros novos seguidores.",
    },
}

# arquivo (dentro do dir do worker) onde a sessão importada do IG é gravada
COOKIES_FILE = "imported_cookies.json"


def existe(bot_id):
    return bot_id in BOTS


def bot_dir(bot_id):
    return WORKERS_DIR / BOTS[bot_id]["dir"]


def bots_ig():
    """IDs dos bots que usam sessão do Instagram (aceitam --import-cookies)."""
    return [bid for bid, b in BOTS.items() if b.get("tem_ig")]


def salvar_cookies_ig(bot_id, cookies):
    """Grava os cookies (lista, formato Cookie-Editor) no dir do worker. Devolve o
    nome do arquivo (relativo — a run roda com cwd = dir do worker)."""
    (bot_dir(bot_id) / COOKIES_FILE).write_text(
        json.dumps(cookies, ensure_ascii=False, indent=2), encoding="utf-8")
    return COOKIES_FILE


def montar_cmd(bot_id, params):
    """Traduz params (dict da API) em argumentos da CLI do bot."""
    b = BOTS[bot_id]
    p = params or {}
    if p.get("import_cookies"):                    # conectar IG: só importa e sai
        return ["main.py", "--import-cookies", str(p["import_cookies"])]
    args = ["main.py"]
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


_PROXY_DEFAULT = {"enabled": False, "server": "", "username": "", "password": ""}


def ler_proxy(bot_id):
    p = _ler_json(bot_id, "proxy.json", {})
    return {**_PROXY_DEFAULT, **(p if isinstance(p, dict) else {})}


def gravar_proxy(bot_id, data):
    d = data if isinstance(data, dict) else {}
    _gravar_json(bot_id, "proxy.json", {
        "enabled": bool(d.get("enabled")),
        "server": str(d.get("server", "")).strip(),
        "username": str(d.get("username", "")).strip(),
        "password": str(d.get("password", "")),
    })
