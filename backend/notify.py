"""
Push notifications via Expo Push API.

Guarda os push tokens dos devices (devices.json) e dispara um push best-effort
quando uma run termina. Sem dependência externa — usa urllib da stdlib.
"""
import json
import urllib.request
from pathlib import Path

_FILE = Path(__file__).parent / "devices.json"
_EXPO_URL = "https://exp.host/--/api/v2/push/send"


def barra_progresso(done, total, larg=10):
    """Progresso pro corpo da notificação — só a porcentagem, sem os quadradinhos feios."""
    try:
        if not total or total <= 0:
            return ""
        pct = max(0, min(100, round(done / total * 100)))
        return f"{pct}%"
    except Exception:
        return ""


def _ler():
    if _FILE.exists():
        try:
            return json.loads(_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return []


def _gravar(tokens):
    _FILE.write_text(json.dumps(tokens, ensure_ascii=False, indent=2), encoding="utf-8")


def registrar(token):
    token = (token or "").strip()
    if not token:
        return False
    tokens = _ler()
    if token not in tokens:
        tokens.append(token)
        _gravar(tokens)
    return True


def listar():
    return _ler()


def enviar(titulo, corpo, data=None):
    """Manda push pra todos os devices (síncrono/bloqueante — chame via to_thread)."""
    tokens = _ler()
    if not tokens:
        return
    msgs = [{"to": t, "title": titulo, "body": corpo, "sound": "default",
             "data": data or {}} for t in tokens]
    req = urllib.request.Request(
        _EXPO_URL, data=json.dumps(msgs).encode("utf-8"),
        headers={"Content-Type": "application/json", "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            r.read()
    except Exception:
        pass
