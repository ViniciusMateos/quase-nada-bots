"""
Quase Nada Bots — API.

Orquestra os bots (auto-like, dm-followers): inicia/para runs, faz stream do
log ao vivo (WebSocket), e gerencia modos/chats de cada bot.

Rodar local:   uvicorn app:app --reload --port 8010
Auth:          header `Authorization: Bearer <BOTS_API_TOKEN>` (WS usa ?token=).
"""
from fastapi import Depends, FastAPI, Header, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
import asyncio

import bots
import history
import notify
import settings
from run_manager import RunManager

app = FastAPI(title="Quase Nada Bots — API", version="0.1.0")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)
mgr = RunManager()


def auth(authorization: str = Header(None)):
    if authorization != f"Bearer {settings.API_TOKEN}":
        raise HTTPException(401, "token inválido")


def _checar_bot(bot_id):
    if not bots.existe(bot_id):
        raise HTTPException(404, f"bot desconhecido: {bot_id}")


# ───────────────────────────── geral ─────────────────────────────
@app.get("/health")
async def health():
    return {"ok": True, "bots": list(bots.BOTS.keys())}


@app.get("/bots", dependencies=[Depends(auth)])
async def listar_bots():
    return bots.BOTS


# ─────────────────────────── modos / chats ───────────────────────
@app.get("/bots/{bot_id}/modos", dependencies=[Depends(auth)])
async def get_modos(bot_id: str):
    _checar_bot(bot_id)
    return bots.ler_modos(bot_id)


@app.put("/bots/{bot_id}/modos", dependencies=[Depends(auth)])
async def put_modos(bot_id: str, payload: dict):
    _checar_bot(bot_id)
    bots.gravar_modos(bot_id, payload)
    return {"ok": True}


@app.get("/bots/{bot_id}/chats", dependencies=[Depends(auth)])
async def get_chats(bot_id: str):
    _checar_bot(bot_id)
    return bots.ler_chats(bot_id)


@app.post("/bots/{bot_id}/chats", dependencies=[Depends(auth)])
async def add_chat(bot_id: str, payload: dict):
    _checar_bot(bot_id)
    chats = bots.ler_chats(bot_id)
    nome = (payload.get("nome") or "").strip()
    tid = str(payload.get("thread_id") or "").strip()
    if not nome and not tid:
        raise HTTPException(400, "informe o thread_id ou o nome do grupo")
    if not nome:                          # só thread_id → usa o id como rótulo
        nome = tid
    for c in chats:                       # dedup: por thread_id se houver, senão por nome
        mesmo = (tid and str(c.get("thread_id")) == tid) or \
                (not tid and c.get("nome", "").strip().lower() == nome.lower())
        if mesmo:
            c["nome"], c["thread_id"] = nome, tid
            bots.gravar_chats(bot_id, chats)
            return c
    novo = {"nome": nome, "thread_id": tid}
    chats.append(novo)
    bots.gravar_chats(bot_id, chats)
    return novo


@app.delete("/bots/{bot_id}/chats/{nome}", dependencies=[Depends(auth)])
async def del_chat(bot_id: str, nome: str):
    _checar_bot(bot_id)
    chats = [c for c in bots.ler_chats(bot_id) if c.get("nome", "").lower() != nome.lower()]
    bots.gravar_chats(bot_id, chats)
    return {"ok": True}



# ─────────────────────────── proxy ───────────────────────────────
@app.get("/bots/{bot_id}/proxy", dependencies=[Depends(auth)])
async def get_proxy(bot_id: str):
    _checar_bot(bot_id)
    return bots.ler_proxy(bot_id)


@app.put("/bots/{bot_id}/proxy", dependencies=[Depends(auth)])
async def put_proxy(bot_id: str, payload: dict):
    _checar_bot(bot_id)
    bots.gravar_proxy(bot_id, payload)
    return bots.ler_proxy(bot_id)


# ───────────────────────── conexão Instagram ─────────────────────
@app.post("/instagram/session", dependencies=[Depends(auth)])
async def conectar_instagram(payload: dict):
    """Recebe os cookies capturados no app (WebView) e importa a sessão em cada bot
    de IG — cada importação vira uma run (o app acompanha o log). Devolve as runs."""
    cookies = payload.get("cookies")
    if not isinstance(cookies, list) or not cookies:
        raise HTTPException(400, "envie 'cookies' (lista não-vazia)")
    if not any(str(c.get("name")) == "sessionid" for c in cookies):
        raise HTTPException(400, "cookies sem 'sessionid' — sessão não está logada")
    alvo = payload.get("bots") or bots.bots_ig()
    runs = []
    for bot_id in alvo:
        if not bots.existe(bot_id):
            continue
        arquivo = bots.salvar_cookies_ig(bot_id, cookies)
        run = await mgr.start(bot_id, {"import_cookies": arquivo})
        runs.append({"bot": bot_id, "id": run.id})
    if not runs:
        raise HTTPException(400, "nenhum bot de Instagram para conectar")
    return {"runs": runs}


# ─────────────────────── push (devices) ─────────────────────────
@app.post("/devices", dependencies=[Depends(auth)])
async def registrar_device(payload: dict):
    if not notify.registrar(payload.get("token")):
        raise HTTPException(400, "token vazio")
    return {"ok": True, "devices": len(notify.listar())}


# ───────────────────────────── runs ──────────────────────────────
@app.post("/runs", dependencies=[Depends(auth)])
async def start_run(payload: dict):
    bot_id = payload.get("bot")
    _checar_bot(bot_id)
    run = await mgr.start(bot_id, payload.get("params", {}))
    return run.info()


@app.get("/runs", dependencies=[Depends(auth)])
async def list_runs():
    return mgr.listar()


# precisa vir ANTES de /runs/{run_id} (senão "history" casa como run_id)
@app.get("/runs/history", dependencies=[Depends(auth)])
async def runs_history(bot: str = None, status: str = None,
                       desde: float = None, ate: float = None):
    return history.listar(bot=bot, status=status, desde=desde, ate=ate)


@app.get("/runs/{run_id}", dependencies=[Depends(auth)])
async def run_detail(run_id: str):
    r = mgr.get(run_id)
    if not r:
        raise HTTPException(404, "run não encontrado")
    return {**r.info(), "log": list(r.linhas)[-300:]}


@app.post("/runs/{run_id}/stop", dependencies=[Depends(auth)])
async def stop_run(run_id: str):
    if not await mgr.stop(run_id):
        raise HTTPException(404, "run não encontrado")
    return {"stopped": True}


@app.websocket("/runs/{run_id}/logs")
async def ws_logs(ws: WebSocket, run_id: str, token: str = ""):
    if token != settings.API_TOKEN:
        await ws.close(code=4401)
        return
    r = mgr.get(run_id)
    if not r:
        await ws.close(code=4404)
        return
    await ws.accept()
    q = asyncio.Queue()
    for l in list(r.linhas):              # histórico primeiro
        await ws.send_text(l)
    if r.status in ("finalizado", "parado", "erro"):
        await ws.close()
        return
    r.subs.add(q)
    try:
        while True:
            l = await q.get()
            if l is None:
                break
            await ws.send_text(l)
    except Exception:
        pass
    finally:
        r.subs.discard(q)
        try:
            await ws.close()
        except Exception:
            pass
