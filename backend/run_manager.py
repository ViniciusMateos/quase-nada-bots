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
import story_contas_svc

_counter = itertools.count(1)


def _seed_counter():
    """Semeia o contador de run ACIMA do maior id já existente (logs + histórico). Sem isto o
    contador reiniciava em 1 a CADA restart do backend, os ids colidiam (run-1, run-2…) e, como o
    log abre em append, run-1.log acumulava VÁRIAS runs — por isso o histórico mostrava runs
    misturadas e entradas duplicadas. Com a semente, todo run tem id único e log próprio."""
    global _counter
    maxn = 0
    log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "run_logs")
    try:
        for f in os.listdir(log_dir):
            m = re.match(r"run-(\d+)\.log$", f)
            if m:
                maxn = max(maxn, int(m.group(1)))
    except Exception:
        pass
    try:
        for rec in history.listar(limite=1000000):
            m = re.match(r"run-(\d+)$", str(rec.get("id") or ""))
            if m:
                maxn = max(maxn, int(m.group(1)))
    except Exception:
        pass
    _counter = itertools.count(maxn + 1)

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


ACOES_DE_CONTA = ("login", "verificar")


def eh_processo_de_conta(params):
    """Login/verificar do emulador rodam com o bot "auto-follow" só como VEÍCULO do job — não são
    o Auto Follow. Tudo que mostra/filtra por bot (trava de "já está rodando", ícone da LA, grupo
    da notificação) tem que tratar esses à parte."""
    return (params or {}).get("acao") in ACOES_DE_CONTA


def bot_exibicao(bot_id, params):
    """O `bot` que vai pra LA/notificação: "contas" pro login/verificar (o widget mostra o ícone
    genérico, não o do Auto Follow), o bot de verdade pro resto."""
    return "contas" if eh_processo_de_conta(params) else bot_id


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
    if (params or {}).get("acao") == "login":
        # CONECTAR/RECONECTAR contas no emulador (o agente loga tocando no app do device): processo
        # próprio, com título e notificações dedicados — NUNCA "Auto Follow" (o bot-veículo do job
        # de emulador). Várias contas = UMA run só (lote). 23/10: "Conectar @conta"/"Conectar
        # contas · N" (antes "Reconectar no app", que o Vinicius não reconhecia).
        contas = [str(c).strip().lstrip("@") for c in ((params or {}).get("contas") or []) if c]
        n = len(contas)
        alvo = f"@{contas[0]}" if n == 1 else "as contas"
        return {
            "titulo": f"Conectar @{contas[0]}" if n == 1 else (f"Conectar contas · {n}" if n else "Conectar contas"),
            "fim_ok": ("Conectar · pronto", f"Terminei de logar {alvo} no emulador."),
            "fim_erro": ("Conectar · deu ruim", f"Não consegui logar {alvo} no emulador."),
            "fim_parado": ("Conectar · parado", "O login das contas foi parado."),
        }
    if (params or {}).get("acao") == "verificar":
        # VERIFICAÇÃO PROFUNDA de sessões no emulador (o agente entra em CADA conta logada e marca
        # ok/bloqueada). Processo próprio, com título e notificações dedicados — senão apareceria
        # como "Auto Follow" (o bot-veículo do job de emulador) e confundiria o usuário.
        return {
            "titulo": "Verificar sessões",
            "fim_ok": ("Sessões · verificadas", "Terminei de checar as contas do emulador."),
            "fim_erro": ("Sessões · deu ruim", "Não consegui verificar as sessões."),
            "fim_parado": ("Sessões · parado", "A verificação de sessões foi parada."),
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
    # pushToStartToken (iOS 17.2+): o server INICIA a LA sozinho (ex: cronograma auto-rodando)
    _PTS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pts_token.json")
    # logs por run gravados pelo backend (sobrevivem à saída da memória / restart) → o histórico lê daqui
    _LOG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "run_logs")
    # TTL do código de verificação guardado em memória pro agente do emulador consumir (~5min):
    # tempo de sobra pro agente pegar no próximo claim/poll, sem deixar um código velho valer pra
    # um login futuro (o arquivo codigos/<user>.txt do server tem a própria janela no ig_auth).
    _CODIGO_TTL = 300

    def __init__(self):
        self.runs = {}
        # ── fila de jobs pro agente do PC (bots target="emulador") ──
        # cada item: {run_id, bot, conta:{label,id,...}, params, estado, parar}
        #   estado: "pendente" (ninguém pegou) | "em_execucao" (agente rodando) | "descartado"
        # O agente reivindica 1 por vez (GET /emulador/jobs), reporta log (POST .../log) e fim
        # (POST .../fim). NÃO há subprocesso local — a run só espelha no app o que o agente manda.
        self._fila_emulador = []
        self._agente_visto = None   # epoch do último ping/claim do agente (heartbeat → /emulador/status)
        # último estado do emulador reportado pelo agente do PC (vem OPCIONAL no ping). Fica aqui
        # pra o /emulador/status mostrar em qual conta o agente está tocando, quais estão logadas
        # no app e se a sessão está viva. Nunca reportado → estes defaults (conta=null, lista=[]).
        self._agente_estado = {"conta_ativa": None, "contas_logadas": [], "sessao": None, "device": None}
        # ── códigos de verificação (challenge) guardados em memória pro login no EMULADOR ──
        # {user: (codigo, ts)}. O POST /contas/codigo preenche aqui (além de gravar o arquivo pro
        # login do server); o agente do PC consome via GET /emulador/codigo. One-shot + TTL.
        self._codigos = {}
        # ── último resultado da VERIFICAÇÃO PROFUNDA de sessões por conta ──
        # {user: {status: "ok"|"bloqueada"|"desconhecida", ts}}. O agente reporta conta a conta
        # (POST /emulador/sessoes, incremental pra UI atualizar ao vivo); status_emulador() devolve
        # isto em "sessoes". Estar na gavetinha do IG NÃO prova sessão sã — só entrar na conta prova.
        # Persistido em disco (20/10/2026): a conta do brechó vive num emulador que fica DESLIGADO —
        # o único jeito de saber se ela está logada lá é o que os jobs dela reportaram por último.
        self._sessoes_emulador = self._ler_sessoes()
        try:
            os.makedirs(self._LOG_DIR, exist_ok=True)
        except Exception:
            pass
        _seed_counter()   # ids de run únicos entre restarts (senão o histórico mistura as runs)
        # ── Live Activity: UMA pro app inteiro (não uma por run). O token e o throttle
        # vivem aqui porque o conjunto é que é exibido — o app cria a activity, o server
        # soma as runs e empurra.
        self.la_token = None
        self.la_bundle = None
        self.la_activity_id = None   # id da activity dona do token atual (distingue rotação de sessão nova)
        self._ult_la_pct = -100
        self._ult_la_t = 0.0
        # pushToStartToken: NÃO é por-activity (é do app), não rotaciona por run — persiste e vale
        # pra sempre até o app mandar um novo. Com ele o server inicia a LA mesmo com o app fechado.
        self.pts_token = None
        self.pts_bundle = None
        self._carregar_la_token()   # sobrevive a restart (senão a LA congela/some no restart)
        self._carregar_pts_token()

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

    # ── push-to-start (iOS 17.2+): o server inicia a LA sem o app aberto ──
    def _carregar_pts_token(self):
        try:
            with open(self._PTS_FILE, encoding="utf-8") as f:
                d = json.load(f)
            self.pts_token = d.get("token") or None
            self.pts_bundle = d.get("bundle") or None
        except Exception:
            pass

    def registrar_pts_token(self, token, bundle):
        """Guarda o pushToStartToken vindo do app (+bundle p/ tópico APNs) e PERSISTE."""
        self.pts_token = (token or "").strip() or None
        self.pts_bundle = bundle or None
        try:
            with open(self._PTS_FILE, "w", encoding="utf-8") as f:
                json.dump({"token": self.pts_token, "bundle": self.pts_bundle}, f)
        except Exception:
            pass
        return {"ok": bool(self.pts_token)}

    async def iniciar_la_pts(self, titulo, estado=None, alert=None, stale_seconds=1200):
        """INICIA a Live Activity via push-to-start (server → APNs), sem depender do app aberto.
        No-op silencioso se não houver pts_token (build sem suporte) ou APNs não configurado.
        Depois que o iOS cria a LA, o app (se estiver rodando) manda o token de update dela
        (onToken) e o empurrar_la() normal assume as atualizações. Com o app fechado a barra
        não anda (o iOS não entrega o token) — por isso o `stale_seconds` faz a LA expirar."""
        if not self.pts_token or not liveactivity.configurado():
            return {"ok": False, "motivo": "sem pts_token/apns"}
        est = estado or {"titulo": titulo, "pct": 0, "medido": False,
                         "label": "começando", "quantos": 1, "bot": "", "linhas": []}
        try:
            ok, det = await asyncio.to_thread(
                liveactivity.iniciar, self.pts_token, est, self.pts_bundle, alert, stale_seconds)
            print(f"[la] push-to-start ok={ok}" + ("" if ok else f" DET={det}"), flush=True)
            return {"ok": ok, "det": det}
        except Exception as e:
            print(f"[la] push-to-start explodiu: {e}", flush=True)
            return {"ok": False, "erro": str(e)}

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
                    "label": label[:60], "quantos": 1, "bot": bot_exibicao(r.bot, r.params), "linhas": []}

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
                  "medido": True, "label": fim, "quantos": 0, "bot": bot_exibicao(run.bot, run.params), "linhas": []}
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
        # BIFURCAÇÃO POR TARGET: bot de emulador não roda aqui — vira job na fila do agente do PC.
        # EXCEÇÃO: conectar o Instagram (import_cookies) SEMPRE roda no server (valida a sessão via
        # o worker local), mesmo que o bot-veículo seja o auto-follow (target=emulador). Sem isto o
        # "Conectar Instagram" quebraria, já que ele usa o 1º bot de IG como veículo.
        if bots.target(bot_id) == "emulador" and not (params or {}).get("import_cookies"):
            return await self._start_emulador(bot_id, params)
        # (story-repost VOLTOU a rodar o worker de cookie normal — posta o brechó. A story-vitrine
        # via story_poster.py foi descontinuada; _start_story_poster fica como código morto por ora.)
        run = Run(bot_id, params)
        run._log_path = os.path.join(self._LOG_DIR, f"{run.id}.log")
        try:
            open(run._log_path, "w", encoding="utf-8").close()   # começa LIMPO — nunca herda log de uma run antiga de mesmo id
        except Exception:
            pass
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

    # ─────────────────────── STORY-REPOST (story_poster.py) ───────────────────────
    async def _start_story_poster(self, bot_id, params):
        """RUN do story-repost: roda o story_poster.py do story-poster-qn (posta as peças-vitrine
        no story via instagrapi + proxy residencial), reaproveitando a MESMA maquinaria de run
        (log/WS/LA/histórico/push/stop) via _pump — só muda o executável, o cwd e o python (venv
        COMPARTILHADO dos bots). SEM xvfb e SEM IG_SESSION/IG_USER_DATA_DIR: aqui não há Chromium
        nem sessão-cookie (o login é instagrapi, por conta, dentro do story-poster-qn).

        params["story_contas"] (lista de usernames) → --contas u1,u2,… (roda SÓ essas, em sequência
        dentro do próprio script = a fila, com pausa humana entre contas). Vazio → todas do
        contas.json do story-poster. O stdout cai no processar_linha (parse de [progress]/[saldo])."""
        p = params or {}
        run = Run(bot_id, params)
        run._log_path = os.path.join(self._LOG_DIR, f"{run.id}.log")
        try:
            open(run._log_path, "w", encoding="utf-8").close()   # começa LIMPO (não herda id antigo)
        except Exception:
            pass
        self.runs[run.id] = run
        usuarios = [str(u).strip().lstrip("@") for u in (p.get("story_contas") or []) if str(u).strip()]
        cmd = [settings.STORY_VENV_PY, "story_poster.py",
               "--proxy", str(p.get("proxy") or settings.STORY_PROXY)]
        if usuarios:
            cmd += ["--contas", ",".join(usuarios)]
            if len(usuarios) == 1:
                run.conta = usuarios[0]          # já deixa a conta visível no card (single run)
        # RECONECTAR (login=True): só loga/valida as contas selecionadas via ig_auth (user/senha) e
        # sai — SEM --por-conta/--selecao (não posta nada). A run aparece no app com log ao vivo;
        # quando uma conta cai em challenge, o ig_auth imprime "[codigo] <user>" e o app pede o
        # código (POST /contas/codigo grava codigos/<user>.txt, de onde o ig_auth lê). O cron NÃO
        # passa por aqui (roda sem --login), então este ramo não afeta o aquecimento automático.
        if p.get("login"):
            cmd.append("--login")
        else:
            # MODO escolhido no app (nome) → flags do story_poster. O modo mora no perfis.json do
            # worker de referência; bots.ler_modos lê de lá (selecao/quantos_posts/delay_post). Sem
            # isto a run ignorava o modo (rodava 8 em ordem). Params explícitos ganham do modo.
            modo = {}
            if p.get("modo"):
                try:
                    modo = bots.ler_modos("story-repost").get(p["modo"]) or {}
                except Exception:
                    modo = {}
            # quantos_posts → --por-conta (o "10" do modo); por_conta explícito nos params manda
            por_conta = p.get("por_conta")
            if por_conta is None:
                por_conta = modo.get("quantos_posts")
            if por_conta is not None:
                cmd += ["--por-conta", str(por_conta)]
            # selecao → --selecao (flag nova: aleatorio | drop_novo)
            selecao = p.get("selecao") or modo.get("selecao")
            if selecao:
                cmd += ["--selecao", str(selecao)]
            # delay_post [a, b] → --entre-min a --entre-max b
            delay = p.get("delay_post") or modo.get("delay_post")
            if isinstance(delay, (list, tuple)) and len(delay) == 2:
                cmd += ["--entre-min", str(delay[0]), "--entre-max", str(delay[1])]
            if p.get("janela_h") is not None:
                cmd += ["--janela-h", str(p["janela_h"])]
            if p.get("dry_run"):
                cmd.append("--dry-run")
            for x in p.get("extra", []) or []:
                cmd.append(str(x))
        env = {**os.environ, "PYTHONUTF8": "1", "PYTHONUNBUFFERED": "1"}
        acao_txt = "reconectar (login)" if p.get("login") else "story-repost"
        await run.emitir(f"[backend] {acao_txt} via story_poster.py · "
                         + (", ".join(usuarios) if usuarios else "todas as contas-vitrine"))
        try:
            run.proc = await asyncio.create_subprocess_exec(
                *cmd, cwd=str(settings.STORY_DIR),
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT, env=env,
                # grupo de processo próprio → o stop mata a árvore inteira (igual aos outros bots)
                start_new_session=True,
            )
        except Exception as e:
            # processo nem começou (python/venv ausente, cwd inválido…) — marca erro e encerra limpo
            run.status = "erro"
            run.ended_at = time.time()
            await run.emitir(f"[backend] não consegui iniciar o story_poster: {e}")
            self._gravar_historico(run)
            asyncio.create_task(self._encerrar_la_se_acabou(run))
            return run
        run.status = "rodando"
        asyncio.create_task(self._pump(run))        # MESMO pump dos outros bots de server
        asyncio.create_task(self._push_inicio(run))
        asyncio.create_task(self.empurrar_la(forcar=True))
        return run

    # ─────────────────────── EMULADOR (agente do PC) ───────────────────────
    async def _start_emulador(self, bot_id, params):
        """Enfileira um job pro agente do PC em vez de rodar subprocesso. Cria a Run (iniciando),
        escreve o .log próprio (igual ao server, pro histórico/WS), guarda o job na fila e deixa a
        run aparecer no app na hora (iniciando + LA). O agente mais tarde reivindica o job
        (reivindicar_job), reporta log (processar_linha) e finaliza (finalizar_emulador)."""
        params = self._expandir_modo_emulador(bot_id, params)
        run = Run(bot_id, params)
        run._log_path = os.path.join(self._LOG_DIR, f"{run.id}.log")
        try:
            open(run._log_path, "w", encoding="utf-8").close()   # começa LIMPO (não herda id antigo)
        except Exception:
            pass
        self.runs[run.id] = run
        conta = self._conta_do_job(params)
        if conta.get("id"):          # já deixa a conta visível no card antes do agente logar "Conta:"
            run.conta = conta.get("label") or conta.get("id")
        self._fila_emulador.append({
            "run_id": run.id, "bot": bot_id, "conta": conta,
            "params": params or {}, "estado": "pendente", "parar": False,
        })
        rotulo = conta.get("label") or conta.get("id") or "conta ativa"
        await run.emitir(f"[backend] job enfileirado pro agente do emulador · {rotulo}")
        # a run já entra como "iniciando" → aparece no app e a LA reflete (igual run normal subindo)
        asyncio.create_task(self.empurrar_la(forcar=True))
        return run

    def _expandir_modo_emulador(self, bot_id, params):
        """O agente do PC não lê o perfis.json (vive aqui no server) → copia os campos do MODO
        escolhido pra dentro dos params do job. Params explícitos ganham. Vale pros 3 bots do
        emulador (20/10/2026: os modos foram reformulados pro emulador; o agente lê os campos novos
        e ainda aceita os nomes antigos)."""
        p = dict(params or {})
        if bot_id not in ("auto-follow", "dm-followers", "story-brecho") or not p.get("modo"):
            return p
        try:
            modo = bots.ler_modos(bot_id).get(p["modo"]) or {}
        except Exception:
            modo = {}
        for k, v in modo.items():
            p.setdefault(k, v)
        return p

    def _conta_do_job(self, params):
        """{label, id, …} da conta do job (pro agente saber em qual conta tocar no emulador).
        No lote a conta específica já vem em params["emulador_conta"]; fora dele, resolve pela
        conta_id (ou a ativa). Sessão NÃO é exigida: no emulador o login vive no app, não no cookie."""
        p = params or {}
        if isinstance(p.get("emulador_conta"), dict) and p["emulador_conta"].get("id"):
            return p["emulador_conta"]
        uid = p.get("conta_id") or accounts.ativa_id()
        if not uid:
            return {}
        label = uid
        try:
            for c in accounts.listar():
                if c.get("id") == uid:
                    label = c.get("label") or uid
                    break
        except Exception:
            pass
        return {"id": uid, "label": label,
                "session": accounts.sessao_path(uid), "profile": accounts.profile_dir(uid)}

    def _job_de(self, run_id):
        for j in self._fila_emulador:
            if j.get("run_id") == run_id:
                return j
        return None

    def _remover_job(self, run_id):
        self._fila_emulador = [j for j in self._fila_emulador if j.get("run_id") != run_id]

    def ping_agente(self, info=None):
        """Heartbeat do agente do PC (registra 'vivo' + timestamp pro /emulador/status). O agente
        pode mandar JUNTO o estado do emulador (conta ativa no app, contas logadas, se a sessão
        está viva, device) — campos OPCIONAIS; o ping vazio ({}) continua valendo (compat pra
        trás) e NÃO zera o último estado conhecido."""
        self._agente_visto = time.time()
        self._guardar_estado_agente(info)
        return {"ok": True, "ts": self._agente_visto}

    def _guardar_estado_agente(self, info):
        """Funde no estado guardado só os campos que vieram no ping (ping vazio não apaga nada)."""
        if not isinstance(info, dict) or not info:
            return
        est = self._agente_estado
        if "conta_ativa" in info:
            est["conta_ativa"] = info.get("conta_ativa") or None
        if "contas_logadas" in info:
            cl = info.get("contas_logadas")
            est["contas_logadas"] = [str(x) for x in cl] if isinstance(cl, list) else []
            # AUTO-REGISTRA no app as contas do EMULADOR que ainda não existem (como pendente, só o
            # @). Assim conta logada no device aparece SOZINHA no Gerenciar contas — o usuário pediu
            # que adicionar no emulador (manual) reflita no app automático. Idempotente por label.
            try:
                existentes = {(c.get("label") or "").strip().lower()
                              for c in accounts.listar()}
                for u in (est["contas_logadas"] or []):
                    uu = (u or "").strip().lstrip("@")
                    if uu and uu.lower() not in existentes:
                        accounts.adicionar_pendente(uu)
                        existentes.add(uu.lower())
            except Exception:
                pass
        if "sessao" in info:
            s = info.get("sessao")
            est["sessao"] = s if s in ("viva", "desconhecida") else None
        if "device" in info:
            est["device"] = info.get("device") or None
        # prontidão da raspagem do brechó: soft-blocks e uso do rodízio (só existem no PC)
        for k in ("softblocks", "uso_raspagem"):
            if isinstance(info.get(k), dict):
                est[k] = {str(u): float(t) for u, t in info[k].items() if t}
        if info.get("cooldown_softblock_h"):
            try:
                est["cooldown_softblock_h"] = float(info["cooldown_softblock_h"])
            except Exception:
                pass

    def prontidao_raspagem(self):
        """Tá tudo certo pra raspar o brechó? Agente online + cada auxiliar logada no emulador das
        segue com o estado dela, na MESMA regra do rodízio do agente (_auxiliares_para_raspar):
        fora a loja; "bloqueada" na verificação; soft-block nas últimas N h (descansando até…).
        As aptas vêm na ordem do rodízio (a menos usada na raspagem primeiro)."""
        agora = time.time()
        st = self.status_emulador()
        est = self._agente_estado
        sb = est.get("softblocks") or {}
        uso = est.get("uso_raspagem") or {}
        cool = float(est.get("cooldown_softblock_h") or 12) * 3600
        sess = st.get("sessoes") or {}
        contas = []
        for u in dict.fromkeys(str(x).strip().lstrip("@") for x in (st.get("contas_logadas") or []) if x):
            if u.lower() == "brechoquasenadaa":
                continue
            c = {"conta": u, "ultima_raspagem": uso.get(u)}
            if sess.get(u) == "bloqueada":
                c.update(estado="bloqueada", motivo="sessão bloqueada na última verificação")
            elif sb.get(u) and agora - sb[u] < cool:
                c.update(estado="descansando", motivo="soft-block recente", ate=sb[u] + cool)
            else:
                c.update(estado="apta", motivo="")
            contas.append(c)
        aptas = sorted([c for c in contas if c["estado"] == "apta"],
                       key=lambda c: (c.get("ultima_raspagem") or 0, c["conta"]))
        outras = [c for c in contas if c["estado"] != "apta"]
        ocupada = any(j.get("estado") == "em_execucao" and "principal" in self.instancias_do_job(j.get("bot"), j.get("params"))
                      for j in self._fila_emulador)
        pronto = bool(st.get("online")) and bool(aptas)
        if not st.get("online"):
            resumo = "o PC do emulador está offline"
        elif not aptas:
            resumo = "nenhuma conta auxiliar apta agora"
        else:
            resumo = f"{len(aptas)} conta(s) apta(s) — a próxima é @{aptas[0]['conta']}"
        return {"pronto": pronto, "resumo": resumo, "agente_online": bool(st.get("online")),
                "ultimo_ping_ha_s": st.get("ha_segundos"), "emulador_ocupado": ocupada,
                "proxima": aptas[0]["conta"] if aptas else None,
                "contas": aptas + outras}

    def status_emulador(self):
        """Estado do agente/fila: se o agente está online (viu nos últimos 90s), o tamanho da fila
        e o último estado do emulador reportado no ping (conta ativa / contas logadas / sessão)."""
        agora = time.time()
        visto = self._agente_visto
        pend = sum(1 for j in self._fila_emulador if j.get("estado") == "pendente")
        emexec = sum(1 for j in self._fila_emulador if j.get("estado") == "em_execucao")
        # tem job de VERIFICAÇÃO de sessões pendente/rodando? (deriva da fila, igual pend/emexec):
        # o front usa pra mostrar o "verificando…" ao vivo. Volta False sozinho quando o job finaliza.
        verificando = any(
            (j.get("params") or {}).get("acao") == "verificar"
            and j.get("estado") in ("pendente", "em_execucao")
            for j in self._fila_emulador
        )
        est = self._agente_estado
        return {
            "online": bool(visto and (agora - visto) < 90),
            "ultimo_ping": visto,
            "ha_segundos": (round(agora - visto) if visto else None),
            "fila": {"pendentes": pend, "em_execucao": emexec, "total": len(self._fila_emulador)},
            # estado do emulador vindo do ping (nunca reportado → defaults do __init__)
            "conta_ativa": est.get("conta_ativa"),
            "contas_logadas": list(est.get("contas_logadas") or []),
            "sessao": est.get("sessao"),
            # último resultado da verificação profunda por conta ({user: "ok"|"bloqueada"|"desconhecida"})
            "sessoes": {u: (d or {}).get("status") for u, d in self._sessoes_emulador.items()},
            "verificando_sessoes": verificando,
        }

    _SESSOES_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "emulador_sessoes.json")

    def _ler_sessoes(self):
        try:
            with open(self._SESSOES_PATH, encoding="utf-8") as f:
                d = json.load(f)
            return d if isinstance(d, dict) else {}
        except Exception:
            return {}

    def guardar_sessao(self, user, status, fonte=None):
        """Guarda o último resultado de sessão de UMA conta (o agente reporta incremental via POST
        /emulador/sessoes, pra a UI atualizar ao vivo). status ∈ {ok, bloqueada, desconhecida,
        deslogada}; 'deslogada' = a conta não está logada no emulador dela (hoje: o brechó, que a
        sincronização então manda logar). Outro valor vira 'desconhecida'. Devolve True se guardou."""
        u = (user or "").strip().lstrip("@")
        if not u:
            return False
        st = status if status in ("ok", "bloqueada", "desconhecida", "deslogada", "senha_incorreta") \
            else "desconhecida"
        if (fonte == "story" and st == "deslogada"
                and (self._sessoes_emulador.get(u) or {}).get("status") == "senha_incorreta"):
            st = "senha_incorreta"   # um STORY achando a conta deslogada não apaga o aviso da senha
                                     # (um LOGIN manda: senha nova que passou e travou depois → deslogada)
        self._sessoes_emulador[u] = {"status": st, "ts": time.time()}
        try:
            tmp = self._SESSOES_PATH + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(self._sessoes_emulador, f, ensure_ascii=False)
            os.replace(tmp, self._SESSOES_PATH)
        except Exception:
            pass
        return True

    async def enfileirar_verificar(self):
        """Enfileira UM job de VERIFICAÇÃO PROFUNDA de sessões pro agente do PC: ele entra em CADA
        conta logada no device e marca ok/bloqueada (estar na gavetinha do IG NÃO garante sessão sã —
        conta em 'recurso em análise' aparece lá mesmo bloqueada). Sem conta específica (varre todas).
        MESMA fila/maquinaria dos jobs de emulador (1 por vez): bot='auto-follow' (bot-veículo, pro
        stop/LA/target reconhecerem o emulador); params={acao:'verificar'} é o que o agente lê.
        Devolve {ok, run_id}."""
        run = Run("auto-follow", {"acao": "verificar"})
        run._log_path = os.path.join(self._LOG_DIR, f"{run.id}.log")
        try:
            open(run._log_path, "w", encoding="utf-8").close()   # começa LIMPO (não herda id antigo)
        except Exception:
            pass
        self.runs[run.id] = run
        self._fila_emulador.append({
            "run_id": run.id, "bot": "auto-follow", "conta": {},
            "params": {"acao": "verificar"}, "estado": "pendente", "parar": False,
        })
        await run.emitir("[backend] verificação de sessões enfileirada pro agente do emulador")
        # a run já entra como "iniciando" → aparece no app e a LA reflete (igual run normal subindo)
        asyncio.create_task(self.empurrar_la(forcar=True))
        return {"ok": True, "run_id": run.id}

    # ── código de verificação (challenge) pro login no EMULADOR (o do server vai pro arquivo) ──
    def guardar_codigo(self, user, codigo):
        """Guarda o código de verificação em memória {user: (codigo, ts)} pro agente do emulador
        buscar via GET /emulador/codigo. É INDEPENDENTE da escrita do arquivo codigos/<user>.txt
        (essa resolve o login do SERVER via ig_auth); o store resolve o login do DEVICE. Devolve
        True se guardou."""
        u = (user or "").strip().lstrip("@")
        c = (codigo or "").strip()
        if not u or not c:
            return False
        self._codigos[u] = (c, time.time())
        return True

    def pegar_codigo(self, user):
        """Devolve o código guardado pro user e o CONSOME (one-shot). Expira após _CODIGO_TTL —
        código velho não vale pra um login futuro. None se não há (ou expirou)."""
        u = (user or "").strip().lstrip("@")
        item = self._codigos.get(u)
        if not item:
            return None
        codigo, ts = item
        self._codigos.pop(u, None)                 # consome sempre que leu (one-shot)
        if time.time() - ts > self._CODIGO_TTL:    # expirou → trata como ausente
            return None
        return codigo

    @staticmethod
    def instancias_do_job(bot, params):
        """Em qual emulador o job roda: {"principal"} (as segue), {"brecho"} (a instância própria da
        conta do brechó) ou as duas. Story/login só da conta do brechó = só a instância dela — aí
        dá pra rodar AO MESMO TEMPO que um job das segue (20/10/2026)."""
        p = params or {}
        contas = [str(c.get("label") or c.get("id") or "") if isinstance(c, dict) else str(c)
                  for c in (p.get("lote_contas") or p.get("contas") or [])]
        contas = [c.strip().lstrip("@").lower() for c in contas if c]
        brecho = "brechoquasenadaa"
        if bot == "story-brecho" and not contas:
            return {"brecho"}                  # story sem lista = só o brechó (o jeito antigo)
        if bot == "story-brecho" or p.get("acao") == "login":
            tem_b = brecho in contas
            tem_o = any(c != brecho for c in contas)
            return ({"brecho"} if tem_b else set()) | ({"principal"} if tem_o or not contas else set())
        return {"principal"}

    async def reivindicar_job(self, ocupadas=None):
        """O agente pega o PRÓXIMO job pendente (FIFO) cujas instâncias estão LIVRES. Marca a Run
        'rodando' e o job 'em_execucao'. `ocupadas` = instâncias que o agente está usando agora
        (jobs dele rodando em paralelo, ex: o story do brechó). Devolve {run_id, bot, conta,
        params, instancias} — ou {} se não tem nada que caiba agora."""
        ocupadas = set(ocupadas or ())
        self._agente_visto = time.time()      # pedir job também conta como heartbeat
        agora = time.time()
        # AUTO-RECUPERA job PRESO: só há 1 agente e ele NÃO pede o próximo job enquanto roda um, então
        # um job "em_execucao" visto AQUI (agente ocioso pedindo job) é ÓRFÃO — quem pegou morreu no
        # meio (ex: reinício do agente) e nunca finalizou. Sem isto a run fica "rodando/verificando"
        # pra SEMPRE e o /emulador/status trava em verificando_sessoes=true. Grace de 120s (ou sem a
        # marca `reivindicado_em` = job antigo) pra não cortar nada legítimo.
        # (com o paralelo, só é órfão o job de instância que o agente diz estar LIVRE — o que roda
        # na instância ocupada é legítimo e segue)
        for job in self._fila_emulador:
            if (job.get("estado") == "em_execucao" and (agora - (job.get("reivindicado_em") or 0)) > 120
                    and not (self.instancias_do_job(job.get("bot"), job.get("params")) & ocupadas)):
                run = self.runs.get(job.get("run_id"))
                if run and run.status not in ("finalizado", "erro", "parado"):
                    run.status = "erro"
                    if run.ended_at is None:
                        run.ended_at = time.time()
                    try:
                        self._gravar_historico(run)
                    except Exception:
                        pass
                    asyncio.create_task(self._encerrar_la_se_acabou(run))
                job["estado"] = "descartado"
        self._fila_emulador = [j for j in self._fila_emulador if j.get("estado") != "descartado"]
        for job in self._fila_emulador:
            if job.get("estado") != "pendente":
                continue
            run = self.runs.get(job["run_id"])
            if not run or run.status == "parado":   # run sumiu / foi parada antes de rodar → descarta
                job["estado"] = "descartado"
                continue
            inst = self.instancias_do_job(job.get("bot"), job.get("params"))
            if inst & ocupadas:
                continue                            # o emulador dele está ocupado → espera a vez
            job["estado"] = "em_execucao"
            job["reivindicado_em"] = agora          # marca quando pegou (pro auto-recupera acima)
            if run.status == "iniciando":
                run.status = "rodando"
            # virou "rodando" → a LA reage na hora (igual bot do server quando entra em execução)
            asyncio.create_task(self.empurrar_la(forcar=True))
            return {"run_id": job["run_id"], "bot": job["bot"],
                    "conta": job.get("conta") or {}, "params": job.get("params") or {},
                    "instancias": sorted(inst)}
        return {}

    def job_parar(self, run_id):
        """O agente consulta se deve ABORTAR o job (passa como parar_flag no processar()).
        True quando o stop marcou o job/Run como parado."""
        job = self._job_de(run_id)
        run = self.runs.get(run_id)
        return {"parar": bool((job and job.get("parar")) or (run and run.status == "parado"))}

    async def finalizar_emulador(self, run, ok, saldo=None, motivo=""):
        """Fim de um job de emulador (espelha o fim do _pump): fecha a Run, grava histórico, encerra
        a LA e manda o push de fim. Respeita 'parado' (stop já setou) — não reescreve pra finalizado."""
        if saldo:
            run.saldo = saldo
        run.motivo = motivo or None
        run.espera = None
        if run.ended_at is None:
            run.ended_at = time.time()
        if run.status not in ("parado",):
            run.status = "finalizado" if ok else "erro"
        linha = f"[backend] job do emulador terminou (status={run.status})"
        if motivo:
            linha += f" — {motivo}"
        await run.emitir(linha)
        self._gravar_historico(run)
        self._remover_job(run.id)
        # ordem igual ao _pump: a run já saiu de "rodando", então _ativas() não a conta mais
        await self._encerrar_la_se_acabou(run)
        await self._push_fim(run)
        for q in list(run.subs):       # sinaliza fim (None) aos assinantes do WS
            try:
                q.put_nowait(None)
            except Exception:
                pass
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
        if bots.target(bot_id) == "emulador":
            return await self._start_lote_emulador(bot_id, base_params, uids)
        # (story-repost voltou ao lote de cookie normal — posta o brechó; vitrine descontinuada)
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

    async def _start_lote_emulador(self, bot_id, base_params, uids):
        """LOTE no emulador = UMA Run só (UM job) rodando TODAS as contas EM SEQUÊNCIA dentro do
        agente do PC. Antes era N jobs (uma Run por conta) → o app mostrava "vários bots"; agora o
        app vê UMA run só (um log, um balão, uma barra) e o agente percorre a lista conta a conta,
        com progresso em cascata (barra por conta + rótulo "conta i/N @user").

        Reaproveita o padrão do _start_emulador (cria a Run, abre o .log próprio, enfileira na
        _fila_emulador), mas com UM job carregando a lista inteira em params["lote_contas"]. Sessão
        e perfil NÃO são exigidos no emulador (o login vive no app do device) — o agente só precisa
        do label de cada conta pra trocar de conta no seletor nativo."""
        infos = {c.get("id"): c for c in accounts.listar()}
        contas = [{"id": u, "label": (infos.get(u) or {}).get("label") or u} for u in uids]
        if not contas:
            raise ValueError("sem contas pro lote")
        # params da run: acao=lote + a lista + os base_params (modo/chat/limite/entre…). lote/
        # lote_total ligam o título "· lote (N contas)" do _proc_info (igual ao lote do server).
        params = {**self._expandir_modo_emulador(bot_id, base_params), "acao": "lote", "lote": True,
                  "lote_total": len(contas), "lote_contas": contas}
        run = Run(bot_id, params)
        run._log_path = os.path.join(self._LOG_DIR, f"{run.id}.log")
        try:
            open(run._log_path, "w", encoding="utf-8").close()   # começa LIMPO (não herda id antigo)
        except Exception:
            pass
        self.runs[run.id] = run
        # UM job só carregando a lista → o agente roda lote_contas em sequência (sem conta única).
        self._fila_emulador.append({
            "run_id": run.id, "bot": bot_id, "conta": {},
            "params": params, "estado": "pendente", "parar": False,
        })
        labels = [c["label"] for c in contas]
        await run.emitir(f"[backend] lote enfileirado pro agente do emulador · "
                         f"{len(contas)} conta(s): {', '.join(labels)}")
        # a run já entra como "iniciando" → aparece no app e a LA reflete (igual run normal subindo)
        asyncio.create_task(self.empurrar_la(forcar=True))
        return {"lote": True, "emulador": True, "bot": bot_id, "total": len(contas),
                "contas": labels, "run_id": run.id}

    async def start_login_emulador(self, usernames, senhas=None):
        """Enfileira um job de LOGIN no emulador por conta (o agente do PC loga a conta tocando no
        app do device). MESMA fila/maquinaria dos jobs de auto-follow: 1 Run 'iniciando' por conta,
        job pendente que o agente pega 1 por vez (GET /emulador/jobs). bot='auto-follow' (bot-veículo
        de emulador) pra o stop/LA reconhecerem o target; params={acao:'login'} é o que o agente lê
        pra saber que é login.

        A senha vem do APP (`senhas` {user: senha}, credencial salva no aparelho — 20/10: conta
        adicionada no app já loga sozinha no emulador) ou, se não veio, do contas.json do
        story-poster. Viaja SÓ na CONTA do job (que o agente recebe no /emulador/jobs) — NUNCA em
        run.params (o /runs expõe params) nem no log. Fila = uma por vez.
        Devolve {emulador, login, total, contas, run_ids}."""
        usuarios = [str(u).strip().lstrip("@") for u in (usernames or []) if str(u).strip()]
        if not usuarios:
            raise ValueError("sem contas pro login no emulador")
        do_app = {str(k).strip().lstrip("@").lower(): str(v) for k, v in (senhas or {}).items() if v}
        senhas = story_contas_svc.carregar_senhas()     # {user: senha} — não logar
        # conta que JÁ tem login na fila (pendente/executando) não entra de novo — tocar em
        # "verificar e sincronizar" duas vezes não pode logar a mesma conta 2x no device
        na_fila = set()
        for j in self._fila_emulador:
            if (j.get("params") or {}).get("acao") == "login" and j.get("estado") in ("pendente", "em_execucao"):
                na_fila.update(str(x).lower() for x in ((j.get("params") or {}).get("contas") or []))
                na_fila.add(((j.get("conta") or {}).get("label") or "").lower())
        usuarios = [u for u in usuarios if u.lower() not in na_fila]
        if not usuarios:
            return {"emulador": True, "login": True, "total": 0, "contas": [], "run_ids": []}
        # UMA run só pra todas as contas (lote, igual os outros): o agente loga uma por vez.
        # params LIMPOS (acao + os @) → o /runs/{id} nunca vaza senha; as senhas vão SÓ na conta
        # do job (que só o agente recebe).
        run = Run("auto-follow", {"acao": "login", "contas": usuarios})
        run._log_path = os.path.join(self._LOG_DIR, f"{run.id}.log")
        try:
            open(run._log_path, "w", encoding="utf-8").close()   # começa LIMPO (não herda id antigo)
        except Exception:
            pass
        self.runs[run.id] = run
        run.conta = usuarios[0] if len(usuarios) == 1 else f"{len(usuarios)} contas"
        logins = [{"user": u, "senha": do_app.get(u.lower()) or senhas.get(u) or ""} for u in usuarios]
        conta = {"id": usuarios[0], "label": usuarios[0], "senha": logins[0]["senha"], "logins": logins}
        self._fila_emulador.append({
            "run_id": run.id, "bot": "auto-follow", "conta": conta,
            "params": {"acao": "login", "contas": usuarios}, "estado": "pendente", "parar": False,
        })
        await run.emitir(f"[backend] login no emulador enfileirado · {', '.join(usuarios)}")  # só os @
        asyncio.create_task(self.empurrar_la(forcar=True))
        return {"emulador": True, "login": True, "total": len(usuarios),
                "contas": usuarios, "run_ids": [run.id]}

    async def start_criar_conta(self, dados):
        """Enfileira um job de CRIAR CONTA no emulador (o agente do PC cria a conta tocando no app).
        `dados` = {username, senha, email, ano?, dia?, bio?, grupo?}. Os dados sensíveis (senha,
        e-mail) vão SÓ na CONTA do job (que só o agente recebe) — nunca em run.params (que o /runs
        expõe). Devolve {emulador, criar, run_id, username}."""
        d = dict(dados or {})
        user = str(d.get("username") or "").strip().lstrip("@")
        email = str(d.get("email") or "").strip()
        if not user:
            raise ValueError("sem username pra criar a conta")
        if not email:
            raise ValueError("sem e-mail pra criar a conta")
        # criar-conta já na fila pra esse @? não duplica
        for j in self._fila_emulador:
            if (j.get("bot") == "criar-conta" and j.get("estado") in ("pendente", "em_execucao")
                    and ((j.get("conta") or {}).get("label") or "").lower() == user.lower()):
                return {"emulador": True, "criar": True, "run_id": j.get("run_id"), "username": user,
                        "ja_na_fila": True}
        run = Run("criar-conta", {"username": user})      # params LIMPOS (sem senha/e-mail)
        run._log_path = os.path.join(self._LOG_DIR, f"{run.id}.log")
        try:
            open(run._log_path, "w", encoding="utf-8").close()
        except Exception:
            pass
        self.runs[run.id] = run
        run.conta = user
        conta = {"id": user, "label": user, "username": user, "senha": d.get("senha") or "",
                 "email": email, "ano": d.get("ano"), "dia": d.get("dia"),
                 "bio": d.get("bio") or "", "grupo": d.get("grupo") or ""}
        self._fila_emulador.append({
            "run_id": run.id, "bot": "criar-conta", "conta": conta,
            "params": {"username": user}, "estado": "pendente", "parar": False,
        })
        await run.emitir(f"[backend] criar conta no emulador enfileirado · @{user}")
        asyncio.create_task(self.empurrar_la(forcar=True))
        return {"emulador": True, "criar": True, "run_id": run.id, "username": user}

    async def _start_story_lote(self, bot_id, base_params, usernames):
        """LOTE do story-repost = UMA run só (UM processo) rodando o story_poster.py pros usernames
        selecionados. A FILA (uma conta por vez, com pausa humana entre contas) é o loop INTERNO do
        próprio story_poster — não precisa de N runs nem de coordenador. Os usernames viram
        --contas u1,u2,… ; o app vê 1 run (1 log, 1 balão, 1 barra) e parar mata o processo = para
        tudo. Diferente do lote de cookie (IG_LOTE_CONTAS): aqui são contas-vitrine por instagrapi."""
        usuarios = [str(u).strip().lstrip("@") for u in (usernames or []) if str(u).strip()]
        if not usuarios:
            raise ValueError("sem contas-vitrine pro lote")
        params = {**dict(base_params or {}), "story_contas": usuarios,
                  "lote": True, "lote_total": len(usuarios)}
        run = await self.start(bot_id, params)   # cai no ramo story-repost do start() → _start_story_poster
        return {"lote": True, "story": True, "bot": bot_id, "total": len(usuarios),
                "contas": usuarios, "run_id": run.id}

    async def processar_linha(self, run, linha):
        """Processa UMA linha de saída do bot: marcadores [espera]/[progress]/[saldo], detecção
        de bloqueio/proxy/conta, atualização da LA e persistência via run.emitir. COMPARTILHADO
        pelo _pump (bot no server, lê do stdout) e pelos logs do agente do emulador (POST
        /emulador/jobs/{id}/log) — assim a run de emulador passa pelo MESMO pipeline (marcadores,
        LA, WS, cabeçalho, arquivo) de uma run normal."""
        if linha.startswith("[espera]"):
            e = _parse_espera(linha)
            if e:
                run.espera = {"ate": time.time() + e[0], "restam": e[0], "motivo": e[1]}
                await self._maybe_push_progresso(run)   # atualiza a LA com a contagem
                run.emitir_efemero(linha)               # a tela da run vê a contagem (WS)
            return   # marcador de pausa: não vai pro log nem vira status_log
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

    async def _pump(self, run):
        try:
            async for raw in run.proc.stdout:
                linha = raw.decode("utf-8", "replace").rstrip("\r\n")
                await self.processar_linha(run, linha)
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
            # o bot de login/verificar é o "auto-follow" (veículo do job de emulador) — o título e
            # a ação é que dizem o que foi de verdade (o app mostra isto, não "Auto Follow")
            "titulo": run.titulo, "acao": run.params.get("acao"),
            "motivo": getattr(run, "motivo", None),
        })

    async def _push_inicio(self, run):
        """Avisa o celular que a run começou (pula import de cookies). O lote é UMA run só, então
        notifica normal (começou/terminou) — não é mais N runs pra virar spam."""
        if run.params.get("import_cookies"):
            return
        # cronograma (auto): NÃO manda o "começou" — o próprio cronograma já avisa "rodando
        # sozinho" (via LA/push). Sem isso vinham 3 avisos. O "começou" fica só pro run MANUAL.
        if run.params.get("cronograma"):
            return
        # o nome do PROCESSO (login → "Conectar @x", verificar → "Verificar sessões", lote → "X ·
        # lote"): antes só o login era tratado e o verificar chegava como "Auto Follow · começou"
        nome = run.titulo or bots.BOTS.get(run.bot, {}).get("nome", run.bot)
        try:
            await asyncio.to_thread(
                notify.enviar, f"{nome} · começou",
                "Tô nessa… vou te mostrando o progresso.",
                {"type": "start", "runId": run.id, "bot": run.bot, "titulo": run.titulo},
                grupo=f"bot:{bot_exibicao(run.bot, run.params)}")   # um monte por processo no lock screen
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
        # login/verificar: o nome é o do PROCESSO ("Conectar @x"), não o do bot-veículo
        nome = info["titulo"] if eh_processo_de_conta(run.params) else bots.BOTS.get(run.bot, {}).get("nome", run.bot)
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
        grupo = "conexao" if run.params.get("import_cookies") else f"bot:{bot_exibicao(run.bot, run.params)}"
        try:
            await asyncio.to_thread(notify.enviar, titulo, corpo,
                                    {"runId": run.id, "bot": run.bot, "titulo": info["titulo"]},
                                    grupo=grupo)
        except Exception:
            pass

    async def stop(self, run_id):
        run = self.runs.get(run_id)
        if not run:
            return False
        # ── bot de emulador: não há proc local pra matar. Marca parado, sinaliza o agente (flag
        # que ele consulta em GET /emulador/jobs/{id}/parar) e, se o job ainda estava PENDENTE
        # (agente nunca pegou → não virá /fim), finaliza aqui mesmo (LA/history/push/fila). Se já
        # estava EM EXECUÇÃO, só sinaliza: o agente aborta e manda /fim, que fecha tudo respeitando
        # o 'parado'. (import_cookies não é emulador — cai no fluxo de proc abaixo.)
        if bots.target(run.bot) == "emulador" and not run.params.get("import_cookies"):
            job = self._job_de(run_id)
            pendente = bool(job and job.get("estado") == "pendente")
            if run.status in ("rodando", "iniciando"):
                run.status = "parado"
                if run.ended_at is None:
                    run.ended_at = time.time()
            if job:
                job["parar"] = True
            if pendente:
                await self.finalizar_emulador(run, ok=False, motivo="parado antes de rodar")
            return True
        if not run.proc:
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
        acao = rec.get("acao")
        # o título GRAVADO (login/verificar = "Conectar …"/"Verificar sessões"); só cai no nome do
        # bot se o registro é antigo — antes isto devolvia "Auto Follow" pros logins
        titulo = rec.get("titulo") or bots.BOTS.get(bot, {}).get("nome", bot)
        if acao == "login" and str(titulo).startswith("Reconectar no app"):
            titulo = "Conectar contas"
        return {
            "id": rec.get("id"), "bot": bot,
            "titulo": titulo,
            "status": rec.get("status") or "finalizado",
            "started_at": rec.get("started_at"), "ended_at": rec.get("ended_at"),
            "returncode": None, "params": {"acao": acao} if acao else {}, "linhas": 0,
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
