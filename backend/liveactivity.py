"""
Live Activity via APNs (ActivityKit).

O app inicia a Live Activity localmente (uma POR RUN) e manda o push token dela pra
/runs/{id}/liveactivity. A partir daí é o SERVER que atualiza a barrinha viva (no lock
screen / Dynamic Island) empurrando pushes `liveactivity` pro APNs — é isso que faz a
barra andar com o celular travado e o app fechado.

Auth: JWT ES256 assinado com a APNs Auth Key (.p8). Config no .env:
  APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID, APNS_KEY_FILE
  APNS_HOST (opcional): sandbox por padrão (dev build usa APNs sandbox).

ARQUITETURA: UMA Live Activity pro app (não uma por run). O server é o único que enxerga
todas as runs, então é ele que soma e manda o conjunto. Com uma activity só, a Dynamic
Island nunca vira bolinha apertada e não existe token de bot cruzando com o de outro.

content-state {titulo, pct, medido, label, quantos, bot, linhas} — TEM que bater campo a
campo com o struct ContentState do widget Swift. Campo a mais/menos → push 200 e nada acontece.
"""
import json
import os
import time

_KEY_ID = os.environ.get("APNS_KEY_ID", "")
_TEAM_ID = os.environ.get("APNS_TEAM_ID", "")
_BUNDLE = os.environ.get("APNS_BUNDLE_ID", "")
_KEY_FILE = os.environ.get("APNS_KEY_FILE", "")

_SANDBOX = "https://api.sandbox.push.apple.com"
_PROD = "https://api.push.apple.com"
# host preferido (1ª tentativa). Dev build normalmente é SANDBOX, mas dependendo da
# entitlement (aps-environment) do build o token pode ser de PRODUÇÃO — por isso o
# _enviar tenta os dois e memoriza o que funcionou.
_HOST = os.environ.get("APNS_HOST", _SANDBOX)

_jwt_cache = {"tok": None, "t": 0.0}
_melhor_host = {"h": None}   # host que já respondeu 200 (evita ficar tentando os dois)


def _p8():
    if _KEY_FILE and os.path.exists(_KEY_FILE):
        try:
            return open(_KEY_FILE, encoding="utf-8").read()
        except Exception:
            return None
    return None


def configurado():
    return bool(_p8() and _KEY_ID and _TEAM_ID and _BUNDLE)


def _token():
    """JWT do APNs (renova a cada <60min — APNs exige)."""
    agora = time.time()
    if _jwt_cache["tok"] and agora - _jwt_cache["t"] < 3000:
        return _jwt_cache["tok"]
    p8 = _p8()
    if not (p8 and _KEY_ID and _TEAM_ID):
        return None
    import jwt  # pyjwt[crypto]
    tok = jwt.encode({"iss": _TEAM_ID, "iat": int(agora)}, p8,
                     algorithm="ES256", headers={"kid": _KEY_ID})
    _jwt_cache.update(tok=tok, t=agora)
    return tok


_PREFIXO_OK = "app.quasenada.bots"    # só aceita bundle nosso (dev/preview)


def bundle_valido(b):
    """Bundle que o APP mandou junto com o token da LA. Cada build tem o seu
    (`.dev`, `.preview`), e o tópico do APNs TEM que ser o do build que criou a
    Live Activity — senão o push é rejeitado. Se não vier (app antigo) ou vier
    coisa estranha, cai no APNS_BUNDLE_ID do .env."""
    b = (b or "").strip()
    return b if b.startswith(_PREFIXO_OK) else ""


def _enviar(push_token, payload, bundle=None):
    """POST HTTP/2 pro APNs. Devolve (ok, detalhe). Bloqueante — chame via to_thread.

    Tenta o host preferido e, se vier `400 BadDeviceToken` (token do ambiente errado),
    cai pro outro (sandbox<->produção). Memoriza o que respondeu 200 pras próximas.
    """
    tok = _token()
    if not tok or not push_token:
        return False, "sem credencial/token"
    import httpx  # httpx[http2]
    topico = bundle_valido(bundle) or _BUNDLE
    headers = {
        "authorization": f"bearer {tok}",
        "apns-topic": f"{topico}.push-type.liveactivity",
        "apns-push-type": "liveactivity",
        "apns-priority": "10",
    }
    body = json.dumps(payload).encode("utf-8")
    primeiro = _melhor_host["h"] or _HOST
    outro = _PROD if primeiro == _SANDBOX else _SANDBOX
    ordem = [primeiro, outro]          # começa pelo melhor conhecido, mas sempre com fallback
    ultimo = "sem tentativa"
    for host in ordem:
        try:
            with httpx.Client(http2=True, timeout=15) as c:
                r = c.post(f"{host}/3/device/{push_token}", headers=headers, content=body)
            tag = "sandbox" if host == _SANDBOX else "prod"
            ultimo = f"HTTP {r.status_code} {r.text[:120]} @{tag}"
            if r.status_code == 200:
                _melhor_host["h"] = host       # achou o ambiente certo — fixa
                return True, ultimo
            # ambiente errado → tenta o outro host (se ainda não tentou)
            if r.status_code == 400 and "BadDeviceToken" in r.text:
                continue
            return False, ultimo               # outro erro → não adianta insistir
        except Exception as e:
            ultimo = str(e)[:160]
    return False, ultimo


def _content_state(estado):
    """`estado` é o dict montado pelo RunManager. TEM que bater campo a campo com o struct
    ContentState do Swift — um campo a mais/menos e o APNs aceita (200!) sem nada acontecer.
    Debug silencioso, o pior tipo."""
    return {
        "titulo": str(estado.get("titulo") or ""),
        "pct": int(estado.get("pct") or 0),
        "medido": bool(estado.get("medido")),
        "label": str(estado.get("label") or ""),
        "quantos": int(estado.get("quantos") or 0),
        "bot": str(estado.get("bot") or ""),
        "linhas": [
            {"id": str(l.get("id") or ""), "bot": str(l.get("bot") or ""),
             "nome": str(l.get("nome") or ""), "pct": int(l.get("pct") or 0)}
            for l in (estado.get("linhas") or [])
        ],
    }


def atualizar(push_token, estado, bundle=None):
    """Atualiza a barra viva com o estado do CONJUNTO (o RunManager já somou as runs)."""
    payload = {"aps": {
        "timestamp": int(time.time()),
        "event": "update",
        "content-state": _content_state(estado),
        "relevance-score": 100,
        "stale-date": int(time.time()) + 3600,
    }}
    return _enviar(push_token, payload, bundle)


def encerrar(push_token, estado, bundle=None):
    payload = {"aps": {
        "timestamp": int(time.time()),
        "event": "end",
        "content-state": _content_state(estado),
        "dismissal-date": int(time.time()) + 4,   # some do lock screen ~4s depois
    }}
    return _enviar(push_token, payload, bundle)
