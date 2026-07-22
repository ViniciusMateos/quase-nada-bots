"""
Quase Nada Bots — API.

Orquestra os bots (auto-follow, dm-followers): inicia/para runs, faz stream do
log ao vivo (WebSocket), e gerencia modos/chats de cada bot.

Rodar local:   uvicorn app:app --reload --port 8010
Auth:          header `Authorization: Bearer <BOTS_API_TOKEN>` (WS usa ?token=).
"""
from fastapi import Depends, FastAPI, Header, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
import asyncio

import bots
import history
import liveactivity
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
    alvo = [b for b in (payload.get("bots") or bots.bots_ig()) if bots.existe(b)]
    if not alvo:
        raise HTTPException(400, "nenhum bot de Instagram para conectar")
    # A sessão é UNIVERSAL (arquivo central, lido por todos os bots — mesma conta). Então
    # valida UMA vez só (um browser), gravando direto na sessão central. Não abre um browser
    # por bot nem "copia pros outros": todos já leem o mesmo session_cookies.json central.
    principal = alvo[0]
    arquivo = bots.salvar_cookies_ig(principal, cookies)
    run = await mgr.start(principal, {"import_cookies": arquivo})
    return {"runs": [{"bot": principal, "id": run.id}]}


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
    params = payload.get("params", {}) or {}
    # não deixa DOIS do MESMO bot rodando junto (bots diferentes pode; conectar IG não conta)
    if not params.get("import_cookies") and any(
        r.bot == bot_id and r.status in ("rodando", "iniciando") and not r.params.get("import_cookies")
        for r in mgr.runs.values()
    ):
        raise HTTPException(409, "esse bot já está rodando — espera terminar")
    run = await mgr.start(bot_id, params)
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
    # cabeçalho (começo) + cauda recente, sem repetir a sobreposição enquanto o log é curto
    tail = list(r.linhas)
    corte = 0
    while corte < len(tail) and corte < len(r.cabecalho) and tail[corte] is r.cabecalho[corte]:
        corte += 1
    return {**r.info(), "log": r.cabecalho + tail[corte:][-300:]}


@app.post("/liveactivity", dependencies=[Depends(auth)])
async def set_liveactivity(payload: dict):
    """O app manda o push token da Live Activity — UMA por app, não por run. A partir daqui
    o server empurra a barra viva via APNs, somando todas as runs ativas dentro dela."""
    # o app manda o bundle do PRÓPRIO build (.dev/.preview) — é ele que vira o tópico do
    # APNs. Sem isso, dev e preview brigariam pelo APNS_BUNDLE_ID do .env.
    # registrar_la_token PERSISTE em disco (sobrevive a restart) E, se o activity_id mudou
    # (LA de sessão nova), encerra a LA antiga órfã antes de assumir — anti-Dynamic-Island-rachada.
    await mgr.registrar_la_token(
        payload.get("token"),
        liveactivity.bundle_valido(payload.get("bundle")),
        payload.get("activity_id"))
    print(f"[la] token recebido: "
          f"{'sim (' + str(len(mgr.la_token)) + ' chars)' if mgr.la_token else 'VAZIO'} "
          f"| bundle={mgr.la_bundle or '(do .env)'} | configurado={liveactivity.configurado()}",
          flush=True)
    await mgr.empurrar_la()   # já reflete o estado atual, sem esperar o próximo [progress]
    return {"ok": True}


@app.post("/liveactivity/test", dependencies=[Depends(auth)])
async def liveactivity_test(payload: dict):
    """Aba de Testes do app: empurra um estado FAKE de N bots pra Live Activity, pra ver como
    renderiza sem esperar bot real. n<=0 encerra a LA. Rode com os bots parados (senão o loop
    de progresso real sobrescreve o fake em ~3s)."""
    return await mgr.empurrar_la_teste(payload.get("n"))


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
    # começo do run SEMPRE (Modo/Proxy/Conta não somem nem em log longo), depois o buffer
    # rolante — sem repetir o que ainda está no cabeçalho (log curto: mesmos objetos).
    for l in r.cabecalho:
        await ws.send_text(l)
    tail = list(r.linhas)
    corte = 0
    while corte < len(tail) and corte < len(r.cabecalho) and tail[corte] is r.cabecalho[corte]:
        corte += 1
    if corte == 0 and r.cabecalho and getattr(r, "_truncou", False):
        await ws.send_text("[backend] ····· (log do meio cortado — completo no arquivo da sessão) ·····")
    for l in tail[corte:]:
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
