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
import base64
import concurrent.futures
import email
import imaplib
import json
import os
import queue
import re
import shutil
import threading
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from email.header import decode_header
from pathlib import Path

from fastapi import Body, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

RAIZ = Path(__file__).resolve().parent
INDEX = RAIZ / "index.html"
CRIAR = RAIZ / "criar.html"
GMAIL_CFG = RAIZ / "gmail_config.json"     # {contas:[{user, senha_app}]} — gitignored (credencial)
FOTOS = RAIZ / "fotos"                     # foto de perfil por conta (gitignored)
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
SIGNUP_URL = "https://www.instagram.com/accounts/emailsignup/"


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


# ───────────────────────── Gmail (código automático) ─────────────────────────
# Lê a caixa do Gmail por IMAP pra pegar o código de verificação que o IG manda no cadastro.
# Credencial: APP PASSWORD do Google (16 letras, com 2FA ligado) — NÃO é a senha normal. Precisa
# do IMAP ligado no Gmail. Guardada em gmail_config.json (gitignored) ou nas envs QN_GMAIL_*.
def _gmail_lista():
    """Lista de contas de Gmail [{user, senha_app}]. Lê gmail_config.json (formato novo
    {"contas":[...]} ou antigo {"user","senha_app"}) e soma a env QN_GMAIL_* como uma conta."""
    out = []
    try:
        d = json.loads(GMAIL_CFG.read_text(encoding="utf-8"))
        if isinstance(d, dict) and isinstance(d.get("contas"), list):
            out = [c for c in d["contas"] if c.get("user") and c.get("senha_app")]
        elif isinstance(d, dict) and d.get("user") and d.get("senha_app"):   # formato antigo
            out = [{"user": d["user"], "senha_app": d["senha_app"]}]
    except Exception:
        pass
    eu, ep = os.environ.get("QN_GMAIL_USER"), os.environ.get("QN_GMAIL_APP_PASSWORD")
    if eu and ep and not any(c["user"].lower() == eu.lower() for c in out):
        out.append({"user": eu, "senha_app": ep})
    return [{"user": c["user"].strip(), "senha_app": c["senha_app"].replace(" ", "").strip()} for c in out]


def _gmail_salvar(lista):
    GMAIL_CFG.write_text(json.dumps({"contas": lista}, ensure_ascii=False), encoding="utf-8")
    try:
        GMAIL_CFG.chmod(0o600)   # é credencial
    except Exception:
        pass


def _gmail_add(user, senha_app):
    user = (user or "").strip()
    senha_app = (senha_app or "").replace(" ", "").strip()
    if not user or not senha_app:
        raise ValueError("email e app password são obrigatórios")
    # só as de ARQUIVO (não as de env, que não dá pra apagar); dedup por email
    base = [c for c in _gmail_lista() if not (os.environ.get("QN_GMAIL_USER", "").lower() == c["user"].lower())]
    base = [c for c in base if c["user"].lower() != user.lower()]
    base.append({"user": user, "senha_app": senha_app})
    _gmail_salvar(base)
    return base


def _gmail_remover(user):
    base = [c for c in _gmail_lista() if c["user"].lower() != (user or "").lower()
            and not (os.environ.get("QN_GMAIL_USER", "").lower() == c["user"].lower())]
    _gmail_salvar(base)
    return base


def _gmail_senha(email):
    for c in _gmail_lista():
        if c["user"].lower() == (email or "").lower():
            return c["senha_app"]
    return None


def _gmail_base_do_alias(alias):
    """'meuemail+segue13@gmail.com' -> 'meuemail@gmail.com' (tira o +tag)."""
    return re.sub(r"\+[^@]*(?=@)", "", alias or "")


def _foto_slug(label):
    return "".join(c for c in (label or "").lower() if c.isalnum()) or "conta"


def _foto_path(label):
    """Caminho da foto de perfil salva pra essa conta, ou None."""
    for p in FOTOS.glob(f"{_foto_slug(label)}.*"):
        return str(p)
    return None


def _dec(s):
    """Decodifica header MIME (Subject/To) pra texto legível."""
    try:
        return "".join(
            (p.decode(enc or "utf-8", "ignore") if isinstance(p, bytes) else p)
            for p, enc in decode_header(s or "")
        )
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
    """Pega um código de 6 dígitos no texto (aceita '123456' e '123 456')."""
    m = re.search(r"(?<!\d)(\d{3})\s?(\d{3})(?!\d)", texto or "")
    return (m.group(1) + m.group(2)) if m else None


def buscar_codigo_gmail(alias=None):
    """Conecta no Gmail por IMAP e devolve o código de verificação do IG mais recente (preferindo
    o email cujo destinatário bate com o +alias da conta). None se não achar. Levanta em erro de
    credencial/conexão."""
    base = _gmail_base_do_alias(alias) if alias else ""
    pw = _gmail_senha(base)
    if not pw:                                  # alias não bateu com conta cadastrada → 1ª da lista
        lista = _gmail_lista()
        if not lista:
            raise RuntimeError("Nenhuma conta de Gmail cadastrada.")
        base, pw = lista[0]["user"], lista[0]["senha_app"]
    M = imaplib.IMAP4_SSL("imap.gmail.com")
    try:
        M.login(base, pw)
        M.select("INBOX")
        typ, data = M.search(None, '(FROM "instagram")')
        ids = (data[0].split() if data and data[0] else [])[-15:]
        cands = []   # (tem_alias, code)
        for i in reversed(ids):
            typ, md = M.fetch(i, "(RFC822)")
            if not md or not md[0]:
                continue
            msg = email.message_from_bytes(md[0][1])
            dest = (_dec(msg.get("To", "")) + " " + _dec(msg.get("Delivered-To", "")) +
                    " " + _dec(msg.get("X-Original-To", ""))).lower()
            code = _achar_codigo(_dec(msg.get("Subject", ""))) or _achar_codigo(_corpo(msg))
            if not code:
                continue
            tem_alias = bool(alias) and alias.lower() in dest
            cands.append((tem_alias, code))
            if tem_alias:
                return code            # alias bateu → é esse
        return cands[0][1] if cands else None   # senão, o IG mais recente
    finally:
        try:
            M.logout()
        except Exception:
            pass


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

    @staticmethod
    def signup(email="", nome="", username="", senha="", dia="", mes="", ano=""):
        """Script injetado no cadastro do IG (emailsignup). Preenche email, nome, usuário e senha
        na 1ª tela e, best-effort, o aniversário (selects Mês/Dia/Ano) na tela seguinte. PARA
        assim que você mexe num campo e NÃO clica em nada (captcha/código no email são na mão)."""
        j = json.dumps
        return (
            "(function(){"
            "if(window.__qnSignup)return;window.__qnSignup=true;"
            "var E=" + j(email or "") + ",N=" + j(nome or "") + ",U=" + j(username or "") + ",P=" + j(senha or "") + ";"
            "var DIA=" + j(str(dia or "")) + ",MES=" + j(str(mes or "")) + ",ANO=" + j(str(ano or "")) + ",mex=false;"
            "['keydown','touchstart','mousedown','paste'].forEach(function(ev){document.addEventListener(ev,function(e){var t=e.target;if(t&&(t.tagName==='INPUT'||t.tagName==='SELECT'||t.tagName==='TEXTAREA'))mex=true;},true);});"
            "var sv=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;"
            "function fill(sel,val){var el=document.querySelector(sel);if(el&&val&&!el.__qn&&!el.value){el.__qn=true;sv.call(el,val);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}}"
            # username: SOBRESCREVE a sugestão do IG (sem checar !value), até 8x
            "function fillO(sel,val){var el=document.querySelector(sel);if(el&&val&&(el.__qtry||0)<8&&el.value!==val){el.__qtry=(el.__qtry||0)+1;sv.call(el,val);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}}"
            "function selData(){var ss=[].slice.call(document.querySelectorAll('select'));"
            "ss.forEach(function(s){if(s.__qn||!s.options||!s.options.length)return;var nopt=s.options.length,done=false;"
            "var lab=((s.getAttribute('title')||'')+' '+(s.getAttribute('aria-label')||'')).toLowerCase();"
            "function pick(v){for(var i=0;i<nopt;i++){if((s.options[i].text||'').trim()===String(v)){s.selectedIndex=i;return true;}}return false;}"
            # aniversário por LABEL ou por nº de opções (12-13=mês, 28-32=dia, >40=ano) — independe do idioma
            "var ehMes=(lab.indexOf('mês')>=0||lab.indexOf('mes')>=0||lab.indexOf('month')>=0)||(nopt>=12&&nopt<=13);"
            "var ehDia=(lab.indexOf('dia')>=0||lab.indexOf('day')>=0)||(nopt>=28&&nopt<=32);"
            "var ehAno=(lab.indexOf('ano')>=0||lab.indexOf('year')>=0)||(nopt>40);"
            "if(ehMes&&MES){if(!pick(MES)){s.selectedIndex=(nopt>=13?parseInt(MES,10):parseInt(MES,10)-1);}done=true;}"
            "else if(ehDia&&DIA){done=pick(DIA);}else if(ehAno&&ANO){done=pick(ANO);}"
            "if(done){s.__qn=true;s.dispatchEvent(new Event('input',{bubbles:true}));s.dispatchEvent(new Event('change',{bubbles:true}));}});"
            "var di=document.querySelector('input[type=\"date\"]');"
            "if(di&&!di.__qn&&DIA&&MES&&ANO){di.__qn=true;var v=ANO+'-'+('0'+MES).slice(-2)+'-'+('0'+DIA).slice(-2);sv.call(di,v);di.dispatchEvent(new Event('input',{bubbles:true}));di.dispatchEvent(new Event('change',{bubbles:true}));}}"
            "var n=0;var iv=setInterval(function(){n++;if(n>240){clearInterval(iv);return;}"
            # força o modo EMAIL: sem campo de email na tela = tá no modo telefone → clica 'Cadastre-se com e-mail'
            "if(!document.querySelector('input[name=\"emailOrPhone\"],input[type=\"email\"],input[autocomplete=\"email\"]')){"
            "var bs=[].slice.call(document.querySelectorAll('button,div[role=\"button\"],a,span[role=\"button\"]'));"
            "var eb=bs.filter(function(x){var t=(x.textContent||'').trim().toLowerCase();return t.length<40&&(t.indexOf('e-mail')>=0||t.indexOf('email')>=0)&&t.indexOf('celular')<0&&t.indexOf('telefone')<0&&t.indexOf('phone')<0;})[0];"
            "if(eb){eb.click();return;}}"
            "fill('input[name=\"emailOrPhone\"],input[type=\"email\"],input[autocomplete=\"email\"]',E);"
            "fill('input[name=\"fullName\"],input[autocomplete=\"name\"],input[aria-label*=\"nome completo\" i],input[aria-label*=\"full name\" i]',N);"
            "fillO('input[name=\"username\"],input[autocomplete=\"username\"],input[aria-label*=\"usu\\u00e1rio\" i],input[aria-label*=\"usuario\" i],input[aria-label*=\"username\" i]',U);"
            "fill('input[name=\"password\"],input[type=\"password\"],input[aria-label*=\"senha\" i],input[aria-label*=\"password\" i]',P);"
            "selData();"
            "},400);"
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

        def _abrir(pw, label, usuario, senha, limpar=False, signup=None):
            _fechar(label)
            pdir = PROFILES / _slug(label)
            if limpar or signup:
                shutil.rmtree(pdir, ignore_errors=True)   # perfil limpo (conta nova / recomeçar)
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
            if signup:
                ctx.add_init_script(_InitScript.signup(**signup))
                url = SIGNUP_URL
            else:
                ctx.add_init_script(_InitScript.montar(usuario, senha))
                url = LOGIN_URL
            pg = _pagina(ctx)
            pg.goto(url, wait_until="domcontentloaded", timeout=60000)
            ctxs[label] = ctx

        with sync_playwright() as pw:
            while True:
                acao, arg, fut = self._fila.get()
                if acao == "_parar":
                    break
                try:
                    if acao == "abrir":
                        label, usuario, senha, limpar, signup = arg
                        _abrir(pw, label, usuario, senha, limpar, signup)
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

                    elif acao == "codigo":
                        label, code = arg
                        ctx = ctxs.get(label)
                        if not ctx:
                            fut.set_result({"ok": False, "erro": "janela fechada"})
                        else:
                            js = """(code)=>{
                              var sel='input[name=\"email_confirmation_code\"],input[name=\"confirmationCode\"],input[autocomplete=\"one-time-code\"],input[aria-label*=\"onfirma\"],input[aria-label*=\"\\u00f3digo\"],input[aria-label*=\"code\"]';
                              var el=document.querySelector(sel);
                              if(!el){var ins=[].slice.call(document.querySelectorAll('input'));
                                el=ins.filter(function(x){var t=(x.type||'text').toLowerCase();return (t==='text'||t==='tel'||t==='number')&&!x.value&&x.offsetParent;})[0];}
                              if(!el)return false;
                              var sv=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
                              sv.call(el,code);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
                              setTimeout(function(){var bs=[].slice.call(document.querySelectorAll('button,div[role=\"button\"],[type=\"submit\"]'));
                                var b=bs.filter(function(x){var t=(x.textContent||'').trim().toLowerCase();return t==='avan\\u00e7ar'||t==='avancar'||t==='next'||t==='confirmar'||t==='continuar'||t==='seguinte'||t==='pr\\u00f3ximo';})[0];
                                if(b)b.click();},500);
                              return true;}"""
                            try:
                                ok = _pagina(ctx).evaluate(js, code)
                                fut.set_result({"ok": bool(ok)})
                            except Exception as e:
                                fut.set_result({"ok": False, "erro": str(e)})

                    elif acao == "perfil":
                        lbl, bio, foto = arg
                        ctx = ctxs.get(lbl)
                        if not ctx:
                            fut.set_result({"ok": False, "erro": "janela fechada"})
                        else:
                            pg = _pagina(ctx)
                            res = {"bio": False, "foto": False}
                            try:
                                pg.goto("https://www.instagram.com/accounts/edit/", wait_until="domcontentloaded", timeout=60000)
                                pg.wait_for_timeout(3000)
                                if foto:
                                    try:
                                        inp = pg.query_selector('input[type="file"]')
                                        if inp:
                                            inp.set_input_files(foto)
                                            res["foto"] = True
                                            pg.wait_for_timeout(2500)   # aplica (pode abrir modal)
                                    except Exception:
                                        pass
                                if bio:
                                    try:
                                        ta = pg.query_selector('textarea')   # a 1ª textarea do edit é a bio
                                        if ta:
                                            ta.fill(bio)
                                            res["bio"] = True
                                    except Exception:
                                        pass
                                try:   # salva (botão Enviar/Submit)
                                    btn = (pg.query_selector('button[type="submit"]')
                                           or pg.query_selector('div[role="button"]:has-text("Enviar")'))
                                    if btn:
                                        btn.click()
                                        pg.wait_for_timeout(1500)
                                except Exception:
                                    pass
                            except Exception as e:
                                res["erro"] = str(e)
                            fut.set_result(res)

                    elif acao == "fechar":
                        _fechar(arg)
                        fut.set_result({"ok": True})

                except Exception as e:
                    fut.set_exception(e)

    def _chamar(self, acao, arg):
        fut = concurrent.futures.Future()
        self._fila.put((acao, arg, fut))
        return fut.result()

    def abrir(self, label, usuario, senha="", limpar=False, signup=None):
        return self._chamar("abrir", (label, usuario, senha, limpar, signup))

    def status(self, label):
        return self._chamar("status", label)

    def cookies(self, label):
        return self._chamar("cookies", label)

    def fechar(self, label):
        return self._chamar("fechar", label)

    def codigo(self, label, code):
        return self._chamar("codigo", (label, code))

    def perfil(self, label, bio, foto):
        return self._chamar("perfil", (label, bio, foto))


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


@app.get("/criar", response_class=HTMLResponse)
def criar_page():
    """Facilitador de criar conta nova no Instagram (gera dados + abre o cadastro preenchido)."""
    return CRIAR.read_text(encoding="utf-8")


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


@app.post("/api/grupo-add")
def grupo_add(payload: dict = Body(...)):
    """Adiciona UMA conta a um grupo (sem tirar as outras). O backend só tem PUT que substitui a
    lista inteira, então aqui lemos os membros atuais, somamos o id novo e regravamos."""
    nome = (payload.get("nome") or "").strip()
    cid = (payload.get("id") or "").strip()
    if not nome or not cid:
        raise HTTPException(400, "informe nome do grupo e id da conta")
    grupos_atuais = _req("GET", "/grupos", timeout=30)
    atual = next((g for g in grupos_atuais if g.get("nome") == nome), None)
    membros = list((atual or {}).get("contas") or [])
    if cid not in membros:
        membros.append(cid)
    return _req("PUT", f"/grupos/{urllib.parse.quote(nome, safe='')}", {"contas": membros}, timeout=30)


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


# Gmail agora é DO SERVER 2 (lista compartilhada com o celular): o painel só faz proxy. Assim as
# contas de Gmail e o código por IMAP são os mesmos no web e no app.
@app.get("/api/gmail/status")
def gmail_status():
    lista = _req("GET", "/gmail/contas", timeout=20)
    return {"configurado": bool(lista), "n": len(lista)}


@app.get("/api/gmail/contas")
def gmail_contas():
    return _req("GET", "/gmail/contas", timeout=20)


@app.post("/api/gmail/contas")
def gmail_add(payload: dict = Body(...)):
    return _req("POST", "/gmail/contas", {"user": payload.get("user"), "senha_app": payload.get("senha_app")}, timeout=20)


@app.post("/api/gmail/remover")
def gmail_rem(payload: dict = Body(...)):
    return _req("POST", "/gmail/remover", {"user": (payload.get("user") or "").strip()}, timeout=20)


@app.post("/api/gmail/config")   # compat: o /criar antigo ainda usa; adiciona na lista
def gmail_config(payload: dict = Body(...)):
    _req("POST", "/gmail/contas", {"user": payload.get("user"), "senha_app": payload.get("senha_app")}, timeout=20)
    return {"configurado": True}


@app.get("/api/gmail/codigo")
def gmail_codigo(alias: str = ""):
    return _req("GET", f"/gmail/codigo?alias={urllib.parse.quote(alias or '')}", timeout=45)


@app.get("/api/criar/ultima-foto")
def criar_ultima_foto():
    try:
        return _req("GET", "/criar/ultima-foto", timeout=20)
    except Exception:
        return {"dataUrl": ""}


@app.post("/api/criar/foto")
def criar_foto(payload: dict = Body(...)):
    """Recebe a foto de perfil (data URL base64) e salva por conta, pro bot subir no perfil depois."""
    label = (payload.get("label") or "").strip() or "conta"
    data_url = payload.get("dataUrl") or ""
    m = re.match(r"data:image/(\w+);base64,(.+)$", data_url, re.S)
    if not m:
        raise HTTPException(400, "imagem inválida")
    ext = m.group(1).lower().replace("jpeg", "jpg")
    FOTOS.mkdir(parents=True, exist_ok=True)
    slug = _foto_slug(label)
    for old in FOTOS.glob(f"{slug}.*"):   # troca a anterior
        try:
            old.unlink()
        except Exception:
            pass
    try:
        (FOTOS / f"{slug}.{ext}").write_bytes(base64.b64decode(m.group(2)))
    except Exception as e:
        raise HTTPException(400, f"não salvou a foto: {e}")
    return {"ok": True}


@app.post("/api/criar/perfil")
def criar_perfil(payload: dict = Body(...)):
    """Aplica bio + foto no perfil da conta recém-criada (best-effort, com a sessão ainda aberta)."""
    label = (payload.get("label") or "").strip()
    if not label:
        raise HTTPException(400, "informe label")
    try:
        return hub.perfil(label, payload.get("bio") or "", _foto_path(label))
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/api/criar/codigo")
def criar_codigo(payload: dict = Body(...)):
    """Preenche o código na janela do cadastro (e tenta avançar)."""
    label = (payload.get("label") or "").strip()
    code = (payload.get("code") or "").strip()
    if not label or not code:
        raise HTTPException(400, "informe label e code")
    try:
        return hub.codigo(label, code)
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/api/criar/abrir")
def criar_abrir(payload: dict = Body(...)):
    """Abre o CADASTRO do Instagram num Chromium, já preenchido com os dados da conta nova.
    A verificação (captcha + código no e-mail) e o aniversário você confere/resolve na mão; o
    label é o username novo (vira a chave do perfil e da captura de sessão depois)."""
    username = (payload.get("username") or "").strip().lstrip("@")
    if not username:
        raise HTTPException(400, "informe o username")
    signup = {
        "email": (payload.get("email") or "").strip(),
        "nome": (payload.get("nome") or "").strip(),
        "username": username,
        "senha": (payload.get("senha") or ""),
        "dia": str(payload.get("dia") or ""),
        "mes": str(payload.get("mes") or ""),
        "ano": str(payload.get("ano") or ""),
    }
    try:
        hub.abrir(username, username, signup["senha"], False, signup)
    except Exception as e:
        raise HTTPException(500, f"não consegui abrir o cadastro: {e}")
    return {"ok": True, "label": username}


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
