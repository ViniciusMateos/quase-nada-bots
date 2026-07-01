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
import settings

_counter = itertools.count(1)


class Run:
    def __init__(self, bot_id, params):
        self.id = f"run-{next(_counter)}"
        self.bot = bot_id
        self.params = params or {}
        self.status = "iniciando"      # iniciando | rodando | finalizado | parado | erro
        self.started_at = time.time()
        self.ended_at = None
        self.returncode = None
        self.linhas = deque(maxlen=settings.MAX_LOG_LINES)
        self.subs = set()              # set[asyncio.Queue]
        self.proc = None

    def info(self):
        return {
            "id": self.id, "bot": self.bot, "status": self.status,
            "started_at": self.started_at, "ended_at": self.ended_at,
            "returncode": self.returncode, "params": self.params,
            "linhas": len(self.linhas),
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
        return run

    async def _pump(self, run):
        try:
            async for raw in run.proc.stdout:
                await run.emitir(raw.decode("utf-8", "replace").rstrip("\r\n"))
        except Exception as e:
            await run.emitir(f"[backend] erro lendo saída: {e}")
        run.returncode = await run.proc.wait()
        run.ended_at = time.time()
        if run.status != "parado":
            run.status = "finalizado" if run.returncode == 0 else "erro"
        await run.emitir(f"[backend] processo terminou (status={run.status}, code={run.returncode})")
        for q in list(run.subs):       # sinaliza fim (None) aos assinantes
            try:
                q.put_nowait(None)
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
