"""
Aplica bio + foto de perfil numa conta recém-criada, via instagrapi (login por sessionid,
mesmo esquema do worker story-repost). Roda pelo MESMO proxy socks5 (:1080) dos workers pra
não "pular" de IP. Funciona pros dois clientes (web e celular), já que ambos falam com este
backend depois de capturar a sessão.
"""
import json
import os
from pathlib import Path

import accounts


def _sessionid(path):
    try:
        for c in json.loads(Path(path).read_text(encoding="utf-8")):
            if c.get("name") == "sessionid" and c.get("value"):
                return c["value"]
    except Exception:
        pass
    return None


def aplicar(uid, bio="", foto_path=None):
    """uid = ds_user_id da conta (o conta.id que o /instagram/session devolve). Aplica o que vier
    (bio e/ou foto). Devolve o que deu certo."""
    sess = accounts.sessao_path(uid)
    if not sess:
        raise RuntimeError("conta sem sessão salva")
    sid = _sessionid(sess)
    if not sid:
        raise RuntimeError("sem cookie sessionid na sessão da conta")

    from instagrapi import Client
    cl = Client()
    cl.delay_range = [2, 5]
    proxy = os.environ.get("IG_PROXY", "socks5://127.0.0.1:1080")
    if proxy:
        try:
            cl.set_proxy(proxy)
        except Exception:
            pass
    cl.login_by_sessionid(sid)

    res = {"bio": False, "foto": False}
    if bio:
        try:
            cl.account_edit(biography=bio)
            res["bio"] = True
        except Exception as e:
            res["bio_erro"] = str(e)
    if foto_path and os.path.exists(foto_path):
        try:
            cl.account_change_picture(foto_path)
            res["foto"] = True
        except Exception as e:
            res["foto_erro"] = str(e)
    return res
