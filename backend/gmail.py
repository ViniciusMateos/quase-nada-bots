"""
Contas de Gmail (email + senha de app) + leitura do código de verificação do IG por IMAP.

Usado pelo "Criar Conta": cada conta nova é criada com um email `base+alias@gmail.com`, e o
código que o IG manda cai na caixa do `base`. Aqui a gente lê essa caixa e devolve o código,
pra o app preencher sozinho — nos DOIS clientes (web e celular), já que ambos falam com este
backend.

Credencial: APP PASSWORD do Google (16 letras, com 2FA ligado) — NÃO a senha normal; precisa do
IMAP ligado no Gmail. Guardada em `gmail_config.json` (ao lado das sessions, gitignored).
"""
import email
import email.utils
import imaplib
import json
import os
import re
import time
from datetime import datetime, timezone
from email.header import decode_header

from settings import WORKERS_DIR

_RAIZ = WORKERS_DIR.parent
GMAIL_CFG = _RAIZ / "gmail_config.json"


def lista():
    """[{user, senha_app}] — do arquivo (formato novo {"contas":[...]} ou antigo {user,senha_app})
    + a env QN_GMAIL_* como uma conta."""
    out = []
    try:
        d = json.loads(GMAIL_CFG.read_text(encoding="utf-8"))
        if isinstance(d, dict) and isinstance(d.get("contas"), list):
            out = [c for c in d["contas"] if c.get("user") and c.get("senha_app")]
        elif isinstance(d, dict) and d.get("user") and d.get("senha_app"):
            out = [{"user": d["user"], "senha_app": d["senha_app"]}]
    except Exception:
        pass
    eu, ep = os.environ.get("QN_GMAIL_USER"), os.environ.get("QN_GMAIL_APP_PASSWORD")
    if eu and ep and not any(c["user"].lower() == eu.lower() for c in out):
        out.append({"user": eu, "senha_app": ep})
    return [{"user": c["user"].strip(), "senha_app": c["senha_app"].replace(" ", "").strip()} for c in out]


def _salvar(l):
    GMAIL_CFG.write_text(json.dumps({"contas": l}, ensure_ascii=False), encoding="utf-8")
    try:
        GMAIL_CFG.chmod(0o600)
    except Exception:
        pass


def add(user, senha_app):
    user = (user or "").strip()
    senha_app = (senha_app or "").replace(" ", "").strip()
    if not user or not senha_app:
        raise ValueError("email e app password são obrigatórios")
    envu = os.environ.get("QN_GMAIL_USER", "").lower()
    base = [c for c in lista() if c["user"].lower() != user.lower() and c["user"].lower() != envu]
    base.append({"user": user, "senha_app": senha_app})
    _salvar(base)
    return base


def remover(user):
    envu = os.environ.get("QN_GMAIL_USER", "").lower()
    base = [c for c in lista() if c["user"].lower() != (user or "").lower() and c["user"].lower() != envu]
    _salvar(base)
    return base


def _senha(email_):
    for c in lista():
        if c["user"].lower() == (email_ or "").lower():
            return c["senha_app"]
    return None


def _base_do_alias(alias):
    return re.sub(r"\+[^@]*(?=@)", "", alias or "")


def _dec(s):
    try:
        return "".join((p.decode(enc or "utf-8", "ignore") if isinstance(p, bytes) else p)
                       for p, enc in decode_header(s or ""))
    except Exception:
        return s or ""


def _corpo(msg):
    partes = []
    try:
        if msg.is_multipart():
            for p in msg.walk():
                if p.get_content_type() in ("text/plain", "text/html"):
                    try:
                        partes.append(p.get_payload(decode=True).decode(p.get_content_charset() or "utf-8", "ignore"))
                    except Exception:
                        pass
        else:
            partes.append(msg.get_payload(decode=True).decode(msg.get_content_charset() or "utf-8", "ignore"))
    except Exception:
        pass
    return "\n".join(partes)


def _achar_codigo(texto):
    m = re.search(r"(?<!\d)(\d{3})\s?(\d{3})(?!\d)", texto or "")
    return (m.group(1) + m.group(2)) if m else None


def buscar_codigo(alias=None):
    """Loga no Gmail (conta derivada do +alias) e devolve o código 6-díg do IG mais recente
    (preferindo o email cujo destinatário bate com o alias). None se não achar."""
    base = _base_do_alias(alias) if alias else ""
    pw = _senha(base)
    if not pw:
        ls = lista()
        if not ls:
            raise RuntimeError("Nenhuma conta de Gmail cadastrada.")
        base, pw = ls[0]["user"], ls[0]["senha_app"]
    agora = datetime.now(timezone.utc)
    M = imaplib.IMAP4_SSL("imap.gmail.com")
    try:
        M.login(base, pw)
        M.select("INBOX")
        # SINCE de ontem (margem) + filtro fino por Date abaixo; pega só emails RECENTES do IG
        hoje = time.strftime("%d-%b-%Y", time.gmtime(time.time() - 86400))
        typ, data = M.search(None, f'(FROM "instagram" SINCE {hoje})')
        ids = (data[0].split() if data and data[0] else [])[-20:]
        cands = []   # (quando, tem_alias, code)
        for i in reversed(ids):
            typ, md = M.fetch(i, "(RFC822)")
            if not md or not md[0]:
                continue
            msg = email.message_from_bytes(md[0][1])
            try:
                quando = email.utils.parsedate_to_datetime(msg.get("Date"))
                if quando.tzinfo is None:
                    quando = quando.replace(tzinfo=timezone.utc)
            except Exception:
                quando = agora
            # SÓ códigos dos últimos ~12 min (evita pegar código de email antigo/de outra tentativa)
            if (agora - quando).total_seconds() > 720:
                continue
            dest = (_dec(msg.get("To", "")) + " " + _dec(msg.get("Delivered-To", "")) + " " +
                    _dec(msg.get("X-Original-To", ""))).lower()
            code = _achar_codigo(_dec(msg.get("Subject", ""))) or _achar_codigo(_corpo(msg))
            if not code:
                continue
            cands.append((quando, bool(alias and alias.lower() in dest), code))
        if not cands:
            return None
        # prefere o que bate o +alias; entre eles (ou no geral), o MAIS RECENTE
        com_alias = [c for c in cands if c[1]]
        pool = com_alias if com_alias else cands
        pool.sort(key=lambda c: c[0], reverse=True)
        return pool[0][2]
    finally:
        try:
            M.logout()
        except Exception:
            pass
