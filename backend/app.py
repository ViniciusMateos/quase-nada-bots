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
import base64
import os
import re
import tempfile

import accounts
import bots
import cronograma
import gmail
import history
import liveactivity
import notify
import perfil
import settings
import story_contas_svc
from run_manager import RunManager

app = FastAPI(title="Quase Nada Bots — API", version="0.1.0")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)
mgr = RunManager()


def auth(authorization: str = Header(None)):
    if authorization != f"Bearer {settings.API_TOKEN}":
        raise HTTPException(401, "token inválido")


@app.on_event("startup")
async def _iniciar_cronograma():
    asyncio.create_task(cronograma.loop(mgr))   # mgr → o cronograma AUTO-RODA o aquecimento sozinho
    asyncio.create_task(mgr.loop_reaper())   # watchdog de trava roda mesmo com o app fechado


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
    # Registra/atualiza a CONTA (salva a sessão dela e a deixa ativa = escreve a central).
    # `label` é o apelido que o usuário dá (ex: "segue5") pra reconhecer a conta na lista.
    try:
        conta = accounts.salvar(cookies, payload.get("label"))
    except ValueError as e:
        raise HTTPException(400, str(e))
    # A sessão ativa é UNIVERSAL (arquivo central, lido por todos os bots). Valida UMA vez só
    # (um browser) — o worker confirma o login e regrava a central. Não abre browser por bot.
    principal = alvo[0]
    arquivo = bots.salvar_cookies_ig(principal, cookies)
    # conta_id → o run_manager aponta o profile DESTA conta (device isolado, não mata as outras)
    run = await mgr.start(principal, {"import_cookies": arquivo, "conta_id": conta["id"]})
    return {"runs": [{"bot": principal, "id": run.id}], "conta": conta}


# ───────────────── Gmail (criar conta: código automático) ─────────────────
@app.get("/gmail/contas", dependencies=[Depends(auth)])
async def gmail_contas():
    return gmail.lista()


@app.post("/gmail/contas", dependencies=[Depends(auth)])
async def gmail_add(payload: dict):
    try:
        return gmail.add(payload.get("user"), payload.get("senha_app"))
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/gmail/remover", dependencies=[Depends(auth)])
async def gmail_remover(payload: dict):
    return gmail.remover((payload.get("user") or "").strip())


@app.get("/gmail/codigo", dependencies=[Depends(auth)])
async def gmail_codigo(alias: str = ""):
    try:
        return {"code": await asyncio.to_thread(gmail.buscar_codigo, alias or None)}
    except Exception as e:
        raise HTTPException(400, str(e))


@app.post("/instagram/perfil", dependencies=[Depends(auth)])
async def instagram_perfil(payload: dict):
    """Aplica bio + foto no perfil da conta (id = ds_user_id, o conta.id de /instagram/session).
    foto_b64 = data URL (opcional). Roda via instagrapi com a sessão já salva da conta."""
    uid = (payload.get("id") or "").strip()
    if not uid:
        raise HTTPException(400, "informe o id da conta")
    foto_path = None
    fb = payload.get("foto_b64") or ""
    m = re.match(r"data:image/(\w+);base64,(.+)$", fb, re.S) if fb else None
    if m:
        ext = m.group(1).lower().replace("jpeg", "jpg")
        try:
            fd, foto_path = tempfile.mkstemp(suffix=f".{ext}")
            with os.fdopen(fd, "wb") as f:
                f.write(base64.b64decode(m.group(2)))
        except Exception:
            foto_path = None
        try:
            (settings.WORKERS_DIR.parent / "ultima_foto.txt").write_text(fb, encoding="utf-8")   # lembra a última foto
        except Exception:
            pass
    try:
        return await asyncio.to_thread(perfil.aplicar, uid, payload.get("bio") or "", foto_path)
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        if foto_path:
            try:
                os.remove(foto_path)
            except Exception:
                pass


@app.get("/criar/ultima-foto", dependencies=[Depends(auth)])
async def ultima_foto():
    """Última foto de perfil usada (data URL) — pra já vir sugerida na próxima conta. {dataUrl}."""
    try:
        return {"dataUrl": (settings.WORKERS_DIR.parent / "ultima_foto.txt").read_text(encoding="utf-8")}
    except Exception:
        return {"dataUrl": ""}


# ───────────────────────── contas salvas ─────────────────────────
@app.get("/accounts", dependencies=[Depends(auth)])
async def listar_contas():
    return accounts.listar()


@app.get("/accounts/validar", dependencies=[Depends(auth)])
async def validar_contas(force: bool = False):
    """Checa (em paralelo, via túnel) se a sessão de cada conta ainda está viva. Devolve as
    contas + `sessao_ok`. É pesado-ish (bate no IG por conta) → cacheia por ~60s; o app manda
    `?force=1` no pull-to-refresh pra refazer o check na hora."""
    res = await asyncio.to_thread(accounts.validar_todas, force)
    return [{**c, "sessao_ok": res.get(c.get("id"), False)} for c in accounts.listar()]


@app.post("/accounts/pendente", dependencies=[Depends(auth)])
async def adicionar_conta_pendente(payload: dict):
    """Registra uma conta PENDENTE (só o @, sem sessão) pra ela já entrar na lista e no cronograma
    antes de conectar. Idempotente (mesmo label = devolve a existente). body {label, locais?}."""
    label = (payload or {}).get("label") or ""
    locais = (payload or {}).get("locais")
    try:
        return accounts.adicionar_pendente(label, locais if isinstance(locais, list) else None)
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/accounts/{conta_id}/ativar", dependencies=[Depends(auth)])
async def ativar_conta(conta_id: str):
    try:
        return accounts.ativar(conta_id)
    except KeyError:
        raise HTTPException(404, "conta não encontrada")
    except FileNotFoundError as e:
        raise HTTPException(409, str(e))


@app.delete("/accounts/{conta_id}", dependencies=[Depends(auth)])
async def remover_conta(conta_id: str):
    return accounts.remover(conta_id)


@app.put("/accounts/{conta_id}/locais", dependencies=[Depends(auth)])
async def locais_conta(conta_id: str, payload: dict):
    """Onde a conta é usada: body {locais: ["emulador", "servidor"]} (qualquer subconjunto; [] =
    nenhum). Decide em quais listas ela aparece no app e se entra no cronograma do servidor."""
    locais = (payload or {}).get("locais")
    if not isinstance(locais, list):
        raise HTTPException(400, "informe 'locais' (lista)")
    try:
        return accounts.definir_locais(conta_id, locais)
    except KeyError:
        raise HTTPException(404, "conta não encontrada")


@app.put("/accounts/{conta_id}/travada", dependencies=[Depends(auth)])
async def travar_conta(conta_id: str, payload: dict):
    """Trava/destrava a conta pro AUTOMÁTICO (cronograma não roda nada nela). Rodar na mão segue ok."""
    try:
        return accounts.definir_travada(conta_id, bool((payload or {}).get("travada")))
    except KeyError:
        raise HTTPException(404, "conta não encontrada")


# ───────────────────────── grupos de contas ─────────────────────────
@app.get("/grupos", dependencies=[Depends(auth)])
async def listar_grupos():
    """[{nome, contas: [ids]}] — o app usa pra pré-marcar as contas de um grupo no lote."""
    return accounts.listar_grupos()


@app.post("/grupos", dependencies=[Depends(auth)])
async def criar_grupo(payload: dict):
    try:
        return accounts.criar_grupo((payload or {}).get("nome"))
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.put("/grupos/{nome}", dependencies=[Depends(auth)])
async def editar_grupo(nome: str, payload: dict):
    """`contas` = quem fica no grupo (substitui); `nome` = renomeia."""
    p = payload or {}
    try:
        if p.get("nome") and p["nome"] != nome:
            nome = accounts.renomear_grupo(nome, p["nome"])["nome"]
        if "contas" in p:
            return accounts.definir_contas_grupo(nome, p.get("contas") or [])
        return {"nome": nome}
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.delete("/grupos/{nome}", dependencies=[Depends(auth)])
async def remover_grupo(nome: str):
    return accounts.remover_grupo(nome)


# ─────────────────────────── cronograma ───────────────────────────
@app.get("/cronograma", dependencies=[Depends(auth)])
async def cronograma_hoje():
    return cronograma.preview()


@app.put("/cronograma", dependencies=[Depends(auth)])
async def cronograma_toggle(payload: dict):
    return cronograma.set_ativo(bool(payload.get("ativo", True)))


# ─────────────────────── push (devices) ─────────────────────────
@app.post("/devices", dependencies=[Depends(auth)])
async def registrar_device(payload: dict):
    if not notify.registrar(payload.get("token")):
        raise HTTPException(400, "token vazio")
    return {"ok": True, "devices": len(notify.listar())}


@app.post("/aviso", dependencies=[Depends(auth)])
async def aviso(payload: dict):
    """Push avulso (ex: o supervisor do PC avisando que vai reiniciar pra recuperar o emulador)."""
    corpo = (payload.get("corpo") or "").strip()
    if not corpo:
        raise HTTPException(400, "corpo vazio")
    await asyncio.to_thread(notify.enviar, payload.get("titulo") or "Quase Nada Bots",
                            corpo, payload.get("data"), payload.get("grupo"))
    return {"ok": True}


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


@app.post("/bots/{bot_id}/run-lote", dependencies=[Depends(auth)])
async def start_run_lote(bot_id: str, payload: dict):
    """Roda o bot em VÁRIAS contas, uma atrás da outra. O que `contas` significa depende de ONDE
    o bot roda:
      • server por cookie (dm-followers, like-repost…): `contas` = ids do accounts.json; vazio →
        TODAS as contas com sessão ativa (valida na hora).
      • emulador (auto-follow): `contas` = USERNAMES dos @ do device (o agente faz trocar_conta);
        1 job por @, em fila (1 emulador = 1 conta por vez).
      • story-repost: `contas` = USERNAMES das contas-vitrine (de /story/contas); vazio → TODAS as
        de lá. Roda via story_poster.py (contas-vitrine por instagrapi), uma conta por vez.
    `params` = os mesmos de um run normal (modo, dry_run, start_from)."""
    _checar_bot(bot_id)
    if any(r.bot == bot_id and r.status in ("rodando", "iniciando") and not r.params.get("import_cookies")
           for r in mgr.runs.values()):
        raise HTTPException(409, "esse bot já está rodando — espera terminar")
    base = payload.get("params", {}) or {}
    contas = payload.get("contas") or []
    if bot_id == "story-repost":
        # story-repost: `contas` = USERNAMES das contas-vitrine; vazio → todas as de /story/contas
        if not contas:
            contas = [c["username"] for c in await asyncio.to_thread(story_contas_svc.listar)
                      if c.get("username")]
        if not contas:
            raise HTTPException(400, "nenhuma conta-vitrine disponível")
    else:
        if not contas:                                   # sem lista → todas as ativas
            res = await asyncio.to_thread(accounts.validar_todas)
            contas = [uid for uid, ok in res.items() if ok]
        if not contas:
            raise HTTPException(400, "nenhuma conta com sessão ativa")
    try:
        return await mgr.start_lote(bot_id, base, contas)
    except ValueError as e:
        raise HTTPException(400, str(e))   # sem contas / sem sessão salva


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
    if r:
        # cabeçalho (começo) + cauda recente, sem repetir a sobreposição enquanto o log é curto
        tail = list(r.linhas)
        corte = 0
        while corte < len(tail) and corte < len(r.cabecalho) and tail[corte] is r.cabecalho[corte]:
            corte += 1
        return {**r.info(), "log": r.cabecalho + tail[corte:][-300:]}
    # saiu da memória → tenta o log salvo em disco (histórico persistente)
    linhas = mgr.ler_log_arquivo(run_id)
    rec = mgr.achar_history(run_id)
    if linhas is None and not rec:
        raise HTTPException(404, "run não encontrado")
    base = mgr.info_de_history(rec) if rec else {"id": run_id, "bot": None, "status": "finalizado",
                                                 "historico": True}
    return {**base, "log": (linhas or [])[-600:]}


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


@app.post("/liveactivity/pts", dependencies=[Depends(auth)])
async def set_pts_token(payload: dict):
    """O app manda o pushToStartToken (iOS 17.2+) — com ele o SERVER inicia a Live Activity
    sozinho (ex: o cronograma auto-rodando o aquecimento), sem o app aberto. Diferente do
    token de update: é do app (não por-activity), não rotaciona por run e vale até vir outro."""
    r = mgr.registrar_pts_token(payload.get("token"), liveactivity.bundle_valido(payload.get("bundle")))
    print(f"[la] pts token recebido: {'sim' if mgr.pts_token else 'VAZIO'} | bundle={mgr.pts_bundle or '(do .env)'}",
          flush=True)
    return r


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


# ───────────────────── emulador (agente do PC) ─────────────────────
# Bots com target="emulador" (hoje: auto-follow) NÃO rodam aqui — o backend enfileira um job e o
# "agente do PC" (emulador LDPlayer tocando no app real) consome, executa e reporta de volta por
# estes endpoints. A run espelha no app igual a uma normal: logs ao vivo (WS), progresso e LA.
@app.get("/emulador/status", dependencies=[Depends(auth)])
async def emulador_status():
    """Agente online? (viu nos últimos 90s) + tamanho da fila (pendentes/em execução)."""
    return mgr.status_emulador()


@app.post("/emulador/agente/ping", dependencies=[Depends(auth)])
async def emulador_agente_ping(payload: dict = None):
    """Heartbeat do agente do PC (mantém o /emulador/status mostrando 'online'). O agente pode
    mandar JUNTO o estado do emulador — body OPCIONAL {conta_ativa, contas_logadas, sessao,
    device}; ping vazio ({} ou sem body) segue valendo (compat pra trás)."""
    return mgr.ping_agente(payload or {})


@app.get("/emulador/codigo", dependencies=[Depends(auth)])
async def emulador_codigo(user: str = ""):
    """O agente do PC busca o código de verificação pra completar o login no emulador. Devolve
    {codigo: <str|null>}; consome (one-shot) e expira após ~5min (código velho não vale)."""
    return {"codigo": mgr.pegar_codigo(user)}


@app.post("/emulador/verificar", dependencies=[Depends(auth)])
async def emulador_verificar(payload: dict = None):
    """Enfileira UM job de VERIFICAÇÃO PROFUNDA de sessões pro agente do PC: ele entra em CADA conta
    logada no device e marca ok/bloqueada (estar na gavetinha do IG NÃO garante sessão sã). body {}.
    Fila = um por vez. Devolve {ok, run_id}. O progresso vem no GET /emulador/status (sessoes +
    verificando_sessoes), atualizado conta a conta pelo agente via POST /emulador/sessoes."""
    return await mgr.enfileirar_verificar()


@app.post("/emulador/sessoes", dependencies=[Depends(auth)])
async def emulador_sessoes(payload: dict):
    """O agente reporta o status de UMA conta verificada (incremental, pra a UI atualizar ao vivo).
    body {user, status: "ok"|"bloqueada"|"desconhecida"}. Guarda em memória; o GET /emulador/status
    devolve o acumulado em 'sessoes'."""
    p = payload or {}
    if not mgr.guardar_sessao(p.get("user") or "", p.get("status") or ""):
        raise HTTPException(400, "informe 'user'")
    return {"ok": True}


@app.post("/emulador/login", dependencies=[Depends(auth)])
async def emulador_login(payload: dict):
    """Enfileira um job de LOGIN no emulador por conta (o agente do PC loga a conta tocando no app
    do device). body {contas:[users], senhas?:{user: senha}}. A senha vem do app (credencial salva
    no aparelho) ou, se não veio, do contas.json do story-poster; viaja só no job (nunca no log nem
    em /runs). Fila = uma conta por vez. Devolve {run_ids, contas, …}."""
    contas = (payload or {}).get("contas") or []
    senhas = (payload or {}).get("senhas") or {}
    if not isinstance(senhas, dict):
        senhas = {}
    try:
        return await mgr.start_login_emulador(contas, senhas)
    except ValueError as e:
        raise HTTPException(400, str(e))


# ─────────────────────── story-repost (contas + sessão) ───────────────────────
@app.get("/story/contas", dependencies=[Depends(auth)])
async def story_contas(force: bool = False):
    """Contas do story-repost (rodam no emulador) + se a sessão instagrapi de cada uma ainda está
    viva. Pesado-ish (sobe um python e bate no IG por conta via proxy) → cacheia ~60s; `?force=1`
    refaz na hora (pull-to-refresh). Nunca estoura 500 — se o check falhar, vem viva=null."""
    contas = await asyncio.to_thread(story_contas_svc.listar, force)
    return {"contas": contas}


@app.post("/story/senha", dependencies=[Depends(auth)])
async def story_senha(payload: dict):
    """Atualiza a senha de uma conta-vitrine no contas.json do story-poster (cria se não existir).
    body {user, senha}. Pra RECONECTAR uma conta cuja senha mudou na recuperação — o próximo
    --login (ou o login no emulador) já usa a senha nova. NÃO loga a senha. {user, criada}."""
    user = (payload or {}).get("user") or ""
    senha = (payload or {}).get("senha") or ""
    try:
        return await asyncio.to_thread(story_contas_svc.atualizar_senha, user, senha)
    except ValueError as e:
        raise HTTPException(400, str(e))


# ────────────────────── código de verificação (challenge) ──────────────────────
@app.post("/contas/codigo", dependencies=[Depends(auth)])
async def contas_codigo(payload: dict):
    """Recebe o código de verificação (challenge) de uma conta. UM endpoint, DOIS destinos:
      (a) grava CODIGOS_DIR/<user>.txt → o ig_auth do story-poster lê de lá e completa o login no
          SERVER (story_poster.py --login);
      (b) guarda em memória → o agente do PC busca via GET /emulador/codigo pra completar o login
          no EMULADOR (device).
    Assim o mesmo código serve os dois caminhos de reconectar. body {user, codigo}."""
    user = (payload or {}).get("user") or ""
    codigo = ((payload or {}).get("codigo") or "").strip()
    # username do IG só tem [A-Za-z0-9._]; sanitiza (e tira @) pra o <user>.txt nunca escapar o dir
    user = re.sub(r"[^A-Za-z0-9._]", "", user.strip().lstrip("@"))
    if not user or not codigo:
        raise HTTPException(400, "informe 'user' e 'codigo'")
    # (a) arquivo pro login do SERVER (ig_auth._desafio_handler lê codigos/<user>.txt)
    escrito = False
    try:
        os.makedirs(settings.CODIGOS_DIR, exist_ok=True)
        with open(os.path.join(settings.CODIGOS_DIR, f"{user}.txt"), "w", encoding="utf-8") as f:
            f.write(codigo)
        escrito = True
    except Exception as e:
        print(f"[codigo] não consegui gravar o arquivo de {user}: {e}", flush=True)
    # (b) store em memória pro login do EMULADOR (agente consome via GET /emulador/codigo)
    mgr.guardar_codigo(user, codigo)
    return {"ok": True, "user": user, "arquivo": escrito}


@app.get("/emulador/jobs", dependencies=[Depends(auth)])
async def emulador_reivindicar_job():
    """O agente reivindica o PRÓXIMO job pendente. {run_id, bot, conta:{label,id,…}, params}
    ou {} se a fila está vazia. Ao entregar, a Run vira 'rodando' e o job 'em_execucao'."""
    return await mgr.reivindicar_job()


@app.get("/emulador/jobs/{run_id}/parar", dependencies=[Depends(auth)])
async def emulador_job_parar(run_id: str):
    """O agente consulta se deve ABORTAR (passa como parar_flag no processar()). {parar: bool}."""
    return mgr.job_parar(run_id)


@app.post("/emulador/jobs/{run_id}/log", dependencies=[Depends(auth)])
async def emulador_job_log(run_id: str, payload: dict):
    """O agente manda UMA linha de log. Entra no MESMO pipeline do bot no server (parse de
    [progress]/[espera]/[saldo], LA, WS, cabeçalho, arquivo) via run.emitir."""
    run = mgr.get(run_id)
    if not run:
        raise HTTPException(404, "run não encontrado")
    linha = (payload or {}).get("linha")
    if linha is None:
        raise HTTPException(400, "informe 'linha'")
    await mgr.processar_linha(run, str(linha))
    return {"ok": True}


@app.post("/emulador/jobs/{run_id}/fim", dependencies=[Depends(auth)])
async def emulador_job_fim(run_id: str, payload: dict):
    """O agente finaliza o job. body {ok: bool, saldo: dict, motivo: str}. Fecha a Run
    (finalizado/erro, respeita 'parado'), grava histórico, encerra a LA e manda o push de fim."""
    run = mgr.get(run_id)
    if not run:
        raise HTTPException(404, "run não encontrado")
    p = payload or {}
    await mgr.finalizar_emulador(run, bool(p.get("ok", True)),
                                 p.get("saldo") or None, str(p.get("motivo") or ""))
    return {"ok": True, "status": run.status}


@app.websocket("/runs/{run_id}/logs")
async def ws_logs(ws: WebSocket, run_id: str, token: str = ""):
    if token != settings.API_TOKEN:
        await ws.close(code=4401)
        return
    r = mgr.get(run_id)
    if not r:
        # run fora da memória → serve o log salvo em disco e encerra (sem stream vivo)
        linhas = mgr.ler_log_arquivo(run_id)
        if linhas is None:
            await ws.close(code=4404)
            return
        await ws.accept()
        for l in linhas[-600:]:
            await ws.send_text(l)
        await ws.close()
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
