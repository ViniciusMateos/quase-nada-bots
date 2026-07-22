"""
Backfill do histórico a partir dos run.log dos workers — converte as runs já
rodadas (o bloco 'SALDO DA EXECUÇÃO') em registros JSON. Idempotente (não duplica).

Rode UMA vez por ambiente (local e/ou no server):
    python backfill_history.py
"""
import io
import re
from datetime import datetime

import bots
import history

_TS = re.compile(r"^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})")

# substring do label (minúsculo) → chave do saldo, por bot
_MAP = {
    "auto-follow": {"seguidas": "seguidos", "solicitadas": "pedidos", "puladas": "pulados"},
    "dm-followers": {"dms enviadas": "enviadas", "puladas": "puladas"},
}


def _epoch(s):
    return datetime.strptime(s, "%Y-%m-%d %H:%M:%S").timestamp()


def _ultimo_int(linha):
    achados = re.findall(r"-?\d+", linha)
    return int(achados[-1]) if achados else 0


def backfill_bot(bot_id, existentes):
    d = bots.bot_dir(bot_id)
    log = d / "output" / "run.log"
    if not log.exists():
        return 0
    linhas = io.open(log, encoding="utf-8", errors="replace").read().splitlines()
    idx = [i for i, l in enumerate(linhas) if "SALDO DA EXECU" in l]
    mapa = _MAP.get(bot_id, {})
    n = 0
    for pos, i in enumerate(idx):
        m = _TS.match(linhas[i])
        if not m:
            continue
        ended = _epoch(m.group(1))
        rid = f"bf-{bot_id}-{int(ended)}"
        if rid in existentes:
            continue
        dry = "simulado" in linhas[i].lower()
        saldo = {}
        j = i + 1
        while j < len(linhas) and "────────" not in linhas[j] and "SALDO DA EXECU" not in linhas[j]:
            low = linhas[j].lower()
            for sub, chave in mapa.items():
                if sub in low:
                    saldo[chave] = _ultimo_int(linhas[j])
                    break
            j += 1
        trecho = "\n".join(linhas[(idx[pos - 1] if pos > 0 else 0):i]).lower()
        bloqueio = "bloqueio" in trecho or "⛔" in trecho
        if "erro fatal" in trecho or "erro inesperado" in trecho:
            status = "erro"
        elif "interrompido" in trecho:
            status = "parado"
        else:
            status = "finalizado"
        history.registrar({
            "id": rid, "bot": bot_id, "dry_run": dry,
            "started_at": None, "ended_at": ended, "duracao_s": None,
            "status": status, "bloqueio": bloqueio, "saldo": saldo, "backfill": True,
        })
        existentes.add(rid)
        n += 1
    return n


def main():
    existentes = {r.get("id") for r in history.listar(limite=1000000)}
    total = 0
    for bot_id in bots.BOTS:
        c = backfill_bot(bot_id, existentes)
        if c:
            print(f"  {bot_id}: +{c} runs")
        total += c
    print(f"backfill: {total} runs importadas")


if __name__ == "__main__":
    main()
