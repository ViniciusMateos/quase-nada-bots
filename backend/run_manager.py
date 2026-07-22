"""
Gerenciador de execuções: roda cada bot como subprocesso, captura o stdout linha
a linha e faz broadcast pros assinantes (WebSocket). Suporta runs simultâneos e parar.
"""
import asyncio
import itertools
import json
import os
import re
import signal
import time
from collections import deque

import bots
import history
import liveactivity
import notify
import settings

_counter = itertools.count(1)

# os workers logam como "2026-07-16 15:04:01  INFO   Abrindo navegador…" — pra mostrar
# na Live Activity a gente quer só a frase, sem o carimbo de data/nível.
_PREFIXO = re.compile(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\s+\w+\s+")


def _limpar_linha(linha):
    return _PREFIXO.sub("", (linha or "").strip()).strip()


def _proc_info(bot_id, params):
    """Textos por TIPO de processo (rodar o bot × conectar o Instagram). Conectar é um
    processo de primeira classe: tem título próprio, notificação de fim e Live Activity —
    senão o usuário toca em "Conectar" e não recebe retorno nenhum se deu certo."""
    nome = bots.BOTS.get(bot_id, {}).get("nome", bot_id)
    if (params or {}).get("import_cookies"):
        return {
            "titulo": "Conectando Instagram",
            "fim_ok": ("Instagram conectado", f"Sessão salva no {nome} — já pode rodar."),
            "fim_erro": ("Deu ruim", f"Não consegui conectar o Instagram no {nome}."),
            "fim_parado": ("Parado", f"A conexão do Instagram no {nome} foi parada."),
        }
    return {
        "titulo": nome,
        "fim_ok": ("Terminou", f"{nome} finalizou."),
        "fim_erro": ("Deu ruim", f"{nome} parou com erro."),
        "fim_parado": ("Parado", f"{nome} foi parado."),
    }


def _parse_progress(linha):
    """`[progress] <feitos> <total> <label...>` → dict (ou None se malformado)."""
    try:
        resto = linha[len("[progress]"):].strip()
        partes = resto.split(None, 2)
        done, total = int(partes[0]), int(partes[1])
        label = partes[2] if len(partes) > 2 else ""
        return {"done": done, "total": total, "label": label}
    except Exception:
        return None


def _parse_saldo(linha):
    """`[saldo] k=v k=v …` (em qualquer lugar da linha) → dict {k: int|str}."""
    i = linha.find("[saldo]")
    if i < 0:
        return None
    d = {}
    for tok in linha[i + len("[saldo]"):].split():
        if "=" not in tok:
            continue
        k, v = tok.split("=", 1)
        try:
            d[k] = int(v)
        except ValueError:
            d[k] = v
    return d or None


class Run:
    def __init__(self, bot_id, params):
        self.id = f"run-{next(_counter)}"
        self.bot = bot_id
        self.params = params or {}
        self.status = "iniciando"      # iniciando | rodando | finalizado | parado | erro
        self.started_at = time.time()
        self.ended_at = None
        self.returncode = None
        self.progress = None           # {done, total, label} — última barra reportada
        self.saldo = None              # {seguidos, pedidos, …} — do marcador [saldo]
        self.bloqueio = False          # detectou bloqueio do IG no log?
        self.linhas = deque(maxlen=settings.MAX_LOG_LINES)
        # cabeçalho: as primeiras ~30 linhas do run (Modo/Proxy/Conta/início da varredura)
        # preservadas PRA SEMPRE. Sem isso, num run longo o buffer rolante evicta o começo e
        # você perde o contexto de abertura — que é justo o que o usuário quer ver sempre.
        self.cabecalho = []
        self._truncou = False          # o buffer rolante já cortou linhas do meio?
        self.ult_linha_t = time.time() # quando saiu a última linha (watchdog de travamento)
        self.subs = set()              # set[asyncio.Queue]
        self.proc = None
        self._ult_push_pct = -100      # throttle dos pushes de progresso
        self._ult_push_t = 0.0
        # última linha humana do log — vira o texto da Live Activity enquanto o bot ainda
        # não sabe o tamanho da fila (~70s abrindo navegador e logando).
        # (NÃO chamar de `status`: já existe, é o estado da run.)
        self.status_log = None
        # nome do PROCESSO (não do bot): rodar o Auto Follow × conectar o Instagram são
        # coisas diferentes, e o widget flutuante mostra isto
        self.titulo = _proc_info(bot_id, self.params)["titulo"]

    def info(self):
        return {
            "id": self.id, "bot": self.bot, "status": self.status,
            "titulo": self.titulo,
            "started_at": self.started_at, "ended_at": self.ended_at,
            "returncode": self.returncode, "params": self.params,
            "linhas": len(self.linhas), "progress": self.progress,
            "status_log": self.status_log,     # a LINHA VIVA (o que está logando agora) —
                                               # a home e o widget mostram isto embaixo do nome
        }

    async def emitir(self, linha):
        self.ult_linha_t = time.time()                  # heartbeat pro watchdog de travamento
        if len(self.cabecalho) < 30:                    # guarda o começo do run pra sempre
            self.cabecalho.append(linha)
        if len(self.linhas) == self.linhas.maxlen:      # o buffer rolante vai evictar o head
            self._truncou = True
        self.linhas.append(linha)
        for q in list(self.subs):
            try:
                q.put_nowait(linha)
            except Exception:
                pass


class RunManager:
    # onde o token da Live Activity é persistido (sobrevive a restart do backend)
    _LA_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "la_token.json")

    def __init__(self):
        self.runs = {}
        # ── Live Activity: UMA pro app inteiro (não uma por run). O token e o throttle
        # vivem aqui porque o conjunto é que é exibido — o app cria a activity, o server
        # soma as runs e empurra.
        self.la_token = None
        self.la_bundle = None
        self.la_activity_id = None   # id da activity dona do token atual (distingue rotação de sessão nova)
        self._ult_la_pct = -100
        self._ult_la_t = 0.0
        self._carregar_la_token()   # sobrevive a restart (senão a LA congela/some no restart)

    def _carregar_la_token(self):
        try:
            with open(self._LA_FILE, encoding="utf-8") as f:
                d = json.load(f)
            self.la_token = d.get("token") or None
            self.la_bundle = d.get("bundle") or None
            self.la_activity_id = d.get("activity_id") or None
        except Exception:
            pass

    async def registrar_la_token(self, token, bundle, activity_id):
        """Registra o token da Live Activity vindo do app. O activity_id é a chave anti-órfã:

          - MESMO id do atual (ou id vazio) → é ROTAÇÃO de token da MESMA LA. Só troca o token.
          - id DIFERENTE → é uma LA NOVA (sessão nova). A LA antiga do id anterior pode ter
            ficado órfã (app morto/run zumbi não mandou 'end') — e o endAll nativo do app NÃO
            mata LA de launch passado. Aqui o server AINDA tem o token dela, então encerra a
            velha via APNs ANTES de assumir a nova. É isso que impede a Dynamic Island rachada.
        """
        token = (token or "").strip() or None
        activity_id = (activity_id or "").strip() or None
        muda_activity = bool(activity_id and self.la_activity_id and activity_id != self.la_activity_id)
        if muda_activity and self.la_token:
            estado = {"titulo": "", "pct": 0, "medido": False, "label": "",
                      "quantos": 0, "bot": "", "linhas": []}
            try:
                ok, det = await asyncio.to_thread(
                    liveactivity.encerrar, self.la_token, estado, self.la_bundle)
                print(f"[la] activity trocou ({self.la_activity_id}->{activity_id}) → "
                      f"encerrei a antiga (anti-órfã) ok={ok}"
                      + ("" if ok else f" DET={det}"), flush=True)
            except Exception as e:
                print(f"[la] encerrar antiga explodiu: {e}", flush=True)
        self.set_la(token, bundle, activity_id)

    def set_la(self, token, bundle, activity_id=None):
        """Guarda o token+bundle+activity_id da Live Activity E PERSISTE em disco. Sem persistir,
        um restart do backend perdia o token → o server parava de empurrar a barra, a LA
        congelava/sumia, e o app NÃO reenviava (achava que a LA ainda existia)."""
        self.la_token = (token or "").strip() or None
        self.la_bundle = bundle or None
        self.la_activity_id = (activity_id or "").strip() or None
        try:
            with open(self._LA_FILE, "w", encoding="utf-8") as f:
                json.dump({"token": self.la_token, "bundle": self.la_bundle,
                           "activity_id": self.la_activity_id}, f)
        except Exception:
            pass

    def _limpar_la(self):
        self.la_token = None
        self.la_bundle = None
        self.la_activity_id = None
        try:
            os.remove(self._LA_FILE)
        except Exception:
            pass

    def _ativas(self):
        return [r for r in self.runs.values() if r.status in ("rodando", "iniciando")]

    def _pct(self, run):
        p = run.progress
        if not (p and p.get("total")):
            return 0
        return max(0, min(100, round(p["done"] / p["total"] * 100)))

    def _estado_la(self):
        """Monta o que a Live Activity mostra. Devolve None se não há nada rodando.

        UMA activity pro app, então aqui é onde as runs viram um estado só:
          1 run  → fala daquele bot ("Auto Follow", a barra dele, "57/70 · seguindo")
          N runs → vira o resumo ("3 bots rodando", a MÉDIA na barra) + uma linha por bot

        Quem ainda não mediu entra como 0% — é honesto, não produziu nada ainda.
        """
        ativas = sorted(self._ativas(), key=lambda r: r.started_at)
        if not ativas:
            return None

        if len(ativas) == 1:
            r = ativas[0]
            p = r.progress
            medido = bool(p and p.get("total"))
            label = ""
            if medido:
                label = f'{p["done"]}/{p["total"]}'
                if p.get("label"):
                    label += f' · {p["label"]}'
            else:
                label = r.status_log or "começando"
            return {"titulo": r.titulo, "pct": self._pct(r), "medido": medido,
                    "label": label[:60], "quantos": 1, "bot": r.bot, "linhas": []}

        # UMA linha por bot no card. Isto EXIGE o widget que decodifica LinhaBot — presente
        # a partir do build 2026-07-21 (0f37f278). Builds anteriores tinham o struct divergente
        # e o iOS IGNORAVA (200 mudo) qualquer push com linhas preenchido, congelando a LA; na
        # época mandávamos linhas=[] + nomes na label como paliativo. Com o build novo, voltou.
        linhas = [{"id": r.id, "bot": r.bot, "nome": r.titulo, "pct": self._pct(r)}
                  for r in ativas]
        media = round(sum(l["pct"] for l in linhas) / len(linhas))
        return {"titulo": f"{len(ativas)} bots rodando", "pct": media, "medido": True,
                "label": "", "quantos": len(ativas), "bot": "", "linhas": linhas}

    def _estado_la_fake(self, n):
        """Estado FALSO de N bots pra testar a renderização da Live Activity sem esperar bot
        real rodar (a aba de Testes no app). n=1 = view de um bot; n>=2 = uma barrinha por bot."""
        catalogo = [("auto-follow", "Auto Follow", 42), ("dm-followers", "DM Followers", 17),
                    ("auto-like", "Auto Like", 68), ("auto-comment", "Auto Comment", 91)]
        n = max(1, min(int(n), len(catalogo)))
        if n == 1:
            bot, nome, pct = catalogo[0]
            return {"titulo": f"{nome} (teste)", "pct": pct, "medido": True,
                    "label": f"{pct}/100 · testando", "quantos": 1, "bot": bot, "linhas": []}
        linhas = [{"id": f"teste-{i}", "bot": b, "nome": nm, "pct": p}
                  for i, (b, nm, p) in enumerate(catalogo[:n])]
        media = round(sum(l["pct"] for l in linhas) / len(linhas))
        return {"titulo": f"{n} bots rodando (teste)", "pct": media, "medido": True,
                "label": "", "quantos": n, "bot": "", "linhas": linhas}

    async def empurrar_la_teste(self, n):
        """Empurra um estado fake de N bots (ou encerra, n<=0) pra Live Activity que o app já
        criou. Exige la_token (app chamou garantirLA e o token chegou). Bypassa o throttle."""
        if not self.la_token:
            return {"ok": False, "erro": "sem LA — crie a LA de teste no app primeiro"}
        if int(n) <= 0:
            estado = {"titulo": "", "pct": 0, "medido": False, "label": "",
                      "quantos": 0, "bot": "", "linhas": []}
            ok, det = await asyncio.to_thread(liveactivity.encerrar, self.la_token, estado, self.la_bundle)
            return {"ok": ok, "encerrou": True}
        estado = self._estado_la_fake(n)
        ok, det = await asyncio.to_thread(liveactivity.atualizar, self.la_token, estado, self.la_bundle)
        # loga o DET SEMPRE (não só em falha) — o det traz o host (@sandbox/@prod) e o status,
        # pra caçar mismatch de ambiente: build Ad Hoc é PRODUÇÃO, se o 200 vier de sandbox a LA
        # nunca atualiza mesmo com ok=True.
        print(f"[la] TESTE push n={estado['quantos']} linhas={len(estado['linhas'])} ok={ok} DET={det}", flush=True)
        return {"ok": ok, "det": det}

    async def empurrar_la(self, forcar=False):
        """Empurra o estado atual pra Live Activity (throttle: a cada 3% ou 3s).

        `forcar` pula o throttle — usado quando o conjunto MUDA de forma (bot entrou/saiu),
        que é justamente quando a barra precisa reagir na hora.
        """
        if not self.la_token:
            return
        estado = self._estado_la()
        if estado is None:
            return
        agora = time.time()
        if not forcar:
            if estado["pct"] - self._ult_la_pct < 3 and (agora - self._ult_la_t) < 3:
                return
        self._ult_la_pct = estado["pct"]
        self._ult_la_t = agora
        try:
            ok, det = await asyncio.to_thread(
                liveactivity.atualizar, self.la_token, estado, self.la_bundle)
            # loga TODO push (não só falha) — pra enxergar o multi-bot: quantos bots, pct, e se
            # o APNs aceitou. O APNs rejeita CALADO (tópico errado, content-state divergente).
            print(f"[la] push q={estado['quantos']} pct={estado['pct']} med={estado['medido']} "
                  f"linhas={len(estado.get('linhas') or [])} ok={ok}"
                  + ("" if ok else f" DET={det}"), flush=True)
        except Exception as e:
            print(f"[la] update explodiu: {e}", flush=True)

    async def _encerrar_la_se_acabou(self, run):
        """Se essa foi a ÚLTIMA run ativa, encerra a Live Activity. Se ainda tem bot
        rodando, só atualiza (o card perde uma linha e a média se recalcula)."""
        if not self.la_token:
            return
        if self._ativas():
            await self.empurrar_la(forcar=True)
            return
        info = _proc_info(run.bot, run.params)
        fim = {"erro": "deu erro", "parado": "parado"}.get(run.status, "concluído")
        if run.bloqueio:
            fim = "bloqueado"
        estado = {"titulo": info["titulo"], "pct": 100 if run.status == "finalizado" else self._pct(run),
                  "medido": True, "label": fim, "quantos": 0, "bot": run.bot, "linhas": []}
        try:
            ok, det = await asyncio.to_thread(
                liveactivity.encerrar, self.la_token, estado, self.la_bundle)
            # se o encerrar falha, a barra fica PRESA no lock screen — tem que gritar
            if not ok:
                print(f"[la] encerrar falhou: {det}", flush=True)
        except Exception as e:
            print(f"[la] encerrar explodiu: {e}", flush=True)
        self._limpar_la()         # LA encerrou de verdade → some o token (app cria nova depois)
        self._ult_la_pct = -100

    async def start(self, bot_id, params):
        if not bots.existe(bot_id):
            raise ValueError(f"bot desconhecido: {bot_id}")
        run = Run(bot_id, params)
        self.runs[run.id] = run
        cmd = [settings.PYTHON_BIN] + bots.montar_cmd(bot_id, params)
        env = {**os.environ, "PYTHONUTF8": "1", "PYTHONUNBUFFERED": "1"}
        # HEADED sob display virtual (Xvfb) em vez de headless. MEDIDO: o Chromium headless
        # toma rate limit do IG (1357005) já na ~4ª página da thread e a run morre; com janela
        # (mesmo virtual) o IG serve o backlog inteiro — 240 msgs numa boa, igual ao PC local.
        # xvfb-run cria um display descartável por run (sem daemon, sem sudo) e runs simultâneos
        # pegam displays diferentes. Liga por padrão; desliga com BOTS_XVFB=0 no .env.
        # import de cookie NÃO precisa de janela (é só validar a sessão) → roda headless, leve.
        # O xvfb/headed é só pra varredura da thread (onde o IG estrangula o headless). Isso
        # também evita 2 browsers PESADOS competindo no túnel durante o "Conectar Instagram".
        eh_import = bool(params.get("import_cookies"))
        if not eh_import and os.environ.get("BOTS_XVFB", "1").strip().lower() not in ("0", "false", "no", "off"):
            cmd = ["xvfb-run", "-a"] + cmd
            env["IG_HEADLESS"] = "0"
        try:
            run.proc = await asyncio.create_subprocess_exec(
                *cmd, cwd=str(bots.bot_dir(bot_id)),
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT, env=env,
                # sessão/grupo de processo PRÓPRIO: o worker roda como `xvfb-run → python →
                # chromium`. Sem isto, parar só matava o xvfb-run e o python/chromium ficavam
                # ÓRFÃOS rodando (o "parei mas continua"). Com o grupo, o stop mata a árvore toda.
                start_new_session=True,
            )
        except Exception as e:
            # o processo NEM começou (xvfb-run/python ausente, cwd inválido…). Sem isto a run
            # ficava "iniciando" pra SEMPRE — nenhum _pump pra movê-la — travando o guard 409
            # ("esse bot já está rodando") e deixando a Live Activity pendurada no lock screen.
            # Marca erro e encerra limpo.
            run.status = "erro"
            run.ended_at = time.time()
            await run.emitir(f"[backend] não consegui iniciar o processo: {e}")
            self._gravar_historico(run)
            asyncio.create_task(self._encerrar_la_se_acabou(run))
            return run
        run.status = "rodando"
        asyncio.create_task(self._pump(run))
        asyncio.create_task(self._push_inicio(run))
        # bot novo entrou → o card muda de forma (ganha linha, a média recalcula)
        asyncio.create_task(self.empurrar_la(forcar=True))
        return run

    async def _pump(self, run):
        try:
            async for raw in run.proc.stdout:
                linha = raw.decode("utf-8", "replace").rstrip("\r\n")
                if linha.startswith("[progress]"):
                    p = _parse_progress(linha)
                    if p:
                        run.progress = p
                        await self._maybe_push_progresso(run)
                elif "[saldo]" in linha:
                    s = _parse_saldo(linha)
                    if s:
                        run.saldo = s
                else:
                    # ainda sem [progress] → reflete o status na LA pra não ficar parada
                    await self._maybe_status_la(run, linha)
                if "⛔" in linha or "BLOQUEIO" in linha:
                    run.bloqueio = True
                await run.emitir(linha)
        except Exception as e:
            await run.emitir(f"[backend] erro lendo saída: {e}")
        run.returncode = await run.proc.wait()
        run.ended_at = time.time()
        if run.status != "parado":
            run.status = "finalizado" if run.returncode == 0 else "erro"
        await run.emitir(f"[backend] processo terminou (status={run.status}, code={run.returncode})")
        self._gravar_historico(run)
        # ordem importa: a run já saiu de "rodando", então _ativas() não conta ela
        await self._encerrar_la_se_acabou(run)
        await self._push_fim(run)
        for q in list(run.subs):       # sinaliza fim (None) aos assinantes
            try:
                q.put_nowait(None)
            except Exception:
                pass

    def _gravar_historico(self, run):
        """Persiste o saldo da run no histórico (pula import de cookies)."""
        if run.params.get("import_cookies"):
            return
        history.registrar({
            "id": run.id, "bot": run.bot,
            "dry_run": bool(run.params.get("dry_run")),
            "started_at": run.started_at, "ended_at": run.ended_at,
            "duracao_s": int((run.ended_at or run.started_at) - run.started_at),
            "status": run.status, "bloqueio": run.bloqueio,
            "saldo": run.saldo or {},
        })

    async def _push_inicio(self, run):
        """Avisa o celular que a run começou (pula import de cookies)."""
        if run.params.get("import_cookies"):
            return
        nome = bots.BOTS.get(run.bot, {}).get("nome", run.bot)
        try:
            await asyncio.to_thread(
                notify.enviar, f"{nome} começou",
                "Tô nessa… vou te mostrando o progresso.",
                {"type": "start", "runId": run.id, "bot": run.bot})
        except Exception:
            pass

    async def _maybe_push_progresso(self, run):
        """Progresso pro celular = SOMENTE a Live Activity (barra viva no lock screen) + a UI
        do app. NUNCA notificação: progresso por notificação vira spam insuportável (cada tick,
        e pior quando os runs reiniciam e o la_token pisca). O indicador de progresso é a LA e o
        card do app; notificação fica só pra COMEÇOU e TERMINOU (uma de cada)."""
        if run.params.get("import_cookies"):
            return
        await self.empurrar_la()   # se não houver LA, empurrar_la só volta — sem notificação

    async def _maybe_status_la(self, run, linha):
        """Guarda a última linha humana do log (`status_log`) — é o que a home e o widget
        flutuante mostram AO VIVO embaixo do nome do bot, e o que a Live Activity usa enquanto
        ainda não há barra de progresso (~70s abrindo navegador/logando)."""
        txt = _limpar_linha(linha)
        # só frases humanas: ignora marcadores ([progress]/[saldo]/[backend]) e URLs
        if not txt or txt.startswith("[") or "://" in txt:
            return
        if txt == run.status_log:
            return
        run.status_log = txt[:90]          # SEMPRE atualiza (mesmo durante o progresso)
        # empurra o estado ATUAL DO CONJUNTO (throttled). ANTES só empurrava com 1 bot rodando
        # — então com 2+ bots na fase "abrindo navegador" (sem [progress] ainda) NINGUÉM
        # atualizava a LA e ela ficava presa no estado de um bot só (o "quebra com 2 bots").
        # Agora qualquer linha humana de qualquer bot refresca o card unificado.
        if self.la_token:
            await self.empurrar_la()

    async def _push_fim(self, run):
        """Notifica o celular quando a run termina.

        Vale TAMBÉM pra run de conectar o Instagram: é o único retorno de que a sessão
        entrou (ou não). Quem cuida da Live Activity é o _encerrar_la_se_acabou.
        """
        info = _proc_info(run.bot, run.params)
        nome = bots.BOTS.get(run.bot, {}).get("nome", run.bot)
        if run.status == "erro":
            titulo, corpo = info["fim_erro"]
        elif run.status == "parado":
            titulo, corpo = info["fim_parado"]
        else:
            titulo, corpo = info["fim_ok"]
            # rodada normal com barra: mostra o placar no corpo
            if not run.params.get("import_cookies") and run.progress and run.progress.get("total"):
                corpo = f"{nome} finalizou — {run.progress['done']}/{run.progress['total']}."
        try:
            await asyncio.to_thread(notify.enviar, titulo, corpo, {"runId": run.id, "bot": run.bot})
        except Exception:
            pass

    async def stop(self, run_id):
        run = self.runs.get(run_id)
        if not run or not run.proc:
            return False
        # marca PARADO sempre que estava ativo — MESMO se o processo já morreu por fora. É isso
        # que libera o guard 409 e destrava o app quando o run virou zumbi (rodando + proc morto).
        if run.status in ("rodando", "iniciando"):
            run.status = "parado"
            if run.ended_at is None:
                run.ended_at = time.time()
        if run.proc.returncode is None:
            self._matar_arvore(run.proc)
        return True

    def _reap_zumbis(self):
        """Limpa runs quebrados, pra não travar o guard 409 nem pendurar o app. Dois casos:
          • ZUMBI: status rodando/iniciando mas o PROCESSO morreu (morto por fora / _pump falhou).
          • TRAVADO: processo vivo mas SEM emitir nada há >10min (browser preso num goto que
            engasgou no proxy — o page.evaluate seguinte pendura pra sempre). Mata a árvore.
        (10min é folgado de propósito: o auto-follow dorme até 8min 'entre posts' de boa.)
        Roda barato a cada GET /runs."""
        agora = time.time()
        for r in self.runs.values():
            if r.status not in ("rodando", "iniciando") or not r.proc:
                continue
            vivo = r.proc.returncode is None
            if vivo:
                try:
                    os.kill(r.proc.pid, 0)          # não mata; só checa se o pid existe
                except OSError:
                    vivo = False
            travado = vivo and (agora - getattr(r, "ult_linha_t", agora)) > 600
            if travado:
                self._matar_arvore(r.proc)
            if not vivo or travado:
                r.status = "erro"
                if r.ended_at is None:
                    r.ended_at = agora

    def _matar_arvore(self, proc):
        """Mata o processo E TODA a árvore (xvfb-run → python → chromium → Xvfb). Um
        terminate() no proc só derrubava o xvfb-run e deixava o resto órfão rodando."""
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)     # o grupo inteiro
        except Exception:
            try:
                proc.terminate()
            except Exception:
                pass

        async def _kill_duro():
            # se não morreu de leve em 6s (chromium às vezes ignora SIGTERM), SIGKILL no grupo
            await asyncio.sleep(6)
            if proc.returncode is None:
                try:
                    os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
                except Exception:
                    try:
                        proc.kill()
                    except Exception:
                        pass
        asyncio.create_task(_kill_duro())

    def listar(self):
        self._reap_zumbis()          # detecta runs zumbis (proc morto) antes de responder
        return [r.info() for r in self.runs.values()]

    def get(self, run_id):
        return self.runs.get(run_id)
