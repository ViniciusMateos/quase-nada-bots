"""
Painel de Sessão (local) — Quase Nada Bots.

Faz, pelo navegador do PC, o MESMO que a tela de Contas + login do app faz no celular:
lista as contas de Instagram (com status de sessão viva/caída) e, numa conta caída, abre um
navegador de verdade no login do IG pra você logar na mão, captura os cookies (inclusive o
`sessionid`, que é httpOnly e só dá pra ler por CDP/Playwright) e manda pro backend no mesmo
endpoint que o app usa (`POST /instagram/session`).

Por que um navegador do Playwright e não só uma página HTML? Porque o cookie que importa
(`sessionid`) é httpOnly: `document.cookie` não enxerga, e a Same-Origin Policy impede qualquer
página local de ler cookies de instagram.com. O app resolve isso com o CookieManager nativo do
WebView; aqui a gente resolve com um Chromium dirigido pelo Playwright, que lê o cookie store
inteiro do contexto.

Rodar:   python painel_sessao.py   (ou dê um duplo-clique em iniciar.bat)
Abre:    http://127.0.0.1:8777

Config (resolvida nesta ordem; a 1ª que existir ganha):
  Backend  → env QN_BACKEND_URL  | env EXPO_PUBLIC_API_URL | ../frontend/.env.local | padrão
  Token    → env QN_TOKEN        | env EXPO_PUBLIC_API_TOKEN| ../frontend/.env.local
  Porta    → env QN_PANEL_PORT (padrão 8777)

Nada de token no navegador: o painel fala só com ESTE servidor local, que guarda o token e
fala com o server 2 por baixo.
"""
import concurrent.futures
import json
import os
import queue
import shutil
import threading
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path

from fastapi import Body, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

RAIZ = Path(__file__).resolve().parent
INDEX = RAIZ / "index.html"
ENV_LOCAL = RAIZ.parent / "frontend" / ".env.local"
# app Expo exportado pra web (`expo export -p web`): quando existe, o `/` serve o APP INTEIRO
# (cópia do app no navegador); senão cai no painel simples de reconexão (index.html).
APP_DIST = RAIZ.parent / "frontend" / "dist-web"
APP_ICON = RAIZ.parent / "frontend" / "src" / "assets" / "icon.png"   # logo do app (aba do navegador)

# injetado no <head> do app ao servir: logo na aba + coluna estreita centralizada (pra não esticar
# o layout de celular na tela toda). Feito ao servir → sobrevive a reexportar o app.
_INJECT = (
    '<link rel="icon" type="image/png" href="/app-icon.png">'
    '<style>'
    'html,body{background:#0a0a0b;}'
    'body{display:flex;justify-content:center;}'
    '#root{width:100%;max-width:460px;box-shadow:0 0 0 1px #1b1b1e;}'
    '</style>'
)

URL_PADRAO = "https://quasenadaserver2.duckdns.org/bots"
# mesmo UA da checagem de sessão do backend (accounts.py _VALIDAR_UA): a sessão nasce e é
# validada com o MESMO fingerprint de navegador, menos motivo pro IG estranhar.
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36")
LOGIN_URL = "https://www.instagram.com/accounts/login/"


# ───────────────────────────── config ─────────────────────────────
def _ler_env_local():
    d = {}
    try:
        for linha in ENV_LOCAL.read_text(encoding="utf-8").splitlines():
            linha = linha.strip()
            if not linha or linha.startswith("#") or "=" not in linha:
                continue
            k, _, v = linha.partition("=")
            d[k.strip()] = v.strip().strip('"').strip("'")
    except Exception:
        pass
    return d


_ENV = _ler_env_local()
BACKEND = (os.environ.get("QN_BACKEND_URL") or os.environ.get("EXPO_PUBLIC_API_URL")
           or _ENV.get("EXPO_PUBLIC_API_URL") or URL_PADRAO).rstrip("/")
TOKEN = (os.environ.get("QN_TOKEN") or os.environ.get("EXPO_PUBLIC_API_TOKEN")
         or _ENV.get("EXPO_PUBLIC_API_TOKEN") or "")
PORTA = int(os.environ.get("QN_PANEL_PORT", "8777"))


# ───────────────────────── cliente do backend ─────────────────────
def _req(metodo, caminho, corpo=None, timeout=45):
    url = f"{BACKEND}{caminho}"
    dados = json.dumps(corpo).encode("utf-8") if corpo is not None else None
    r = urllib.request.Request(url, data=dados, method=metodo)
    r.add_header("Authorization", f"Bearer {TOKEN}")
    if dados is not None:
        r.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            txt = resp.read().decode("utf-8")
            return json.loads(txt) if txt else {}
    except urllib.error.HTTPError as e:
        corpo_err = ""
        try:
            corpo_err = e.read().decode("utf-8")
        except Exception:
            pass
        raise HTTPException(e.code, f"backend {e.code}: {corpo_err or e.reason}")
    except Exception as e:
        raise HTTPException(502, f"não consegui falar com o backend: {e}")


# ─────────────── navegador dirigido (Playwright, thread própria) ───────────────
# O Playwright sync NÃO pode rodar numa thread com event loop asyncio. Por isso ele vive numa
# thread dedicada, que é dona de TODOS os objetos do Playwright (afinidade de thread do sync
# API), e recebe comandos por fila. Os endpoints do FastAPI são `def` (síncronos) → o Starlette
# roda cada um numa threadpool, então dá pra bloquear esperando o resultado sem travar o loop.
class _InitScript:
    @staticmethod
    def montar(usuario, senha=""):
        """Script injetado no Chromium do login. SÓ pré-preenche usuário+senha na tela de login
        (campo de senha presente) e PARA assim que você mexe num campo. NÃO clica em NADA — nem
        'entrar', nem dispensar nag, nem 'pular'. Clicar sozinho jogava a conta nos fluxos de
        segurança quebrados da Meta (tela de 'adicione e-mail' + erro) e ficava ciclando captcha.
        Você loga e navega na mão; o painel captura a sessão quando o sessionid aparece."""
        if not (usuario or senha):
            return "true;"
        u = json.dumps(usuario or "")
        p = json.dumps(senha or "")
        return (
            "(function(){"
            "if(window.__qnFill)return;window.__qnFill=true;"
            "var U=" + u + ",P=" + p + ",mex=false;"
            "['keydown','touchstart','mousedown','paste'].forEach(function(ev){document.addEventListener(ev,function(e){var t=e.target;if(t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'))mex=true;},true);});"
            "var sv=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;"
            "function fill(el,val){if(el&&val&&!el.__qn&&!el.value){el.__qn=true;sv.call(el,val);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}}"
            "var n=0,iv=setInterval(function(){n++;if(mex||n>40){clearInterval(iv);return;}"
            "var pi=document.querySelector('input[type=\"password\"],input[name=\"password\"]');if(!pi)return;"
            "var ui=document.querySelector('input[name=\"username\"],input[autocomplete=\"username\"]');"
            "if(!ui&&pi.form){ui=Array.prototype.slice.call(pi.form.querySelectorAll('input')).filter(function(x){var t=(x.type||'text').toLowerCase();return t==='text'||t==='email'||t==='tel';})[0]||null;}"
            "fill(ui,U);fill(pi,P);"
            "},300);"
            "})();true;"
        )


class BrowserHub:
    def __init__(self):
        self._fila = queue.Queue()
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def _loop(self):
        from playwright.sync_api import sync_playwright
        ctxs = {}            # label -> BrowserContext (persistente, 1 Chrome por conta)
        PROFILES = RAIZ / "profiles"

        def _slug(s):
            return "".join(c for c in (s or "").lower() if c.isalnum()) or "conta"

        def _fechar(label):
            ctx = ctxs.pop(label, None)
            if ctx:
                try:
                    ctx.close()
                except Exception:
                    pass

        def _pagina(ctx):
            try:
                return ctx.pages[0] if ctx.pages else ctx.new_page()
            except Exception:
                return ctx.new_page()

        def _abrir(pw, label, usuario, senha, limpar=False):
            _fechar(label)
            pdir = PROFILES / _slug(label)
            if limpar:
                shutil.rmtree(pdir, ignore_errors=True)   # zera um perfil travado → login do zero
            pdir.mkdir(parents=True, exist_ok=True)
            # anti-captcha: PERFIL PERSISTENTE por conta (o IG passa a confiar no "aparelho", como
            # no celular) + MÁSCARA de automação (sem a flag --enable-automation e sem
            # navigator.webdriver, que o reCAPTCHA usa pra detectar bot e jogar desafio difícil).
            base = dict(user_data_dir=str(pdir), headless=False,
                        viewport={"width": 1180, "height": 820},
                        args=["--disable-blink-features=AutomationControlled",
                              "--no-first-run", "--no-default-browser-check"],
                        # tira a flag de automação E o --no-sandbox (o banner amarelo do
                        # --no-sandbox é sinal de automação pra Meta). Rodar COM sandbox é o normal.
                        ignore_default_args=["--enable-automation", "--no-sandbox"])
            try:
                ctx = pw.chromium.launch_persistent_context(channel="chrome", **base)   # Chrome real = fingerprint genuíno
            except Exception:
                ctx = pw.chromium.launch_persistent_context(user_agent=UA, **base)       # fallback: chromium do Playwright
            ctx.add_init_script("Object.defineProperty(navigator,'webdriver',{get:()=>undefined});")
            ctx.add_init_script(_InitScript.montar(usuario, senha))
            pg = _pagina(ctx)
            pg.goto(LOGIN_URL, wait_until="domcontentloaded", timeout=60000)
            ctxs[label] = ctx

        with sync_playwright() as pw:
            while True:
                acao, arg, fut = self._fila.get()
                if acao == "_parar":
                    break
                try:
                    if acao == "abrir":
                        label, usuario, senha, limpar = arg
                        _abrir(pw, label, usuario, senha, limpar)
                        fut.set_result({"ok": True})

                    elif acao == "status":
                        ctx = ctxs.get(arg)
                        if not ctx:
                            fut.set_result({"aberto": False})
                        else:
                            try:
                                url = _pagina(ctx).url
                                cks = ctx.cookies()
                                tem = any(c.get("name") == "sessionid" and c.get("value") for c in cks)
                                fut.set_result({"aberto": True, "url": url, "sessionid": tem})
                            except Exception:
                                ctxs.pop(arg, None)
                                fut.set_result({"aberto": False})

                    elif acao == "cookies":
                        ctx = ctxs.get(arg)
                        if not ctx:
                            fut.set_result(None)
                        else:
                            cks = [c for c in ctx.cookies() if "instagram.com" in (c.get("domain") or "")]
                            fut.set_result(cks)

                    elif acao == "fechar":
                        _fechar(arg)
                        fut.set_result({"ok": True})

                except Exception as e:
                    fut.set_exception(e)

    def _chamar(self, acao, arg):
        fut = concurrent.futures.Future()
        self._fila.put((acao, arg, fut))
        return fut.result()

    def abrir(self, label, usuario, senha="", limpar=False):
        return self._chamar("abrir", (label, usuario, senha, limpar))

    def status(self, label):
        return self._chamar("status", label)

    def cookies(self, label):
        return self._chamar("cookies", label)

    def fechar(self, label):
        return self._chamar("fechar", label)


hub = BrowserHub()


# ───────────────────────────── app ─────────────────────────────
app = FastAPI(title="Painel de Sessão — Quase Nada Bots")
# libera o app web (dev server do Expo em :8081, ou servido daqui mesmo) a chamar os endpoints
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def _icon_response():
    if APP_ICON.exists():
        return Response(APP_ICON.read_bytes(), media_type="image/png")
    return Response(status_code=204)


@app.get("/", response_class=HTMLResponse)
def home():
    idx = APP_DIST / "index.html"
    if idx.exists():
        html = idx.read_text(encoding="utf-8")
        return html.replace("</head>", _INJECT + "</head>", 1)   # logo + coluna estreita
    return INDEX.read_text(encoding="utf-8")      # fallback: painel de reconexão


@app.get("/favicon.ico")
def favicon():
    return _icon_response()


@app.get("/app-icon.png")
def app_icon():
    return _icon_response()


@app.get("/painel", response_class=HTMLResponse)
def painel():
    """O painel simples de reconexão (lista de contas + reconectar), mesmo com o app completo no /."""
    return INDEX.read_text(encoding="utf-8")


@app.get("/api/config")
def config():
    return {"backend": BACKEND, "tem_token": bool(TOKEN)}


@app.get("/api/contas")
def contas(force: int = 0):
    if not TOKEN:
        raise HTTPException(500, "sem token: defina EXPO_PUBLIC_API_TOKEN no ../frontend/.env.local ou QN_TOKEN")
    return _req("GET", f"/accounts/validar?force={1 if force else 0}", timeout=60)


@app.get("/api/grupos")
def grupos():
    if not TOKEN:
        raise HTTPException(500, "sem token")
    return _req("GET", "/grupos", timeout=30)


@app.post("/api/ativar")
def ativar(payload: dict = Body(...)):
    """Torna a conta a ATIVA (copia a sessão dela pro arquivo central que os bots leem) — mesmo
    que o botão 'ativar' do app."""
    cid = (payload.get("id") or "").strip()
    if not cid:
        raise HTTPException(400, "informe o id da conta")
    return _req("POST", f"/accounts/{cid}/ativar", {}, timeout=30)


@app.post("/api/abrir")
def abrir(payload: dict = Body(...)):
    label = (payload.get("label") or "").strip()
    if not label:
        raise HTTPException(400, "informe o label (@ da conta)")
    # usa o @ como pré-preenchimento SÓ se parecer um handle (não um id 'pend:' interno)
    usuario = "" if label.startswith("pend:") else label.lstrip("@")
    senha = (payload.get("senha") or "")   # credencial salva — só pré-preenche o login
    limpar = bool(payload.get("limpar"))   # zera o perfil (login do zero) se travou
    try:
        hub.abrir(label, usuario, senha, limpar)
    except Exception as e:
        raise HTTPException(500, f"não consegui abrir o navegador: {e}")
    return {"ok": True}


@app.get("/api/status")
def status(label: str):
    try:
        return hub.status(label)
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/api/conectar")
def conectar(payload: dict = Body(...)):
    label = (payload.get("label") or "").strip()
    if not label:
        raise HTTPException(400, "informe o label")
    try:
        cks = hub.cookies(label)
    except Exception as e:
        raise HTTPException(500, f"erro ao ler cookies: {e}")
    if cks is None:
        raise HTTPException(409, "a janela do navegador não está aberta — clique em Reconectar de novo")
    if not any(c.get("name") == "sessionid" and c.get("value") for c in cks):
        raise HTTPException(400, "ainda não achei a sessão (sessionid). Confirma que você entrou na conta e tenta de novo")
    cookies = [{
        "name": c.get("name"), "value": c.get("value"),
        "domain": c.get("domain") or ".instagram.com", "path": c.get("path") or "/",
        "secure": bool(c.get("secure", True)), "httpOnly": bool(c.get("httpOnly", False)),
        "sameSite": "Lax", "session": True,
    } for c in cks]
    # mesmo endpoint do app: salva a sessão da conta, deixa ativa e dispara a run de import.
    envio = {"cookies": cookies}
    if not label.startswith("pend:"):
        envio["label"] = label.lstrip("@")
    res = _req("POST", "/instagram/session", envio, timeout=60)
    try:
        hub.fechar(label)
    except Exception:
        pass
    return res


@app.post("/api/fechar")
def fechar(payload: dict = Body(...)):
    label = (payload.get("label") or "").strip()
    if label:
        try:
            hub.fechar(label)
        except Exception:
            pass
    return {"ok": True}


# assets do app exportado (/_expo/... e /assets/...). Montados por último pra não cobrir os /api.
if (APP_DIST / "_expo").exists():
    app.mount("/_expo", StaticFiles(directory=str(APP_DIST / "_expo")), name="expo")
if (APP_DIST / "assets").exists():
    app.mount("/assets", StaticFiles(directory=str(APP_DIST / "assets")), name="assets")


def _abrir_navegador():
    import time
    time.sleep(1.2)
    try:
        webbrowser.open(f"http://127.0.0.1:{PORTA}")
    except Exception:
        pass


if __name__ == "__main__":
    import uvicorn
    print(f"\n  Painel de Sessão — Quase Nada Bots")
    print(f"  backend : {BACKEND}")
    print(f"  token   : {'ok' if TOKEN else 'FALTANDO (veja o README)'}")
    print(f"  painel  : http://127.0.0.1:{PORTA}\n")
    threading.Thread(target=_abrir_navegador, daemon=True).start()
    uvicorn.run(app, host="127.0.0.1", port=PORTA, log_level="warning")
