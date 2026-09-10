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
import bots
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


def _modo_humano(preferido=None):
    """Um modo VÁLIDO pro human-warmup: o `preferido` se existir, senão o 1º da lista de modos
    do worker. Evita cair num modo inexistente (ex: o antigo 'medio' hardcodado, que não existe
    → o run abortava com 'modo não existe')."""
    try:
        modos = bots.ler_modos("human-warmup") or {}
        if preferido and preferido in modos:
            return preferido
        return next(iter(modos), None)
    except Exception:
        return preferido


def _bot_rodando(mgr):
    """True se QUALQUER bot está rodando/iniciando (1 IP → um bot por vez; não auto-rodar em cima)."""
    try:
        return any(r.status in ("rodando", "iniciando") for r in mgr.runs.values())
    except Exception:
        return False


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
    modo = _modo_humano() or "padrão fifa"   # modo REAL do worker (não o antigo 'medio' fantasma)
    tarefas = []
    for i, a in enumerate(contas):
        label = a.get("label")
        for (hora, mm) in (manha[i], tarde[i]):   # 1x de manhã + 1x de tarde/noite = 2x/dia
            tarefas.append({
                "conta_id": a.get("id"), "conta": label, "bot": "human-warmup",
                "modo": modo, "desc": "aquecimento humano",
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


async def _lembrar(t):
    """Push de lembrete (comportamento antigo): o tap abre o app pra rodar/reconectar."""
    corpo = t.get("corpo") or f"Hora de rodar o Aquecimento Humano na @{t.get('conta')}"
    await asyncio.to_thread(notify.enviar, t.get("titulo") or "Cronograma · hora de rodar", corpo, {
        "tipo": "cronograma", "botId": t["bot"], "nome": _NOME_BOT.get(t["bot"], t["bot"]),
        "conta": t.get("conta"), "conta_id": t.get("conta_id"), "modo": t.get("modo"),
    }, grupo="cronograma")


async def _auto_rodar(t, mgr):
    """Tenta INICIAR o run do aquecimento sozinho. Devolve:
      "rodou" → iniciou (+ push "rodando sozinho" + liga a LA automática);
      "adia"  → já tem bot rodando (1 IP = um por vez) — tenta no próximo tick, NÃO marca;
      "sem"   → sem mgr / não é aquecimento / sessão caiu / erro → o chamador manda o lembrete."""
    if mgr is None or t.get("bot") != "human-warmup":
        return "sem"
    if _bot_rodando(mgr):
        return "adia"
    # sessão VIVA de verdade (não só existir o arquivo): check HTTP leve pelo proxy
    # (/accounts/edit/ → 200 vivo, 302 caiu). Sessão morta → push claro de reconectar, SEM
    # fingir "rodando sozinho" nem piscar a LA à toa. Barato: 1 request, e o tunel tá livre
    # (já checamos que nenhum bot roda). Cobre também "sem arquivo" (validar volta False).
    if not await asyncio.to_thread(accounts.validar, t.get("conta_id")):
        await asyncio.to_thread(
            notify.enviar, "Cronograma · reconecta",
            f"Era hora do Aquecimento na @{t.get('conta')}, mas a sessão caiu. Reconecta pra rodar.",
            {"tipo": "cronograma", "botId": t["bot"], "nome": _NOME_BOT.get(t["bot"], t["bot"]),
             "conta": t.get("conta"), "conta_id": t.get("conta_id")}, grupo="cronograma")
        return "tratado"                   # já avisei — o chamador só marca como feito
    modo = _modo_humano(t.get("modo"))
    try:
        await mgr.start("human-warmup", {"conta_id": t.get("conta_id"), "modo": modo})
    except Exception:
        return "sem"
    nome = _NOME_BOT.get(t["bot"], t["bot"])
    titulo_push = "Cronograma · rodando sozinho"
    corpo_push = f"Segui o cronograma e comecei o Aquecimento Humano na @{t.get('conta')} sozinho."
    # LA automática via push-to-start. O `alert` dela JÁ é a notificação (o start EXIGE alert),
    # então quando a LA sobe não mando push separado — evita banner dobrado. Se a LA falhar
    # (build velho/sem pts/apns), aí sim mando o push normal pra você saber que rodou.
    la_ok = False
    try:
        res = await mgr.iniciar_la_pts(nome, {
            "titulo": nome, "pct": 0, "medido": False,
            "label": f"@{t.get('conta')} · cronograma", "quantos": 1, "bot": t["bot"], "linhas": []},
            alert={"title": titulo_push, "body": corpo_push})
        la_ok = bool(res and res.get("ok"))
    except Exception:
        la_ok = False
    if not la_ok:
        await asyncio.to_thread(
            notify.enviar, titulo_push, corpo_push,
            {"tipo": "cronograma_auto", "botId": t["bot"], "nome": nome,
             "conta": t.get("conta"), "conta_id": t.get("conta_id")}, grupo="cronograma")
    return "rodou"


async def _tick(mgr=None):
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
    agora_min = agora.hour * 60 + agora.minute
    mudou = False
    for t in plano["tarefas"]:
        if t.get("enviado"):
            continue
        if agora_min < t["hora"] * 60 + t["min"]:
            continue                                   # ainda não chegou a hora
        atraso = agora_min - (t["hora"] * 60 + t["min"])
        r = await _auto_rodar(t, mgr)
        if r == "adia":
            if atraso <= 120:                          # tem bot rodando: espera a vaga (até 2h)
                continue
            await _lembrar(t)                          # passou de 2h na fila → desiste do auto, lembra
            t["enviado"] = True; mudou = True
        elif r in ("rodou", "tratado"):               # rodou sozinho OU já avisou (sessão caiu)
            t["enviado"] = True; mudou = True
        else:                                          # "sem" → lembrete (tap manual / sem mgr)
            await _lembrar(t)
            t["enviado"] = True; mudou = True
    if mudou:
        _salvar_plano(plano)


async def loop(mgr=None):
    """Roda no startup do backend: a cada 60s dispara/auto-roda o cronograma do dia."""
    while True:
        try:
            await _tick(mgr)
        except Exception:
            pass
        await asyncio.sleep(60)
