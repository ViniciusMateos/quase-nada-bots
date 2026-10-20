"""
Serviço: contas do story-repost (no emulador) + verificação de sessão (read-only).

Roda o `story_contas.py` — que mora NO dir do story-poster e usa o MESMO venv dos bots — como
SUBPROCESSO e lê o JSON do stdout. O script é quem fala com o IG (precisa da instagrapi + do
proxy residencial que vivem lá); o backend só orquestra e cacheia.

Por que subprocesso (e não importar): o story-poster é outro projeto/dir, com a instagrapi e as
sessões dele. Chamá-lo por fora mantém o backend desacoplado do IG e não trava o event loop.
Blindado: qualquer falha (timeout, JSON inválido, script ausente) vira a lista das contas com
viva=null — o endpoint NUNCA estoura 500.
"""
import json
import os
import re
import subprocess
import time

# dir do story-poster no server (tem story_contas.py, contas.json, ig_sessions/)
STORY_DIR = os.environ.get("STORY_DIR", "/home/ubuntu/story-poster-qn")
# python do venv COMPARTILHADO dos bots (tem instagrapi) — o story-poster não tem venv próprio
STORY_VENV_PY = os.environ.get("STORY_VENV_PY", "/home/ubuntu/quase_nada_bots/venv/bin/python")
_SCRIPT = "story_contas.py"
_TIMEOUT = int(os.environ.get("STORY_CONTAS_TIMEOUT", "45"))

# fallback fixo: as 4 contas do story-repost, caso nem o contas.json dê pra ler
_CONTAS_FIXAS = ["quasenadasegue6", "quasenadasegue10", "quasenadasegue12", "quasenadasegue15"]

# cache curto: cada chamada sobe um python e bate no IG por conta (~segundos pelo proxy
# residencial). Sem cache, cada abrir/navegar no app refazia o sweep inteiro. force=True ignora
# (pull-to-refresh / "acabei de reconectar e quero ver na hora"). Mesmo espírito do
# accounts.validar_todas.
_TTL = 60
_cache = {"t": 0.0, "res": None}


def _nat(s):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", s)]


def _usuarios_do_contas():
    """Usernames do contas.json do story-poster (ignora chaves '_'), ordem natural. Fallback pra
    lista fixa se o arquivo não der pra ler — o endpoint SEMPRE devolve as contas."""
    try:
        with open(os.path.join(STORY_DIR, "contas.json"), encoding="utf-8") as f:
            d = json.load(f)
        us = sorted([k for k in d if not str(k).startswith("_")], key=_nat)
        return us or list(_CONTAS_FIXAS)
    except Exception:
        return list(_CONTAS_FIXAS)


def _fallback():
    """Contas com viva=desconhecida (None) — quando o subprocesso falha/timeout/JSON inválido."""
    return [{"username": u, "viva": None, "ultimo_post": None} for u in _usuarios_do_contas()]


def _rodar():
    """Sobe o story_contas.py no venv dos bots e devolve a lista do contrato (ou o fallback)."""
    script = os.path.join(STORY_DIR, _SCRIPT)
    try:
        r = subprocess.run(
            [STORY_VENV_PY, script],
            cwd=STORY_DIR, capture_output=True, text=True, timeout=_TIMEOUT,
            env={**os.environ, "PYTHONUTF8": "1"},
        )
        data = json.loads((r.stdout or "").strip())
        if not isinstance(data, list):
            raise ValueError("saída do script não é uma lista")
        out = []
        for it in data:                               # normaliza: só os campos do contrato
            if not isinstance(it, dict) or not it.get("username"):
                continue
            viva = it.get("viva")
            up = it.get("ultimo_post")
            out.append({
                "username": str(it["username"]),
                "viva": viva if isinstance(viva, bool) else None,
                "ultimo_post": int(up) if isinstance(up, (int, float)) and not isinstance(up, bool) else None,
            })
        return out or _fallback()
    except Exception as e:
        print(f"[story_contas_svc] subprocesso falhou: {type(e).__name__}: {e}", flush=True)
        return _fallback()


def listar(force=False):
    """Contas do story-repost + verificação de sessão. Cacheia ~60s; force ignora o cache.
    Blindado: nunca levanta (pior caso devolve o fallback com viva=null)."""
    global _cache
    agora = time.time()
    if not force and _cache["res"] is not None and (agora - _cache["t"]) < _TTL:
        return _cache["res"]
    res = _rodar()
    _cache = {"t": agora, "res": res}
    return res


# ─────────────────── senhas das contas-vitrine (contas.json do story-poster) ───────────────────
# O contas.json aceita entrada STRING ({user: "senha"}) ou DICT ({user: {senha, totp, …}}). Estas
# funções leem/escrevem preservando a forma — pra reconectar uma conta cuja senha mudou (TAREFA 3)
# e pra enfileirar o login no emulador com a senha certa (TAREFA 4). NUNCA logar a senha.
def _contas_path():
    return os.path.join(STORY_DIR, "contas.json")


def _senha_de(valor):
    """Extrai a senha de uma entrada do contas.json (string direta ou dict {senha|password})."""
    if isinstance(valor, str):
        return valor
    if isinstance(valor, dict):
        return valor.get("senha") or valor.get("password") or ""
    return ""


def carregar_senhas():
    """{user: senha} de todas as contas-vitrine (resolve forma string e dict; ignora chaves '_').
    USO INTERNO (enfileirar login no emulador) — NUNCA logar o retorno. Blindado: {} se falhar."""
    out = {}
    try:
        with open(_contas_path(), encoding="utf-8") as f:
            d = json.load(f)
        if isinstance(d, dict):
            for k, v in d.items():
                if str(k).startswith("_"):
                    continue
                out[str(k)] = _senha_de(v)
    except Exception:
        pass
    return out


def atualizar_senha(user, senha):
    """Atualiza (ou cria) a senha de uma conta-vitrine no contas.json do story-poster. Preserva a
    FORMA existente: entrada dict ({senha, totp, …}) só troca a senha (mantém o totp); entrada
    string ou inexistente vira string simples {user: senha}. NUNCA loga a senha. Permite reconectar
    uma conta cuja senha mudou na recuperação. Devolve {user, criada}.

    NÃO clobbera um contas.json corrompido: se o JSON existir mas não parsear, levanta (não grava
    por cima) — melhor estourar 500 do que apagar as senhas das outras contas."""
    u = (user or "").strip().lstrip("@")
    s = senha or ""
    if not u or not s:
        raise ValueError("informe o user e a senha")
    path = _contas_path()
    d = {}
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            d = json.load(f)        # deixa estourar se corrompido — não sobrescreve o arquivo bom
        if not isinstance(d, dict):
            raise ValueError("contas.json não é um objeto")
    criada = u not in d
    atual = d.get(u)
    if isinstance(atual, dict):
        atual["senha"] = s          # preserva totp/outros; só troca a senha
        atual.pop("password", None)  # normaliza (evita senha antiga sobrando em 'password')
        d[u] = atual
    else:
        d[u] = s                    # string simples {user: senha}
    with open(path, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=1)
    return {"user": u, "criada": criada}
