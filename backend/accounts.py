"""
Contas de Instagram salvas.

Cada conta guarda a PRÓPRIA sessão (cookies) em `sessions/<id>.json`, onde <id> é o
`ds_user_id` da conta. Uma conta é a ATIVA — a sessão dela é copiada pro
`session_cookies.json` central (o `IG_SESSION_FILE` que TODOS os bots leem).

Isso permite ter várias contas cadastradas e trocar a ativa sem relogar (sem senha,
sem captcha — cada conta foi conectada uma vez pelo webview e teve os cookies salvos).

Índice em `sessions/accounts.json`: {"ativa": <id|null>, "contas": [{id, label, conectada_em}]}.
"""
import json
import os
import subprocess
import time
from pathlib import Path

from settings import WORKERS_DIR

# checagem de sessão: sai pelo MESMO túnel/IP dos bots (socks), nunca pelo IP do server
_VALIDAR_SOCKS = os.environ.get("IG_VALIDAR_SOCKS", "127.0.0.1:1080")
_VALIDAR_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
               "(KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36")

_RAIZ = WORKERS_DIR.parent                     # ~/quase_nada_bots
_SESS_DIR = _RAIZ / "sessions"
_INDEX = _SESS_DIR / "accounts.json"
_CENTRAL = _RAIZ / "session_cookies.json"      # o que os bots leem (default do IG_SESSION_FILE)


def _garantir_dir():
    _SESS_DIR.mkdir(parents=True, exist_ok=True)


def _ler_index():
    try:
        d = json.loads(_INDEX.read_text(encoding="utf-8"))
        if isinstance(d, dict) and isinstance(d.get("contas"), list):
            return d
    except Exception:
        pass
    return {"ativa": None, "contas": []}


def _gravar_index(d):
    _garantir_dir()
    _INDEX.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")


def _ds_user_id(cookies):
    for c in cookies or []:
        if str(c.get("name")) == "ds_user_id":
            v = str(c.get("value") or "").strip()
            if v:
                return v
    return None


def _sess_path(uid):
    return _SESS_DIR / f"{uid}.json"


def profile_dir(uid):
    """Diretório do browser_profile DESTA conta — device isolado pro IG (evita que conectar/rodar
    uma conta mate a sessão das outras)."""
    return str(_SESS_DIR / f"profile_{uid}")


def sessao_path(uid):
    """Caminho do arquivo de sessão DESTA conta (str) se existir, senão None. É o que o
    run_manager aponta em IG_SESSION_FILE pra rodar uma conta específica (lote) sem precisar
    trocar a ativa — cada run lê a sessão da SUA conta, sem corrida no arquivo central."""
    f = _sess_path(uid)
    return str(f) if f.exists() else None


def ativa_id():
    """Id (ds_user_id) da conta ativa, ou None."""
    return _migrar_sessao_existente(_ler_index()).get("ativa")


def _escrever_central(uid):
    """Copia a sessão da conta <uid> pro arquivo central que os bots leem."""
    f = _sess_path(uid)
    if not f.exists():
        return False
    _CENTRAL.write_text(f.read_text(encoding="utf-8"), encoding="utf-8")
    try:
        _CENTRAL.chmod(0o600)   # é credencial: só o dono lê
    except Exception:
        pass
    return True


def _migrar_sessao_existente(idx):
    """Se já existe um session_cookies.json (sessão de ANTES deste recurso) e nenhuma conta
    está registrada, adota ela como 'conta atual' pra não sumir do controle do usuário."""
    if idx.get("contas") or not _CENTRAL.exists():
        return idx
    try:
        cks = json.loads(_CENTRAL.read_text(encoding="utf-8"))
    except Exception:
        return idx
    uid = _ds_user_id(cks) or "atual"
    try:
        _garantir_dir()
        _sess_path(uid).write_text(json.dumps(cks, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:
        return idx
    idx = {"ativa": uid, "contas": [{"id": uid, "label": "conta atual", "conectada_em": int(time.time())}]}
    _gravar_index(idx)
    return idx


def listar():
    """Lista as contas salvas, marcando qual é a ativa. Preenche defaults de contas antigas
    (criada_em cai pro conectada_em). `tier` foi removido do produto → nunca sai na resposta,
    mesmo que ainda exista no arquivo de contas antigo."""
    idx = _migrar_sessao_existente(_ler_index())
    ativa = idx.get("ativa")
    out = []
    for c in idx.get("contas", []):
        item = {k: v for k, v in c.items() if k != "tier"}
        item["ativa"] = c.get("id") == ativa
        item["criada_em"] = c.get("criada_em") or c.get("conectada_em")
        out.append(item)
    return out


def existe(uid):
    """True se a conta ainda está cadastrada (não foi removida do índice). Usado pra não tentar
    rodar/reconectar no cronograma uma conta que o usuário deletou."""
    if not uid:
        return False
    return any(c.get("id") == uid for c in listar())


def _cookie_header(uid):
    f = _sess_path(uid)
    if not f.exists():
        return None
    try:
        cks = json.loads(f.read_text(encoding="utf-8"))
    except Exception:
        return None
    hdr = "; ".join(f"{c['name']}={c['value']}" for c in cks
                    if c.get("name") and c.get("value"))
    return hdr if "sessionid=" in hdr else None


def validar(uid, timeout=12):
    """True se a sessão do IG dessa conta AINDA está viva. Checa via HTTP leve (sem browser),
    pelo MESMO túnel/IP dos bots (socks) — checar pelo IP do server faria a sessão 'pular' pra
    um datacenter e o IG poderia MATÁ-LA. /accounts/edit/ → 200 logado, 302 (login) = caiu."""
    hdr = _cookie_header(uid)
    if not hdr:
        return False
    cmd = ["curl", "-s", "-o", os.devnull, "-w", "%{http_code}", "--max-time", str(timeout),
           "--socks5-hostname", _VALIDAR_SOCKS,
           "-H", f"Cookie: {hdr}", "-H", f"User-Agent: {_VALIDAR_UA}",
           "https://www.instagram.com/accounts/edit/"]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout + 6)
        return r.stdout.strip() == "200"
    except Exception:
        return False


# cache curto do resultado do validar_todas: cada check é 1 request pelo túnel residencial
# (duplo-hop), então 10 contas custam ~5s. Sem cache, cada abrir/trocar de tela do app refazia
# o sweep inteiro. Com TTL curto, reabrir/navegar fica instantâneo; pull-to-refresh passa
# force=True e refaz de verdade (ex: acabei de reconectar uma conta e quero ver na hora).
_VALIDAR_TTL = 60
_validar_cache = {"t": 0.0, "res": {}}


def validar_todas(force=False):
    """Valida TODAS as contas em paralelo (rápido). Retorna {uid: bool}. Cacheia por
    `_VALIDAR_TTL`s; `force=True` ignora o cache e refaz o check."""
    global _validar_cache
    agora = time.time()
    if not force and _validar_cache["res"] and (agora - _validar_cache["t"]) < _VALIDAR_TTL:
        return _validar_cache["res"]
    from concurrent.futures import ThreadPoolExecutor
    ids = [c.get("id") for c in listar() if c.get("id")]
    if not ids:
        return {}
    with ThreadPoolExecutor(max_workers=min(10, len(ids))) as ex:
        res = dict(zip(ids, ex.map(validar, ids)))
    _validar_cache = {"t": agora, "res": res}
    return res


def _slug(label):
    s = "".join(ch for ch in (label or "").lower() if ch.isalnum())
    return s or "conta"


def eh_pendente(uid):
    """True se a conta <uid> é uma PENDENTE (adicionada sem conectar, sem sessão)."""
    return any(c.get("id") == uid and c.get("pendente") for c in listar())


def adicionar_pendente(label):
    """Registra uma conta PENDENTE — só o @, SEM sessão nem senha. Serve pra a conta já entrar na
    lista e no cronograma ANTES de conectar: nos horários o cronograma manda 'conecta pra rodar'.
    Quando você conectar de verdade, o `salvar()` funde a pendente na conta real (mesmo label).
    Idempotente: se já existe conta (real ou pendente) com esse label, devolve a existente."""
    label = (label or "").strip().lstrip("@")
    if not label:
        raise ValueError("label vazio")
    idx = _ler_index()
    ja = next((c for c in idx.get("contas", []) if (c.get("label") or "").lower() == label.lower()), None)
    if ja:
        return {"id": ja.get("id"), "label": ja.get("label"), "pendente": bool(ja.get("pendente"))}
    existentes = {c.get("id") for c in idx.get("contas", [])}
    pid = "pend:" + _slug(label)                 # prefixo "pend:" nunca colide com ds_user_id (numérico)
    base, n = pid, 2
    while pid in existentes:
        pid = f"{base}-{n}"; n += 1
    idx.setdefault("contas", []).append(
        {"id": pid, "label": label, "pendente": True, "criada_em": int(time.time())})
    _gravar_index(idx)
    return {"id": pid, "label": label, "pendente": True}


def salvar(cookies, label=None):
    """Registra/atualiza uma conta a partir dos cookies capturados e a deixa ATIVA."""
    uid = _ds_user_id(cookies)
    if not uid:
        raise ValueError("cookies sem ds_user_id — sessão não está logada")
    _garantir_dir()
    _sess_path(uid).write_text(json.dumps(cookies, ensure_ascii=False, indent=2), encoding="utf-8")
    idx = _ler_index()
    label = (label or "").strip().lstrip("@")
    antigo = next((c for c in idx.get("contas", []) if c.get("id") == uid), None)
    if not label:
        label = (antigo or {}).get("label") or f"conta {uid}"
    # funde uma PENDENTE de mesmo label (que você adicionou sem conectar): adota a idade dela e
    # remove o placeholder — a conta real assume o lugar dela na lista e no cronograma.
    pend = next((c for c in idx.get("contas", [])
                 if c.get("pendente") and (c.get("label") or "").lower() == label.lower()), None)
    # criada_em NÃO reseta na reconexão (idade real da conta); conectada_em é a última conexão.
    criada_em = (antigo or {}).get("criada_em") or (pend or {}).get("criada_em") or int(time.time())
    contas = [c for c in idx.get("contas", [])
              if c.get("id") != uid
              and not (c.get("pendente") and (c.get("label") or "").lower() == label.lower())]
    contas.append({"id": uid, "label": label, "conectada_em": int(time.time()),
                   "criada_em": criada_em})
    _gravar_index({"ativa": uid, "contas": contas})
    _escrever_central(uid)
    return {"id": uid, "label": label, "ativa": True}


def ativar(uid):
    """Torna a conta <uid> a ativa (copia a sessão dela pro arquivo central)."""
    idx = _ler_index()
    if uid not in [c.get("id") for c in idx.get("contas", [])]:
        raise KeyError(uid)
    if not _escrever_central(uid):
        raise FileNotFoundError(f"sessão de {uid} não encontrada")
    idx["ativa"] = uid
    _gravar_index(idx)
    return {"ativa": uid}


def remover(uid):
    """Apaga uma conta salva. Se era a ativa, promove outra (ou zera a sessão central)."""
    idx = _ler_index()
    idx["contas"] = [c for c in idx.get("contas", []) if c.get("id") != uid]
    try:
        _sess_path(uid).unlink(missing_ok=True)
    except Exception:
        pass
    try:
        import shutil
        shutil.rmtree(profile_dir(uid), ignore_errors=True)   # limpa o browser_profile da conta
    except Exception:
        pass
    if idx.get("ativa") == uid:
        idx["ativa"] = idx["contas"][0]["id"] if idx["contas"] else None
        if idx["ativa"]:
            _escrever_central(idx["ativa"])
        else:
            try:
                _CENTRAL.unlink(missing_ok=True)
            except Exception:
                pass
    _gravar_index(idx)
    return {"ativa": idx.get("ativa")}
