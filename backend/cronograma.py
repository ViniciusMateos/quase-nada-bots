"""
Cronograma de lembretes.

Manda push notifications lembrando de RODAR os bots (o login/run é manual), em
horários ALEATÓRIOS dentro de janelas do dia, seguindo o ciclo quinzenal de drops:
  - drop cai sempre na TERÇA, "uma semana sim, uma não" (âncora: terça 04/08/2026 é drop);
  - semana de DROP  → forte nas contas Prontas (money follow + DM) + aquece 1 conta/dia;
  - semana de DESCANSO → Prontas leves + foco em aquecer as contas novas/aquecendo.

Regras de ouro:
  - decide o que rodar por TIER da conta (não por @ fixo) → escala pra N contas sozinho;
  - 1 conta por janela (só temos 1 IP → nunca duas contas na mesma faixa de horário);
  - horário sorteado por dia (estável no dia → restart-safe) pra não virar padrão.

Persistência:
  - cronograma_plano.json → plano do dia (horários + quais já foram enviados);
  - cronograma_config.json → {"ativo": bool} (liga/desliga os lembretes).
"""
import asyncio
import json
import random
from datetime import date, datetime, timedelta
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

# Uma terça de DROP conhecida. Os drops caem em ANCHOR + 14*k dias (terças alternadas).
_ANCHOR_DROP = date(2026, 8, 4)

# Janelas do dia (hora local BR): 10h às 22h, uma por hora. Cada tarefa cai numa janela
# distinta → 1 conta por janela (1 IP → nunca duas contas no mesmo horário).
_JANELAS = [(h, h + 1) for h in range(10, 22)]
_MAX_TAREFAS_DIA = 12   # teto diário (bate com o nº de janelas 10h-22h)

_NOME_BOT = {"auto-follow": "Auto Follow", "dm-followers": "DM Followers",
             "human-warmup": "Aquecimento Humano"}


def _agora():
    return datetime.now(_TZ) if _TZ else datetime.now()


def semana_tipo(d):
    """'drop' ou 'descanso' pra semana da data d (terça da semana vs âncora)."""
    terca = d - timedelta(days=d.weekday() - 1)          # terça da semana (seg=0..dom=6)
    semanas = (terca - _ANCHOR_DROP).days // 7
    return "drop" if semanas % 2 == 0 else "descanso"


def _por_tier():
    res = {}
    for a in accounts.listar():
        if not a.get("id"):
            continue
        res.setdefault(a.get("tier") or "nova", []).append(a)
    return res


def _tarefas_base(d, tipo, por_tier):
    """Tarefas do dia (conta, bot, modo, desc), antes de sortear horário.

    BASE: aquecimento humano em TODAS as contas, TODO dia (independe do tier — é só navegar
    como gente, e o IG gosta de ver atividade real). DINHEIRO (follow/DM): só nas Prontas,
    forte na semana de drop. Contas 'queimada' ficam de fora de tudo."""
    dia = d.toordinal()
    tasks = []
    # 1) aquecimento humano em todas as contas (nova/aquecendo = leve; pronta/descanso = medio)
    for tier in ("pronta", "descanso", "aquecendo", "nova"):
        modo = "medio" if tier in ("pronta", "descanso") else "leve"
        for a in por_tier.get(tier, []):
            tasks.append((a, "human-warmup", modo, "aquecimento humano"))
    # 2) dinheiro: só nas Prontas
    prontas = por_tier.get("pronta", [])
    if tipo == "drop":
        for a in prontas:
            tasks.append((a, "auto-follow", "money-drop", "follow do drop"))
        if prontas:                        # DM: 1 pronta por dia, rotativo
            a = prontas[dia % len(prontas)]
            tasks.append((a, "dm-followers", "dm-drop", "DM do drop"))
    elif d.weekday() % 2 == 0:             # descanso: prontas seguem leve, dia sim / dia não
        for a in prontas:
            tasks.append((a, "auto-follow", "descanso", "follow leve"))
    return tasks[:_MAX_TAREFAS_DIA]


def _gerar_plano(d):
    tipo = semana_tipo(d)
    base = _tarefas_base(d, tipo, _por_tier())
    rnd = random.Random(d.toordinal() * 7919)     # semente por dia → horários estáveis no dia
    janelas = _JANELAS[:]
    rnd.shuffle(janelas)
    tarefas = []
    for i, (a, bot, modo, desc) in enumerate(base):
        h0, h1 = janelas[i % len(janelas)]
        minutos = rnd.randint(0, (h1 - h0) * 60 - 1)
        hora, mm = h0 + minutos // 60, minutos % 60
        label = a.get("label")
        nome_bot = _NOME_BOT.get(bot, bot)
        tarefas.append({
            "conta_id": a.get("id"), "conta": label, "bot": bot, "modo": modo, "desc": desc,
            "hora": hora, "min": mm,
            "titulo": "Cronograma · hora de rodar",
            "corpo": f'{nome_bot} na @{label} — modo "{modo}" ({desc})',
            "enviado": False,
        })
    tarefas.sort(key=lambda t: (t["hora"], t["min"]))
    return {"data": d.isoformat(), "tipo": tipo, "tarefas": tarefas}


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
            })
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
