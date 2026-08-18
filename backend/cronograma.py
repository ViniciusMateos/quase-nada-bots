"""
Cronograma de lembretes.

Manda push notifications lembrando de RODAR o AQUECIMENTO HUMANO (o login/run é
manual), em horários ALEATÓRIOS dentro de janelas do dia.

Regras de ouro:
  - só aquecimento humano, em TODAS as contas, TODO dia, 2x por conta;
  - as 2 vezes caem em faixas separadas (1 de manhã, 1 de tarde/noite) → nunca coladas;
  - 1 conta por janela (só temos 1 IP → nunca duas contas na mesma faixa de horário);
  - horário sorteado por dia (estável no dia → restart-safe) pra não virar padrão.

Persistência:
  - cronograma_plano.json → plano do dia (horários + quais já foram enviados);
  - cronograma_config.json → {"ativo": bool} (liga/desliga os lembretes).
"""
import asyncio
import json
import random
from datetime import datetime
from pathlib import Path

try:
    from zoneinfo import ZoneInfo
    _TZ = ZoneInfo("America/Sao_Paulo")
except Exception:
    _TZ = None

import accounts
import notify

_DIR = Path(__file__).parent
_PLANO = _DIR / "cronograma_plano.json"
_CFG = _DIR / "cronograma_config.json"

# Duas metades do dia (minutos do dia, hora local BR) pra garantir 2x/dia SEPARADOS:
# manhã/tarde (10h-15h) e tarde/noite (15h-22h). Cada metade é fatiada em N sub-slots (um
# por conta) → escala pra QUALQUER número de contas, sempre uma conta por sub-slot (1 IP →
# duas contas nunca caem no mesmo horário).
_MANHA = (10 * 60, 15 * 60)   # 10:00–15:00
_TARDE = (15 * 60, 22 * 60)   # 15:00–22:00

_NOME_BOT = {"human-warmup": "Aquecimento Humano"}


def _horarios(n, faixa, rnd):
    """n horários (hora, min) sorteados dentro da faixa [ini,fim) em minutos — um por sub-slot,
    então nunca colam. Folga de 1min nas bordas do slot."""
    ini, fim = faixa
    if n <= 0:
        return []
    passo = (fim - ini) / n
    out = []
    for i in range(n):
        s0 = ini + passo * i
        s1 = ini + passo * (i + 1)
        m = int(rnd.uniform(s0, max(s0, s1 - 1)))
        out.append((m // 60, m % 60))
    return out


def _agora():
    return datetime.now(_TZ) if _TZ else datetime.now()


def _contas():
    """Todas as contas cadastradas (o aquecimento vale pra todas — o tap da notificação
    resolve reconectar se a sessão tiver caído)."""
    return [a for a in accounts.listar() if a.get("id")]


def _gerar_plano(d):
    """Plano do dia: aquecimento humano 2x por conta (uma de manhã, uma de tarde/noite),
    minuto sorteado — horários estáveis no dia (semente por data) e sem padrão entre dias."""
    contas = _contas()
    n = len(contas)
    rnd = random.Random(d.toordinal() * 7919)     # semente por dia → horários estáveis no dia
    manha = _horarios(n, _MANHA, rnd); rnd.shuffle(manha)   # 1 slot/conta, embaralha quem pega qual
    tarde = _horarios(n, _TARDE, rnd); rnd.shuffle(tarde)
    tarefas = []
    for i, a in enumerate(contas):
        label = a.get("label")
        for (hora, mm) in (manha[i], tarde[i]):   # 1x de manhã + 1x de tarde/noite = 2x/dia
            tarefas.append({
                "conta_id": a.get("id"), "conta": label, "bot": "human-warmup",
                "modo": "medio", "desc": "aquecimento humano",
                "hora": hora, "min": mm,
                "titulo": "Cronograma · hora de rodar",
                "corpo": f"Hora de rodar o Aquecimento Humano na @{label}",
                "enviado": False,
            })
    tarefas.sort(key=lambda t: (t["hora"], t["min"]))
    return {"data": d.isoformat(), "tarefas": tarefas}


def _carregar_plano(d):
    try:
        p = json.loads(_PLANO.read_text(encoding="utf-8"))
        if p.get("data") == d.isoformat():
            return p
    except Exception:
        pass
    return None


def _salvar_plano(p):
    try:
        _PLANO.write_text(json.dumps(p, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:
        pass


def ativo():
    try:
        return bool(json.loads(_CFG.read_text(encoding="utf-8")).get("ativo", True))
    except Exception:
        return True   # default: ligado


def set_ativo(v):
    _CFG.write_text(json.dumps({"ativo": bool(v)}, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"ativo": bool(v)}


def preview(d=None):
    """Plano do dia (gera na hora se ainda não existe) — pro app mostrar o que vem hoje."""
    d = d or _agora().date()
    plano = _carregar_plano(d) or _gerar_plano(d)
    return {"ativo": ativo(), **plano}


async def _tick():
    if not ativo():
        return
    agora = _agora()
    hoje = agora.date()
    plano = _carregar_plano(hoje)
    if plano is None:
        plano = _gerar_plano(hoje)
        # tarefas cujo horário já passou na 1ª geração do dia → marca enviado (sem rajada atrasada)
        for t in plano["tarefas"]:
            if (t["hora"], t["min"]) <= (agora.hour, agora.minute):
                t["enviado"] = True
        _salvar_plano(plano)
    mudou = False
    for t in plano["tarefas"]:
        if not t["enviado"] and (agora.hour, agora.minute) >= (t["hora"], t["min"]):
            await asyncio.to_thread(notify.enviar, t["titulo"], t["corpo"], {
                "tipo": "cronograma", "botId": t["bot"], "nome": _NOME_BOT.get(t["bot"], t["bot"]),
                "conta": t.get("conta"), "conta_id": t.get("conta_id"), "modo": t.get("modo"),
            }, grupo="cronograma")   # todo o cronograma num monte só
            t["enviado"] = True
            mudou = True
    if mudou:
        _salvar_plano(plano)


async def loop():
    """Roda no startup do backend: checa a cada 60s e dispara os lembretes do dia."""
    while True:
        try:
            await _tick()
        except Exception:
            pass
        await asyncio.sleep(60)
