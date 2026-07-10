"""
Histórico persistente das runs — só o saldo (compacto), append-only em JSONL.
Sobrevive a restart do serviço. Cada linha é um registro:
  {id, bot, dry_run, started_at, ended_at, duracao_s, status, bloqueio, saldo:{...}, backfill?}
"""
import json
from pathlib import Path

_FILE = Path(__file__).parent / "runs_history.jsonl"


def registrar(record):
    try:
        with _FILE.open("a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
    except Exception:
        pass


def _ler_tudo():
    if not _FILE.exists():
        return []
    out = []
    for linha in _FILE.read_text(encoding="utf-8").splitlines():
        linha = linha.strip()
        if not linha:
            continue
        try:
            out.append(json.loads(linha))
        except Exception:
            pass
    return out


def listar(bot=None, status=None, desde=None, ate=None, limite=1000):
    def ok(r):
        if bot and r.get("bot") != bot:
            return False
        if status and r.get("status") != status:
            return False
        t = r.get("ended_at") or r.get("started_at") or 0
        if desde and t < desde:
            return False
        if ate and t > ate:
            return False
        return True

    regs = [r for r in _ler_tudo() if ok(r)]
    regs.sort(key=lambda r: r.get("ended_at") or r.get("started_at") or 0, reverse=True)
    return regs[:limite]
