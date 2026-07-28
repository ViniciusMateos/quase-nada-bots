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
import time
from pathlib import Path

from settings import WORKERS_DIR

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
    """Lista as contas salvas, marcando qual é a ativa."""
    idx = _migrar_sessao_existente(_ler_index())
    ativa = idx.get("ativa")
    return [{**c, "ativa": c.get("id") == ativa} for c in idx.get("contas", [])]


def salvar(cookies, label=None):
    """Registra/atualiza uma conta a partir dos cookies capturados e a deixa ATIVA."""
    uid = _ds_user_id(cookies)
    if not uid:
        raise ValueError("cookies sem ds_user_id — sessão não está logada")
    _garantir_dir()
    _sess_path(uid).write_text(json.dumps(cookies, ensure_ascii=False, indent=2), encoding="utf-8")
    idx = _ler_index()
    label = (label or "").strip()
    antigo = next((c for c in idx.get("contas", []) if c.get("id") == uid), None)
    if not label:
        label = (antigo or {}).get("label") or f"conta {uid}"
    contas = [c for c in idx.get("contas", []) if c.get("id") != uid]
    contas.append({"id": uid, "label": label, "conectada_em": int(time.time())})
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
