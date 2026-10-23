"""
Registro dos bots e montagem da linha de comando de cada run.

Cada bot é um worker em ig-automations-hub/workers/<dir>/, rodado como
`python main.py <flags>`. Aqui a gente só descreve cada um e traduz os
parâmetros vindos da API em flags da CLI.
"""
import json

from settings import WORKERS_DIR

# `target` = ONDE o bot roda:
#   "server"   → subprocesso `python main.py` nesta máquina (comportamento histórico)
#   "emulador" → NÃO roda aqui; o backend ENFILEIRA um job que o "agente do PC" (emulador
#                LDPlayer tocando no app real) consome, executa e reporta de volta via
#                /emulador/*. A run aparece no app igual a uma normal (logs, progresso, LA).
# Default implícito é "server" (ver bots.target) pra qualquer bot sem o campo.
BOTS = {
    "auto-follow": {
        "nome": "Auto Follow", "dir": "auto-follow-instagram", "target": "emulador",
        "tem_modos": True, "tem_chats": True, "tem_ig": True,
        "descricao": "Segue os curtidores dos posts compartilhados num chat.",
    },
    # 19/10/2026: DM roda no EMULADOR (bots/dm_follow.py do quase-nada-bots-device, mesma lógica
    # deste worker). O dir segue apontando pro worker só pra ler os MODOS (perfis.json).
    "dm-followers": {
        "nome": "DM Followers", "dir": "dm-followers-instagram", "target": "emulador",
        "tem_modos": True, "tem_chats": False, "tem_ig": True,
        "descricao": "Manda DM pros novos seguidores.",
    },
    "human-warmup": {
        "nome": "Aquecimento Humano", "dir": "human-warmup-instagram", "target": "server",
        "tem_modos": True, "tem_chats": False, "tem_ig": True,
        "descricao": "Navega como gente (feed, story, curtidas) pra aquecer a conta.",
    },
    "like-repost": {
        "nome": "Like + Repost", "dir": "like-repost-instagram", "target": "server",
        "tem_modos": True, "tem_chats": False, "tem_ig": True,
        "descricao": "Curte (e reposta) os posts de uma conta-alvo — ex: o drop do brechó.",
    },
    # 20/10/2026: story da conta do BRECHÓ pelo app de verdade, numa instância do MuMu só dele (o
    # story pela API do server tomou "restricted from uploading"). O dir só guarda os MODOS.
    "story-brecho": {
        "nome": "Story Repost", "dir": "story-brecho-emulador", "target": "emulador",
        "tem_modos": True, "tem_chats": False, "tem_ig": False,
        "descricao": "Posta as peças disponíveis no story do brechó pelo app (repost do post + fundo, etiqueta e chamada).",
    },
    "story-repost": {
        "nome": "Story Repost (antigo)", "dir": "story-repost-instagram", "target": "server",
        "tem_modos": True, "tem_chats": False, "tem_ig": True,
        "descricao": "Reposta peças disponíveis do brechó no story das contas-vitrine (aleatório ou drop novo).",
    },
}

# arquivo (dentro do dir do worker) onde a sessão importada do IG é gravada
COOKIES_FILE = "imported_cookies.json"


def existe(bot_id):
    return bot_id in BOTS


def target(bot_id):
    """Onde o bot roda: "server" (subprocesso local, default) ou "emulador" (job na fila
    consumido pelo agente do PC). Qualquer bot sem o campo cai em "server" (retrocompat)."""
    return BOTS.get(bot_id, {}).get("target", "server")


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
    if p.get("start_after"):                      # auto-follow
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


# Modos padrão dos bots do EMULADOR (20/10/2026 — reformulados pro bot que navega no app real).
# Semeiam o perfis.json quando ele não existe; o agente do PC usa os mesmos valores como default.
MODOS_PADRAO_EMULADOR = {
    "auto-follow": {
        "padrão": {"limite_follows_conta": 80, "max_posts_conta": 0, "delay_follow": [2, 5],
                   "pausa_longa_cada": 15, "pausa_longa": [30, 90], "delay_post": [120, 300],
                   "pausa_entre_contas": [90, 240], "teto_follows_lote": 0,
                   "parar_lote_apos_softblocks": 2, "cooldown_softblock_h": 12},
        "calmo": {"limite_follows_conta": 40, "max_posts_conta": 3, "delay_follow": [5, 12],
                  "pausa_longa_cada": 10, "pausa_longa": [60, 180], "delay_post": [240, 480],
                  "pausa_entre_contas": [300, 600], "teto_follows_lote": 250,
                  "parar_lote_apos_softblocks": 1, "cooldown_softblock_h": 24},
        "agressivo": {"limite_follows_conta": 0, "max_posts_conta": 0, "delay_follow": [1, 3],
                      "pausa_longa_cada": 0, "pausa_longa": [0, 0], "delay_post": [60, 150],
                      "pausa_entre_contas": [0, 0], "teto_follows_lote": 0,
                      "parar_lote_apos_softblocks": 2, "cooldown_softblock_h": 6},
    },
    "dm-followers": {
        "seguro": {"max_dms_por_conta": 6, "max_dms_hora": 6, "max_dms_dia": 15, "primeira_vez_n": 10,
                   "idade_max_dias": 3, "ordem": "recentes", "delay_dm": [40, 90], "delay_acao_ui": [1.5, 4],
                   "pausa_longa_cada": 3, "pausa_longa": [300, 600], "pausa_humana_cada": 4,
                   "pausa_entre_contas": [180, 420], "resfriar_conta_h": 48, "mensagens": []},
        "padrão": {"max_dms_por_conta": 10, "max_dms_hora": 10, "max_dms_dia": 30, "primeira_vez_n": 20,
                   "idade_max_dias": 7, "ordem": "recentes", "delay_dm": [20, 60], "delay_acao_ui": [1.5, 4],
                   "pausa_longa_cada": 5, "pausa_longa": [180, 420], "pausa_humana_cada": 6,
                   "pausa_entre_contas": [90, 240], "resfriar_conta_h": 24, "mensagens": []},
        "manutenção": {"max_dms_por_conta": 15, "max_dms_hora": 12, "max_dms_dia": 40, "primeira_vez_n": 20,
                       "idade_max_dias": 2, "ordem": "recentes", "delay_dm": [10, 30], "delay_acao_ui": [1.5, 4],
                       "pausa_longa_cada": 8, "pausa_longa": [120, 300], "pausa_humana_cada": 8,
                       "pausa_entre_contas": [60, 150], "resfriar_conta_h": 24, "mensagens": []},
    },
    # video_intro: abre com o vídeo "confiram as peças disponíveis no destaque" antes das peças
    # (o do brechó usa; as segue não) — 20/10/2026
    "story-brecho": {
        "brechó com abertura": {"quantos_posts": 10, "fundo": "laranja", "mostrar_preco": True,
                                "chamada": "", "video_intro": True, "pausa_story": [3, 8],
                                "tentativas_por_peca": 2, "manter_ligado": False},
        "10 stories": {"quantos_posts": 10, "fundo": "laranja", "mostrar_preco": True, "chamada": "",
                       "video_intro": False, "pausa_story": [3, 8], "tentativas_por_peca": 2,
                       "manter_ligado": False},
        "5 stories": {"quantos_posts": 5, "fundo": "laranja", "mostrar_preco": True, "chamada": "",
                      "video_intro": False, "pausa_story": [3, 8], "tentativas_por_peca": 2,
                      "manter_ligado": False},
        "rápido": {"quantos_posts": 5, "fundo": "instagram", "mostrar_preco": True, "chamada": "",
                   "video_intro": False, "pausa_story": [0, 0], "tentativas_por_peca": 1,
                   "manter_ligado": False},
    },
}


def _seed_modos(bot_id):
    """Modos default do worker (padrao/agressivo/calmo). Reusa o `_default_perfis` do próprio
    worker (sem rodá-lo) pra não duplicar valores nem sair do sincronismo."""
    try:
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            f"_perfis_seed_{bot_id}", str(bot_dir(bot_id) / "perfis.py"))
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return mod._default_perfis()
    except Exception:
        return {}


def ler_modos(bot_id):
    # 1ª vez (perfis.json não existe): semeia os modos default e persiste — assim o "padrão"
    # é um modo REAL na lista, editável e apagável. Depois disso o arquivo manda: apagar um
    # modo é permanente (não volta), mesmo que a lista fique vazia.
    if not (bot_dir(bot_id) / "perfis.json").exists():
        seed = _seed_modos(bot_id)
        if seed:
            gravar_modos(bot_id, seed)
            return seed
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
