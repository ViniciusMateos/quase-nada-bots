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
# manhã (10h-13h30) e tarde (13h30-17h). Teto às 17h de propósito: o aquecimento fecha de
# tarde e a NOITE fica livre pro auto-follow/DM manual sem colidir. Cada metade é fatiada em
# N sub-slots (um por conta) → escala pra qualquer número de contas, uma conta por sub-slot
# (1 IP → duas contas nunca caem no mesmo horário; e o guard serializa qualquer sobra).
_MANHA = (10 * 60, 13 * 60 + 30)   # 10:00–13:30
_TARDE = (13 * 60 + 30, 17 * 60)   # 13:30–17:00 (teto às 17h; noite livre p/ auto-follow/DM manual)

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


def _reconciliar_plano(plano, agora):
    """Mantém o plano do dia em sincronia com as contas cadastradas AGORA. Como roda a cada tick
    (60s), na prática é ~tempo real:
      - ADICIONA contas criadas depois que o plano foi montado (o plano é congelado por dia, então
        uma conta nova não entrava até o dia seguinte). Cada uma ganha 2 slots (manhã + tarde);
        slot cujo horário já passou entra como `enviado` (não dispara atrasado).
      - REMOVE tarefas de contas que foram DELETADAS (o usuário apagou a conta). Sem isso o
        cronograma tentaria rodar/reconectar uma conta que não existe mais e encheria de push.
    Devolve True se mexeu (pro chamador salvar)."""
    vivos = {a.get("id"): a for a in _contas()}
    tarefas = plano.get("tarefas", [])
    # 1) tira as órfãs (conta deletada) — silenciosamente, não vira aviso de reconectar
    limpas = [t for t in tarefas if t.get("conta_id") in vivos]
    removeu = len(limpas) != len(tarefas)
    # 2) adiciona as que ainda não estão no plano (contas novas)
    ja = {t.get("conta_id") for t in limpas}
    novas = [a for a in vivos.values() if a.get("id") not in ja]
    if novas:
        d = agora.date()
        rnd = random.Random(d.toordinal() * 7919 + 4242)   # semente ≠ da geração base p/ não colar
        manha = _horarios(len(novas), _MANHA, rnd); rnd.shuffle(manha)
        tarde = _horarios(len(novas), _TARDE, rnd); rnd.shuffle(tarde)
        modo = _modo_humano() or "padrão fifa"
        for i, a in enumerate(novas):
            label = a.get("label")
            for (hora, mm) in (manha[i], tarde[i]):
                limpas.append({
                    "conta_id": a.get("id"), "conta": label, "bot": "human-warmup",
                    "modo": modo, "desc": "aquecimento humano",
                    "hora": hora, "min": mm,
                    "titulo": "Cronograma · hora de rodar",
                    "corpo": f"Hora de rodar o Aquecimento Humano na @{label}",
                    "enviado": (hora, mm) <= (agora.hour, agora.minute),
                })
    if not (removeu or novas):
        return False
    limpas.sort(key=lambda t: (t["hora"], t["min"]))
    plano["tarefas"] = limpas
    return True


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


async def _sessao_viva(conta_id, tentativas=3, intervalo=4):
    """Valida a sessão com RETRY. O check é 1 request pelo túnel residencial (compartilhado e com
    blips), então UMA falha isolada NÃO quer dizer 'sessão caiu' — era o que dava falso 'reconecta'
    (medido 21/09: segue5 viva 3/3 na mão, mas o cronograma gritou sem sessão num tranco do túnel).
    Sessão MORTA de verdade falha SEMPRE (302, ex: segue8 CAIU 3/3); blip do túnel recupera numa
    próxima tentativa. Só devolve False se TODAS as tentativas falharem."""
    for i in range(tentativas):
        if await asyncio.to_thread(accounts.validar, conta_id):
            return True
        if i < tentativas - 1:
            await asyncio.sleep(intervalo)
    return False


async def _auto_rodar(t, mgr):
    """Tenta INICIAR o run do aquecimento sozinho. Devolve:
      "rodou"   → iniciou. SEM push nenhum: só liga a LA (visível) + registra uma linha no log
                  da run. O Vinicius não quer ser notificado quando roda no automático.
      "adia"    → já tem bot rodando (1 IP = um por vez) — tenta no próximo tick, NÃO marca;
      "tratado" → sessão caiu → já mandei o push de "reconecta"; o chamador só marca feito;
      "sem"     → sem mgr / não é aquecimento / erro → o chamador manda o lembrete."""
    if mgr is None or t.get("bot") != "human-warmup":
        return "sem"
    # conta DELETADA depois do plano montado: não existe mais no índice. Não é "sessão caiu" —
    # pula SEM push (não enche pra reconectar o que o usuário apagou de propósito). Guard extra:
    # o _reconciliar_plano já tira a órfã, mas isto cobre a corrida (deletou no meio do tick).
    if not accounts.existe(t.get("conta_id")):
        return "tratado"
    if _bot_rodando(mgr):
        return "adia"
    # sessão VIVA de verdade (não só existir o arquivo): check HTTP leve pelo proxy
    # (/accounts/edit/ → 200 vivo, 302 caiu), COM RETRY (_sessao_viva) — 1 tranco no túnel não
    # pode virar falso "reconecta". Sessão morta de verdade falha nas 3 tentativas. Só avisa
    # reconectar quando REALMENTE caiu; sem fingir "rodando sozinho" nem piscar a LA à toa.
    if not await _sessao_viva(t.get("conta_id")):
        await asyncio.to_thread(
            notify.enviar, "Cronograma · reconecta",
            f"Era hora do Aquecimento na @{t.get('conta')}, mas a sessão caiu. Reconecta pra rodar.",
            {"tipo": "cronograma", "botId": t["bot"], "nome": _NOME_BOT.get(t["bot"], t["bot"]),
             "conta": t.get("conta"), "conta_id": t.get("conta_id")}, grupo="cronograma")
        return "tratado"                   # já avisei — o chamador só marca como feito
    modo = _modo_humano(t.get("modo"))
    try:
        # "cronograma": True → o _push_inicio NÃO manda o "começou". No auto-run a gente NÃO manda
        # push nenhum: só liga a LA (visível) + registra uma linha no log da run. O único push que
        # sobra no fluxo do cronograma é o de "reconecta" (sessão caída, tratado lá em cima).
        run = await mgr.start("human-warmup",
                              {"conta_id": t.get("conta_id"), "modo": modo, "cronograma": True})
    except Exception:
        return "sem"
    nome = _NOME_BOT.get(t["bot"], t["bot"])
    # Em vez de notificação, deixa um registro no PRÓPRIO log da run — aparece ao vivo e no
    # histórico, junto de "Sessão salva" etc. É o "coloca no log" que o Vinicius pediu: quando
    # roda sozinho ele não quer banner, só ver no log que começou automático.
    try:
        await run.emitir(f"Cronograma: comecei o Aquecimento Humano automaticamente na @{t.get('conta')}.")
    except Exception:
        pass
    # LA automática (push-to-start) — é o ÚNICO aviso VISÍVEL que sobra (o que o Vinicius quer:
    # "só deixa o LA visível"). O `alert` é minimal só pq o iOS EXIGE alert no start; ele NÃO
    # vira banner (o iOS mostra a própria LA no lugar), então o resultado é: LA na tela, zero
    # notificação. (AO VIVO a barra só anda com o app aberto/em background — o iOS só entrega o
    # token de update pro app rodando; com o app fechado o nativo posta o token direto.)
    try:
        await mgr.iniciar_la_pts(nome, {
            "titulo": nome, "pct": 0, "medido": False,
            "label": f"@{t.get('conta')} · cronograma", "quantos": 1, "bot": t["bot"], "linhas": []},
            alert={"title": "Aquecimento", "body": f"@{t.get('conta')}"})
    except Exception:
        pass
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
    elif _reconciliar_plano(plano, agora):   # sincroniza o plano com as contas de agora (add/remove)
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
