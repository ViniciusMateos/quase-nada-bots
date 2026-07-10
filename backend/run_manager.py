"""
Gerenciador de execuções: roda cada bot como subprocesso, captura o stdout linha
a linha e faz broadcast pros assinantes (WebSocket). Suporta runs simultâneos e parar.
"""
import asyncio
import itertools
import os
import time
from collections import deque

import bots
import history
import notify
import settings

_counter = itertools.count(1)


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
        self.subs = set()              # set[asyncio.Queue]
        self.proc = None
        self._ult_push_pct = -100      # throttle dos pushes de progresso
        self._ult_push_t = 0.0

    def info(self):
        return {
            "id": self.id, "bot": self.bot, "status": self.status,
            "started_at": self.started_at, "ended_at": self.ended_at,
            "returncode": self.returncode, "params": self.params,
            "linhas": len(self.linhas), "progress": self.progress,
        }

    async def emitir(self, linha):
        self.linhas.append(linha)
        for q in list(self.subs):
            try:
                q.put_nowait(linha)
            except Exception:
                pass


class RunManager:
    def __init__(self):
        self.runs = {}

    async def start(self, bot_id, params):
        if not bots.existe(bot_id):
            raise ValueError(f"bot desconhecido: {bot_id}")
        run = Run(bot_id, params)
        self.runs[run.id] = run
        cmd = [settings.PYTHON_BIN] + bots.montar_cmd(bot_id, params)
        env = {**os.environ, "PYTHONUTF8": "1", "PYTHONUNBUFFERED": "1"}
        run.proc = await asyncio.create_subprocess_exec(
            *cmd, cwd=str(bots.bot_dir(bot_id)),
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT, env=env,
        )
        run.status = "rodando"
        asyncio.create_task(self._pump(run))
        asyncio.create_task(self._push_inicio(run))
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
        """Push de progresso com a barrinha — com throttle pra não spammar (só quando
        avança >=15% OU passou >=25s do último; nunca 100%, que o _push_fim cobre)."""
        if run.params.get("import_cookies"):
            return
        p = run.progress
        if not p or not p.get("total"):
            return
        pct = max(0, min(100, round(p["done"] / p["total"] * 100)))
        if pct >= 100:
            return
        agora = time.time()
        if pct - run._ult_push_pct < 15 and (agora - run._ult_push_t) < 25:
            return
        run._ult_push_pct = pct
        run._ult_push_t = agora
        nome = bots.BOTS.get(run.bot, {}).get("nome", run.bot)
        barra = notify.barra_progresso(p["done"], p["total"])
        label = p.get("label") or f"{p['done']}/{p['total']}"
        try:
            await asyncio.to_thread(
                notify.enviar, nome, f"{barra}  ·  {label}",
                {"type": "progress", "runId": run.id, "bot": run.bot,
                 "pct": pct, "done": p["done"], "total": p["total"], "label": p.get("label", "")})
        except Exception:
            pass

    async def _push_fim(self, run):
        """Notifica o celular quando a run termina (pula runs de import de cookies)."""
        if run.params.get("import_cookies"):
            return
        nome = bots.BOTS.get(run.bot, {}).get("nome", run.bot)
        if run.status == "erro":
            titulo, corpo = "Deu ruim", f"{nome} parou com erro."
        elif run.status == "parado":
            titulo, corpo = "Parado", f"{nome} foi parado."
        else:
            corpo = f"{nome} finalizou."
            if run.progress and run.progress.get("total"):
                corpo = f"{nome} finalizou — {run.progress['done']}/{run.progress['total']}."
            titulo = "Terminou"
        try:
            await asyncio.to_thread(notify.enviar, titulo, corpo, {"runId": run.id, "bot": run.bot})
        except Exception:
            pass

    async def stop(self, run_id):
        run = self.runs.get(run_id)
        if not run or not run.proc:
            return False
        if run.proc.returncode is None:
            run.status = "parado"
            try:
                run.proc.terminate()
            except Exception:
                pass
        return True

    def listar(self):
        return [r.info() for r in self.runs.values()]

    def get(self, run_id):
        return self.runs.get(run_id)
