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

import accounts
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


def _limpar_locks_chromium(profile_dir):
    """Remove os Singleton* de um Chromium que MORREU (watchdog/kill não fecha limpo e deixa o
    SingletonLock/Socket → o PRÓXIMO run no mesmo profile empaca). Um Chromium vivo recria eles
    no launch, então limpar antes de subir é seguro (nada roda naquele profile nesse momento)."""
    if not profile_dir:
        return
    for lk in ("SingletonLock", "SingletonCookie", "SingletonSocket"):
        try:
            os.remove(os.path.join(profile_dir, lk))
        except Exception:
            pass


def _proc_info(bot_id, params):
    """Textos por TIPO de processo (rodar o bot × conectar o Instagram). Conectar é um
    processo de primeira classe: tem título próprio, notificação de fim e Live Activity —
    senão o usuário toca em "Conectar" e não recebe retorno nenhum se deu certo."""
    nome = bots.BOTS.get(bot_id, {}).get("nome", bot_id)
    if (params or {}).get("import_cookies"):
        # Conectar é UNIVERSAL: a sessão é central (todos os bots leem a mesma). Ele só roda
        # "através" do 1º bot de IG como veículo, então as mensagens NÃO citam bot nenhum.
        return {
            "titulo": "Conectando Instagram",
            "fim_ok": ("Instagram · conectado", "Sessão salva — já pode rodar os bots."),
            "fim_erro": ("Instagram · deu ruim", "Não consegui conectar o Instagram."),
            "fim_parado": ("Instagram · parado", "A conexão do Instagram foi parada."),
        }
    # título SEMPRE prefixado com o nome do bot → na lista do iPhone dá pra separar por bot
    # (o iOS junta tudo num monte só do app; o prefixo é o que deixa cada um identificável)
    if (params or {}).get("lote"):
        n = (params or {}).get("lote_total") or ""
        nome = f"{nome} · lote{f' ({n} contas)' if n else ''}"
    return {
        "titulo": nome,
        "fim_ok": (f"{nome} · terminou", f"{nome} finalizou."),
        "fim_erro": (f"{nome} · deu ruim", f"{nome} parou com erro."),
        "fim_parado": (f"{nome} · parado", f"{nome} foi parado."),
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


def _parse_espera(linha):
    """`[espera] <segundos_restantes> <motivo...>` → (restam, motivo). Marcador de PAUSA:
    o worker emite durante uma espera longa (entre posts, pausa longa) pra o app/LA
    mostrarem a contagem regressiva."""
    try:
        resto = linha[len("[espera]"):].strip()
        partes = resto.split(None, 1)
        restam = int(float(partes[0]))
        motivo = partes[1] if len(partes) > 1 else ""
        return restam, motivo
    except Exception:
        return None


def _fmt_mmss(seg):
    seg = max(0, int(round(seg)))
    m, s = divmod(seg, 60)
    return f"{m}m {s:02d}s" if m else f"{s}s"


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
        self.conta = None              # @username da conta IG usada (lido do log "Conta: @x")
        self.bloqueio = False          # detectou bloqueio do IG no log?
        self.proxy_instavel = False    # parou por instabilidade do proxy/túnel (marcador [proxy])
        self.linhas = deque(maxlen=settings.MAX_LOG_LINES)
        # cabeçalho: as primeiras ~30 linhas do run (Modo/Proxy/Conta/início da varredura)
        # preservadas PRA SEMPRE. Sem isso, num run longo o buffer rolante evicta o começo e
        # você perde o contexto de abertura — que é justo o que o usuário quer ver sempre.
        self.cabecalho = []
        self._truncou = False          # o buffer rolante já cortou linhas do meio?
        self._log_path = None          # arquivo .log próprio do backend (persiste p/ o histórico)
        self._historico_gravado = False  # já foi pro runs_history.jsonl? (idempotência)
        self.ult_linha_t = time.time() # quando saiu a última linha (watchdog de travamento)
        self.subs = set()              # set[asyncio.Queue]
        self.proc = None
        self._ult_push_pct = -100      # throttle dos pushes de progresso
        self._ult_push_t = 0.0
        # última linha humana do log — vira o texto da Live Activity enquanto o bot ainda
        # não sabe o tamanho da fila (~70s abrindo navegador e logando).
        # (NÃO chamar de `status`: já existe, é o estado da run.)
        self.status_log = None
        # PAUSA em andamento (contagem regressiva): {ate: epoch, restam: s, motivo} ou None.
        # Vem do marcador [espera] do worker; o app ticka em cima do `ate`, a LA mostra no label.
        self.espera = None
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
            "espera": self.espera,             # pausa em contagem regressiva (ou None)
        }

    async def emitir(self, linha):
        self.ult_linha_t = time.time()                  # heartbeat pro watchdog de travamento
        if len(self.cabecalho) < 30:                    # guarda o começo do run pra sempre
            self.cabecalho.append(linha)
        if len(self.linhas) == self.linhas.maxlen:      # o buffer rolante vai evictar o head
            self._truncou = True
        self.linhas.append(linha)
        # grava TAMBÉM em arquivo próprio do backend: é o que deixa o log visível no histórico
        # depois que o run sai da memória (ou o backend reinicia) — o buffer em RAM some, o arquivo não.
        if self._log_path:
            try:
                with open(self._log_path, "a", encoding="utf-8") as f:
                    f.write(linha + "\n")
            except Exception:
                pass
        for q in list(self.subs):
            try:
                q.put_nowait(linha)
            except Exception:
                pass

    def emitir_efemero(self, linha):
        """Manda só pros assinantes do WS (não vai pro buffer nem pro arquivo). Pra marcadores
        voláteis tipo [espera]/[espera-fim] que a tela da run mostra ao vivo mas não devem
        sujar o log persistido. CONTA como sinal de vida (ult_linha_t): senão o [espera] das
        pausas longas não segurava o watchdog e ele matava a run no meio de uma pausa legítima
        (era o 'para do nada' — a pausa 'entre posts' do auto-follow passa de 6min)."""
        self.ult_linha_t = time.time()
        for q in list(self.subs):
            try:
                q.put_nowait(linha)
            except Exception:
                pass


class RunManager:
    # onde o token da Live Activity é persistido (sobrevive a restart do backend)
    _LA_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "la_token.json")
    # logs por run gravados pelo backend (sobrevivem à saída da memória / restart) → o histórico lê daqui
    _LOG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "run_logs")

    def __init__(self):
        self.runs = {}
        try:
            os.makedirs(self._LOG_DIR, exist_ok=True)
        except Exception:
            pass
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
            # em pausa? mostra a contagem regressiva no lugar (o app ticka; a LA atualiza no push)
            if r.espera:
                restam = r.espera["ate"] - time.time()
                if restam > 0:
                    mot = r.espera.get("motivo") or ""
                    label = f"pausa · faltam {_fmt_mmss(restam)}" + (f" ({mot})" if mot else "")
            return {"titulo": r.titulo, "pct": self._pct(r), "medido": medido,
                    "label": label[:60], "quantos": 1, "bot": r.bot, "linhas": []}

        # `linhas` VAZIO de propósito: mesmo o build 0f37f278 NÃO aplica push com linhas
        # preenchido (o iOS aceita 200 e ignora — a LA congela em "começando"). Testado ao vivo
        # 2026-07-23. Então o multi-bot mostra "N bots rodando · média%" + os NOMES na label
        # (texto, imune ao struct). Barrinha por bot fica pra quando o widget nativo for
        # decifrado/rebuildado — NÃO reativar linhas aqui sem confirmar que o push aplica.
        media = round(sum(self._pct(r) for r in ativas) / len(ativas))
        label = " · ".join(r.titulo for r in ativas)
        return {"titulo": f"{len(ativas)} bots rodando", "pct": media, "medido": True,
                "label": label[:60], "quantos": len(ativas), "bot": "", "linhas": []}

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
            # tem token mas NENHUMA run ativa → LA órfã (a run parou/acabou antes do token
            # chegar, ou foi parada). Encerra AGORA, senão a barra fica presa pra sempre.
            await self._encerrar_la_orfa()
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

    async def _encerrar_la_orfa(self):
        """Encerra uma Live Activity sem nenhuma run ativa (órfã) e limpa o token — a barra
        não fica presa quando a run para antes de o token chegar (ou o app registra tarde)."""
        if not self.la_token:
            return
        estado = {"titulo": "", "pct": 0, "medido": False, "label": "",
                  "quantos": 0, "bot": "", "linhas": []}
        try:
            ok, det = await asyncio.to_thread(
                liveactivity.encerrar, self.la_token, estado, self.la_bundle)
            print(f"[la] encerrei LA órfã (sem run ativa) ok={ok}"
                  + ("" if ok else f" DET={det}"), flush=True)
        except Exception as e:
            print(f"[la] encerrar órfã explodiu: {e}", flush=True)
        self._limpar_la()
        self._ult_la_pct = -100

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
        run._log_path = os.path.join(self._LOG_DIR, f"{run.id}.log")
        self.runs[run.id] = run
        cmd = [settings.PYTHON_BIN] + bots.montar_cmd(bot_id, params)
        env = {**os.environ, "PYTHONUTF8": "1", "PYTHONUNBUFFERED": "1"}
        # profile POR CONTA (device isolado pro IG): o connect usa a conta que está sendo
        # conectada (conta_id nos params); a run normal usa a conta ATIVA. Assim conectar/rodar
        # uma conta não derruba a sessão das outras (o problema do profile compartilhado).
        try:
            if params.get("lote_contas"):
                # LOTE = UM processo rodando várias contas: passa a lista (sessão+perfil+rótulo);
                # o worker aponta config.SESSION_FILE/USER_DATA_DIR por conta no loop interno.
                env["IG_LOTE_CONTAS"] = json.dumps(params["lote_contas"])
                for c in params["lote_contas"]:
                    _limpar_locks_chromium(c.get("profile"))
            else:
                uid = params.get("conta_id") or accounts.ativa_id()
                if uid:
                    env["IG_USER_DATA_DIR"] = accounts.profile_dir(uid)
                    _limpar_locks_chromium(accounts.profile_dir(uid))   # tira lock órfão de run morta
                    # sessão POR conta (não a central): roda a conta certa sem trocar a ativa.
                    # No import a sessão vai pra central (fluxo de conectar), então não mexe aí.
                    if not params.get("import_cookies"):
                        sp = accounts.sessao_path(uid)
                        if sp:
                            env["IG_SESSION_FILE"] = sp
        except Exception:
            pass
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

    # ───────────────────────────── LOTE (várias contas) ─────────────────────────────
    async def start_lote(self, bot_id, base_params, uids):
        """LOTE = UMA run só (UM processo) rodando todas as contas em sequência DENTRO do worker.
        Antes era 1 run por conta (vários terminais, e o parar não parava). Agora o app vê 1 run:
        mostra qual conta está (conta i/N), um log, um balão. Parar mata o processo → para tudo.
        A lista de contas (sessão+perfil+rótulo) vai por env pro worker (IG_LOTE_CONTAS)."""
        if not bots.existe(bot_id):
            raise ValueError(f"bot desconhecido: {bot_id}")
        uids = [u for u in (uids or []) if u]
        if not uids:
            raise ValueError("sem contas pro lote")
        infos = {c.get("id"): c for c in accounts.listar()}
        contas = []
        for u in uids:
            sp = accounts.sessao_path(u)
            if not sp:
                continue   # sem arquivo de sessão salvo → não dá pra logar, pula
            contas.append({"id": u, "label": (infos.get(u) or {}).get("label") or u,
                           "session": sp, "profile": accounts.profile_dir(u)})
        if not contas:
            raise ValueError("nenhuma das contas escolhidas tem sessão salva")
        params = {**dict(base_params or {}), "lote": True,
                  "lote_contas": contas, "lote_total": len(contas)}
        run = await self.start(bot_id, params)
        return {"lote": True, "bot": bot_id, "total": len(contas),
                "contas": [c["label"] for c in contas], "run_id": run.id}

    async def _pump(self, run):
        try:
            async for raw in run.proc.stdout:
                linha = raw.decode("utf-8", "replace").rstrip("\r\n")
                if linha.startswith("[espera]"):
                    e = _parse_espera(linha)
                    if e:
                        run.espera = {"ate": time.time() + e[0], "restam": e[0], "motivo": e[1]}
                        await self._maybe_push_progresso(run)   # atualiza a LA com a contagem
                        run.emitir_efemero(linha)               # a tela da run vê a contagem (WS)
                    continue   # marcador de pausa: não vai pro log nem vira status_log
                if run.espera is not None:
                    run.espera = None       # qualquer outra linha = a pausa acabou
                    run.emitir_efemero("[espera-fim]")
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
                if "[proxy]" in linha:
                    run.proxy_instavel = True
                if run.conta is None and "Conta:" in linha:   # "Conta: @quasenadasegue3 (...)"
                    m = re.search(r"Conta:\s*@?([A-Za-z0-9._]+)", linha)
                    if m:
                        run.conta = m.group(1)
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
        """Persiste o saldo da run no histórico (pula import de cookies). Idempotente: pode ser
        chamado tanto pelo fim normal (_pump) quanto pelo reaper de zumbis sem duplicar registro."""
        if run.params.get("import_cookies"):
            return
        if run._historico_gravado:
            return
        run._historico_gravado = True
        history.registrar({
            "id": run.id, "bot": run.bot,
            "dry_run": bool(run.params.get("dry_run")),
            "started_at": run.started_at, "ended_at": run.ended_at,
            "duracao_s": int((run.ended_at or run.started_at) - run.started_at),
            "status": run.status, "bloqueio": run.bloqueio,
            "conta": run.conta,
            "saldo": run.saldo or {},
        })

    async def _push_inicio(self, run):
        """Avisa o celular que a run começou (pula import de cookies). O lote é UMA run só, então
        notifica normal (começou/terminou) — não é mais N runs pra virar spam."""
        if run.params.get("import_cookies"):
            return
        nome = bots.BOTS.get(run.bot, {}).get("nome", run.bot)
        try:
            await asyncio.to_thread(
                notify.enviar, f"{nome} · começou",
                "Tô nessa… vou te mostrando o progresso.",
                {"type": "start", "runId": run.id, "bot": run.bot, "titulo": run.titulo},
                grupo=f"bot:{run.bot}")   # um monte por bot no lock screen
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
        if run.proxy_instavel:
            # parou por proxy/túnel — deixa CLARO que não é bloqueio/conta e pede pra tentar depois
            titulo, corpo = (f"{nome} · proxy instável", f"{nome} parou por instabilidade do proxy/túnel — "
                             "não é bloqueio. Tenta rodar de novo mais tarde.")
        elif run.status == "erro":
            titulo, corpo = info["fim_erro"]
        elif run.status == "parado":
            titulo, corpo = info["fim_parado"]
        else:
            titulo, corpo = info["fim_ok"]
            # rodada normal com barra: mostra o placar no corpo
            if not run.params.get("import_cookies") and run.progress and run.progress.get("total"):
                corpo = f"{nome} finalizou — {run.progress['done']}/{run.progress['total']}."
        # conectar conta vai pro monte "conexão"; o resto agrupa por bot
        grupo = "conexao" if run.params.get("import_cookies") else f"bot:{run.bot}"
        try:
            await asyncio.to_thread(notify.enviar, titulo, corpo,
                                    {"runId": run.id, "bot": run.bot, "titulo": info["titulo"]},
                                    grupo=grupo)
        except Exception:
            pass

    async def stop(self, run_id):
        run = self.runs.get(run_id)
        if not run or not run.proc:
            return False
        # o lote agora é 1 processo só rodando todas as contas → matar esse processo (abaixo)
        # já para o lote inteiro. Nada de coordenador pra cancelar.
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
          • TRAVADO: processo vivo mas SEM emitir nada há >6min (browser preso num goto que
            engasgou — o page.evaluate seguinte pendura pra sempre). Mata a árvore.
        (6min agora é seguro: TODA pausa longa — inclusive os 'entre posts' de até 8min do
        auto-follow — emite [espera] a cada 12s, então só uma trava REAL fica silenciosa tanto.)
        Roda no loop_reaper (a cada 60s) E a cada GET /runs."""
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
            travado = vivo and (agora - getattr(r, "ult_linha_t", agora)) > 360
            if travado:
                self._matar_arvore(r.proc)
            if not vivo or travado:
                r.status = "erro"
                if r.ended_at is None:
                    r.ended_at = agora
                # registra no histórico — senão o run zumbi some de "rodando" e não deixa rastro
                # (era o "só some do nada"): agora vira um registro de erro visível no histórico.
                self._gravar_historico(r)

    def _matar_arvore(self, proc):
        """Para o processo E TODA a árvore (xvfb-run → python → chromium → Xvfb).

        Manda SIGINT no GRUPO primeiro — é EXATAMENTE o que o Ctrl+C faz num terminal (SIGINT
        no grupo em foreground). Aí o bot cai no `except KeyboardInterrupt`, imprime o SALDO
        bonitinho e sai LIMPO (sem stacktrace/erro). Só escala pra SIGTERM e depois SIGKILL se
        ele teimar (chromium/Xvfb às vezes ignoram sinal). Antes mandava SIGTERM direto — por
        isso o 'parar' do app virava erro em vez do fim gracioso do Ctrl+C."""
        def _sinal(sig):
            try:
                os.killpg(os.getpgid(proc.pid), sig)      # o grupo inteiro
            except Exception:
                try:
                    proc.kill() if sig == signal.SIGKILL else proc.send_signal(sig)
                except Exception:
                    pass

        _sinal(signal.SIGINT)                             # Ctrl+C — saldo + saída limpa

        async def _escalar():
            # dá tempo do bot rodar o KeyboardInterrupt (imprimir saldo + fechar o browser).
            await asyncio.sleep(10)
            if proc.returncode is None:
                _sinal(signal.SIGTERM)
                await asyncio.sleep(6)
                if proc.returncode is None:
                    _sinal(signal.SIGKILL)                # chromium travado: mata na marra
        asyncio.create_task(_escalar())

    async def loop_reaper(self):
        """Watchdog em BACKGROUND: mata run travada (>10min sem emitir nada) mesmo com o app
        FECHADO. Antes o reaper só rodava quando o app chamava /runs — se você fechasse o app
        no meio de uma trava, ela ficava pendurada pra sempre (foi o 'parou do nada' que ficou
        27min preso). As pausas legítimas emitem [espera] a cada 12s, então só uma trava REAL
        (nenhuma saída) fica silenciosa tempo suficiente pra ser morta."""
        while True:
            try:
                self._reap_zumbis()
            except Exception:
                pass
            await asyncio.sleep(60)

    def listar(self):
        self._reap_zumbis()          # detecta runs zumbis (proc morto) antes de responder
        return [r.info() for r in self.runs.values()]

    def get(self, run_id):
        return self.runs.get(run_id)

    # ───────────────── logs persistidos (histórico) ─────────────────
    def achar_history(self, run_id):
        """Registro do run no histórico (runs_history.jsonl) por id, ou None."""
        for rec in history.listar(limite=1000000):
            if rec.get("id") == run_id:
                return rec
        return None

    def info_de_history(self, rec):
        """Monta um 'info' no mesmo formato do Run.info() a partir do registro do histórico —
        pra o app abrir um run que já saiu da memória sem quebrar (sem live, só o log salvo)."""
        bot = rec.get("bot")
        return {
            "id": rec.get("id"), "bot": bot,
            "titulo": bots.BOTS.get(bot, {}).get("nome", bot),
            "status": rec.get("status") or "finalizado",
            "started_at": rec.get("started_at"), "ended_at": rec.get("ended_at"),
            "returncode": None, "params": {}, "linhas": 0,
            "progress": None, "status_log": None,
            "conta": rec.get("conta"),
            "saldo": rec.get("saldo") or {}, "historico": True,
        }

    def _log_worker_por_tempo(self, bot_id, started_at):
        """Fallback pros runs ANTIGOS (sem .log do backend): acha o run_<timestamp>.log do worker
        cujo horário é o mais próximo do started_at do run (o worker cria o arquivo ~segundos
        depois que o backend inicia a run). Casa dentro de 10min pra não pegar arquivo errado."""
        if not bot_id or not started_at:
            return None
        try:
            d = os.path.join(str(bots.bot_dir(bot_id)), "output", "logs")
        except Exception:
            return None
        if not os.path.isdir(d):
            return None
        melhor, melhor_dt = None, None
        for nome in os.listdir(d):
            m = re.match(r"run_(\d{8}_\d{6})\.log$", nome)
            if not m:
                continue
            try:
                t = time.mktime(time.strptime(m.group(1), "%Y%m%d_%H%M%S"))
            except Exception:
                continue
            dt = abs(t - started_at)
            if melhor_dt is None or dt < melhor_dt:
                melhor, melhor_dt = os.path.join(d, nome), dt
        if melhor and melhor_dt is not None and melhor_dt <= 600:
            try:
                return open(melhor, encoding="utf-8").read().splitlines()
            except Exception:
                return None
        return None

    def ler_log_arquivo(self, run_id):
        """Log de um run que NÃO está mais na memória: 1º o .log próprio do backend; se não
        existir (run antigo), casa o log do worker por timestamp. Devolve list[str] ou None."""
        p = os.path.join(self._LOG_DIR, f"{run_id}.log")
        if os.path.exists(p):
            try:
                return open(p, encoding="utf-8").read().splitlines()
            except Exception:
                pass
        rec = self.achar_history(run_id)
        if rec:
            return self._log_worker_por_tempo(rec.get("bot"), rec.get("started_at"))
        return None
