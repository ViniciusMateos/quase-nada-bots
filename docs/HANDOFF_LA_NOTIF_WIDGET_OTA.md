# Handoff — Live Activity, Notificações, Progresso, Widget Flutuante e OTA

> **Origem:** Quase Nada Brechó (funcionando em produção, v1.0.2)
> **Destino:** Quase Nada Bots — onde tem **N bots** que podem rodar **ao mesmo tempo**
> **Objetivo:** replicar o mesmo fluxo, adaptado pra múltiplos processos simultâneos.

Este doc tem 5 sistemas independentes. Dá pra implementar um de cada vez, nesta ordem
(cada um funciona sozinho): **Progresso → Notificações → Widget Flutuante → OTA → Live Activity**.
A Live Activity é a mais complexa e a única que exige código nativo.

---

## 0. TL;DR — o que muda do Brechó pro Bots

| Peça | Brechó | Bots (N simultâneos) |
|---|---|---|
| Progresso | 1 run | igual, **por run** — nada muda |
| Notificações | "Raspando o brechó" | **título com o nome do bot** |
| Widget flutuante | pega **a** run ativa | precisa mostrar **N runs** (bolha com contador) |
| OTA | igual | **igual, copia e cola** |
| **Live Activity** | 1 LA | ⚠️ **módulo nativo PRECISA mudar** (token→activityId) |
| Trava | 409 global (1 raspagem) | **409 por bot** (1 run por bot, N bots juntos) |

**A pegadinha #1:** o módulo nativo atual **não diz a qual Live Activity o token pertence**.
Com 2 bots subindo juntos, os tokens **se cruzam** e a barrinha do bot A atualiza com o
progresso do bot B. Isso **tem que ser corrigido no nativo** (seção 3.5). É a única coisa
que exige build.

---

## 1. As 5 peças e como conversam

```
┌─ APP (React Native / Expo) ──────────────────────────────────┐
│                                                               │
│  [3] Barra de progresso  ← WebSocket de log ─────┐            │
│  [4] Widget flutuante    ← polling GET /runs ──┐ │            │
│  [1] Live Activity (nativo) ─ push token ──┐   │ │            │
│  [5] OTA (expo-updates) ← bundle JS        │   │ │            │
└────────────────────────────────────────────┼───┼─┼────────────┘
                                             │   │ │
┌─ BACKEND (FastAPI) ─────────────────────────▼───▼─▼───────────┐
│  RunManager: roda o bot como subprocesso, lê o stdout linha    │
│  a linha e faz broadcast                                       │
│    ├─ [progress] N M label  → run.progress  → WS + LA + widget │
│    ├─ run.la_token/la_bundle → [1] push APNs (barra viva)      │
│    └─ [2] notify.enviar()    → push Expo (começou/terminou)    │
└───────────┬──────────────────────────┬─────────────────────────┘
            │ APNs (.p8, HTTP/2)       │ Expo Push API
            ▼                          ▼
     Live Activity              Notificação normal
     (lock screen / DI)         (banner)
```

**O princípio que faz tudo funcionar:** o worker (bot) é **burro**. Ele só imprime linhas
no stdout. Quem interpreta, guarda e empurra é o **backend**. O app só **exibe**.

---

## 2. O protocolo do worker (a base de tudo)

O bot imprime marcadores no stdout. O backend parseia. **Não precisa de lib, é `print()`.**

```python
# dentro do bot, no loop de trabalho:
print(f"[progress] {feitos} {total} {label}", flush=True)   # ⚠️ flush=True é obrigatório
print(f"[saldo] enviadas=12 falhas=1", flush=True)          # resumo final
print("Abrindo navegador…", flush=True)                     # linha humana → aparece no log
```

> **`flush=True` é não-negociável.** Sem ele o Python bufferiza e o progresso chega tudo
> de uma vez no fim. No spawn, use também `PYTHONUNBUFFERED=1`.

Parser no backend (copia igual):

```python
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
```

**Convenção importante:** `total = 0` significa **"ainda não sei o tamanho"** → a UI mostra
"começando" em vez de "0/0" ou "0%". Isso evita barra falsa meio-cheia na fase de abrir
navegador/logar (que leva ~70s).

---

## 3. PEÇA 1 — Live Activity (a barrinha viva no lock screen)

### 3.1 As 4 partes

1. **Módulo nativo** (Swift) — inicia a Activity e entrega o **push token**
2. **Widget** (Swift/SwiftUI) — desenha a barrinha no lock screen / Dynamic Island
3. **App (JS)** — inicia a LA e manda o token pro server
4. **Backend** — empurra updates via **APNs** (é isso que faz andar com o celular travado)

> **Por que o server empurra?** Uma Live Activity só atualiza com o app **fechado** via push
> APNs. Se o app atualizasse localmente, a barra congelaria assim que você saísse do app —
> que é exatamente o caso de uso (deixar o bot rodando e travar o celular).

### 3.2 Estrutura de arquivos

```
frontend/
├── modules/live-activity/          ← módulo nativo local (Expo Module)
│   ├── expo-module.config.json
│   ├── package.json
│   ├── index.ts                    ← interface JS
│   └── ios/
│       ├── LiveActivity.podspec
│       ├── LiveActivityModule.swift
│       └── ScrapeActivityAttributes.swift   ⚠️ CÓPIA IDÊNTICA
└── targets/scrapewidget/           ← o widget (via @bacons/apple-targets)
    ├── expo-target.config.js
    ├── ScrapeWidget.swift
    ├── ScrapeActivityAttributes.swift       ⚠️ CÓPIA IDÊNTICA
    └── logo.png
```

> ⚠️ **`ScrapeActivityAttributes.swift` existe DUAS vezes e tem que ser byte a byte igual.**
> O ActivityKit casa a activity do app com o widget pelo **nome + shape do tipo**. Se
> divergir, a LA simplesmente não aparece — **sem erro nenhum**. Foi assim que perdi tempo.

`expo-module.config.json`:
```json
{ "platforms": ["apple"], "apple": { "modules": ["LiveActivityModule"] } }
```

`package.json` do módulo:
```json
{ "name": "live-activity", "version": "1.0.0", "main": "index.ts" }
```

`targets/scrapewidget/expo-target.config.js`:
```js
/** @type {import('@bacons/apple-targets').Config} */
module.exports = {
  type: 'widget',
  name: 'ScrapeWidget',
  deploymentTarget: '16.2',
  images: {
    qnlogo: './logo.png',   // ⚠️ O './' É OBRIGATÓRIO (ver armadilhas)
  },
};
```

`app.config.js` — o que precisa:
```js
plugins: ['@bacons/apple-targets', /* … */],
ios: {
  appleTeamId: '4F7QHTY86S',        // exigido pelo apple-targets (assina o widget)
  infoPlist: {
    NSSupportsLiveActivities: true,  // ⚠️ sem isso a LA nem inicia
  },
},
```

### 3.3 O ContentState (o contrato)

```swift
struct ScrapeActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var pct: Int
    var done: Int
    var total: Int
    var label: String
  }
  var titulo: String     // fixo por activity (não muda depois de criada)
}
```

> ⚠️ O `content-state` do push JSON **tem que bater campo a campo** com esse struct. Um
> campo a mais/menos ou tipo diferente → o push é aceito (200!) e **nada acontece**.
> Debug silencioso, o pior tipo.

**Pro app de Bots:** ponha o nome do bot no `titulo` (é o `attributes`, fixo por activity —
perfeito, cada bot tem sua LA com seu nome). Se quiser cor/ícone por bot, adicione um campo
`bot: String` nos **attributes** (não no ContentState — attributes é imutável e é o que
identifica).

### 3.4 O módulo nativo ATUAL (Brechó — 1 LA só)

```swift
import ExpoModulesCore
import ActivityKit

public class LiveActivityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LiveActivity")
    Events("onToken")

    Function("disponivel") { () -> Bool in
      if #available(iOS 16.2, *) { return ActivityAuthorizationInfo().areActivitiesEnabled }
      return false
    }

    AsyncFunction("start") { (titulo: String, total: Int) -> Bool in
      guard #available(iOS 16.2, *),
            ActivityAuthorizationInfo().areActivitiesEnabled else { return false }
      let attrs = ScrapeActivityAttributes(titulo: titulo)
      let state = ScrapeActivityAttributes.ContentState(
        pct: 0, done: 0, total: max(total, 0), label: "começando")
      do {
        let activity = try Activity.request(
          attributes: attrs, content: .init(state: state, staleDate: nil), pushType: .token)
        Task { [weak self] in
          for await tokenData in activity.pushTokenUpdates {
            let hex = tokenData.map { String(format: "%02x", $0) }.joined()
            self?.sendEvent("onToken", ["token": hex])     // ⚠️ não diz de QUAL activity
          }
        }
        return true
      } catch { return false }
    }

    AsyncFunction("end") { (promise: Promise) in
      guard #available(iOS 16.2, *) else { promise.resolve(nil); return }
      Task {
        for activity in Activity<ScrapeActivityAttributes>.activities {
          await activity.end(nil, dismissalPolicy: .immediate)   // ⚠️ mata TODAS
        }
        promise.resolve(nil)
      }
    }
  }
}
```

### 3.5 ⚠️ MUDANÇA OBRIGATÓRIA PRO APP DE BOTS

**O problema:** `start()` não devolve identificador e o evento `onToken` só manda `{token}`.
Com 2 bots:

```
Bot A start → onToken {token: "aaa"}  → JS: "é do A" ✓
Bot B start → onToken {token: "bbb"}  → JS: quem escuta? OS DOIS listeners!
                                         → run A recebe o token do B ✗
```

O `la.ts` do Brechó registra um listener por run com janela de 45s — com 1 run só, funciona.
Com N runs concorrentes, **quebra**.

**A correção (módulo novo, pro app de Bots):**

```swift
import ExpoModulesCore
import ActivityKit

public class LiveActivityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LiveActivity")
    Events("onToken")

    Function("disponivel") { () -> Bool in
      if #available(iOS 16.2, *) { return ActivityAuthorizationInfo().areActivitiesEnabled }
      return false
    }

    // AGORA devolve o activityId (String) em vez de Bool
    AsyncFunction("start") { (titulo: String, bot: String, total: Int) -> String? in
      guard #available(iOS 16.2, *),
            ActivityAuthorizationInfo().areActivitiesEnabled else { return nil }
      let attrs = BotActivityAttributes(titulo: titulo, bot: bot)
      let state = BotActivityAttributes.ContentState(
        pct: 0, done: 0, total: max(total, 0), label: "começando")
      do {
        let activity = try Activity.request(
          attributes: attrs, content: .init(state: state, staleDate: nil), pushType: .token)
        let id = activity.id                                    // ← a chave de tudo
        Task { [weak self] in
          for await tokenData in activity.pushTokenUpdates {
            let hex = tokenData.map { String(format: "%02x", $0) }.joined()
            // agora o evento diz DE QUEM é o token
            self?.sendEvent("onToken", ["activityId": id, "token": hex])
          }
        }
        return id
      } catch { return nil }
    }

    // encerra UMA activity específica
    AsyncFunction("end") { (activityId: String, promise: Promise) in
      guard #available(iOS 16.2, *) else { promise.resolve(nil); return }
      Task {
        for activity in Activity<BotActivityAttributes>.activities where activity.id == activityId {
          await activity.end(nil, dismissalPolicy: .immediate)
        }
        promise.resolve(nil)
      }
    }

    // pânico: encerra todas (ex: usuário mandou parar tudo)
    AsyncFunction("endAll") { (promise: Promise) in
      guard #available(iOS 16.2, *) else { promise.resolve(nil); return }
      Task {
        for activity in Activity<BotActivityAttributes>.activities {
          await activity.end(nil, dismissalPolicy: .immediate)
        }
        promise.resolve(nil)
      }
    }
  }
}
```

**JS correspondente (`la.ts` do app de Bots):**

```ts
import { api } from '@/lib/api';
import { env } from '@/config/env';
import { aoReceberTokenLA, iniciarLiveActivity } from '../../modules/live-activity';

// registra UM listener global (não um por run) e roteia pelo activityId
const pendentes = new Map<string, string>();   // activityId → runId
let ouvindo = false;

function garantirListener() {
  if (ouvindo) return;
  ouvindo = true;
  aoReceberTokenLA(({ activityId, token }) => {
    const runId = pendentes.get(activityId);
    if (!runId) return;                       // token de activity que não é nossa
    // manda o bundle junto: o server usa como tópico do APNs (dev x preview)
    api.setLiveActivity(runId, token, env.bundleId).catch(() => {});
  });
}

/** Inicia a LA de uma run específica. Chame logo depois de criar a run. */
export async function iniciarLAparaRun(runId: string, titulo: string, bot: string) {
  try {
    garantirListener();
    const activityId = await iniciarLiveActivity(titulo, bot, 0);   // total 0 = "começando"
    if (activityId) pendentes.set(activityId, runId);
  } catch { /* sem LA — segue de boa */ }
}
```

> **Por que um listener global e um Map?** Porque o token pode **rotacionar** a qualquer
> momento (o iOS reemite). Com listener por-run + timeout você perde a rotação e mistura
> tokens. O Map por `activityId` é à prova de bala e escala pra N bots.

### 3.6 O widget (SwiftUI)

Pontos que importam:

```swift
// só tem métrica de verdade quando o total foi medido (> 0). Antes é "começando".
func metrificado(_ s: ContentState) -> Bool { s.total > 0 }

// barra ZERADA enquanto não metrificou (evita barra "meio cheia" falsa)
ProgressView(value: metrificado(context.state) ? pctFrac(context.state.pct) : 0)
```

**Dynamic Island com N bots:** o iOS mostra **um** em `compactLeading/compactTrailing` e os
outros em `minimal`. **Implemente o `minimal:` bem** — é o que aparece quando tem 2+ rodando.
Recomendo: no `minimal`, um **ícone/cor por bot** (não o logo genérico), senão viram 2
bolinhas idênticas e o usuário não sabe qual é qual.

```swift
} compactLeading: {
  iconeDoBot(context.attributes.bot, 18)     // ícone por bot
} compactTrailing: {
  if metrificado(context.state) { Text("\(context.state.pct)%").foregroundColor(marca) }
} minimal: {
  iconeDoBot(context.attributes.bot, 18)     // ← crucial com N bots
}
```

> No **lock screen** as LAs empilham normalmente (uma embaixo da outra), então lá tá tranquilo.

### 3.7 Backend — push APNs

`liveactivity.py` (copia quase inteiro; o essencial):

```python
_KEY_ID   = os.environ["APNS_KEY_ID"]
_TEAM_ID  = os.environ["APNS_TEAM_ID"]
_BUNDLE   = os.environ["APNS_BUNDLE_ID"]      # só FALLBACK (ver 3.8)
_KEY_FILE = os.environ["APNS_KEY_FILE"]       # caminho do .p8

_SANDBOX = "https://api.sandbox.push.apple.com"
_PROD    = "https://api.push.apple.com"

def _token():
    """JWT ES256 do APNs — renova a cada <60min (o APNs exige)."""
    import jwt   # pyjwt[crypto]
    return jwt.encode({"iss": _TEAM_ID, "iat": int(time.time())}, p8,
                      algorithm="ES256", headers={"kid": _KEY_ID})

def _enviar(push_token, payload, bundle=None):
    import httpx  # httpx[http2]  ← HTTP/2 é obrigatório no APNs
    topico = bundle_valido(bundle) or _BUNDLE
    headers = {
        "authorization": f"bearer {_token()}",
        "apns-topic": f"{topico}.push-type.liveactivity",   # ⚠️ o sufixo é obrigatório
        "apns-push-type": "liveactivity",
        "apns-priority": "10",
    }
    # tenta sandbox e prod (ver armadilha do BadDeviceToken)
    for host in [_melhor_host or _SANDBOX, _PROD]:
        with httpx.Client(http2=True, timeout=15) as c:
            r = c.post(f"{host}/3/device/{push_token}", headers=headers,
                       content=json.dumps(payload).encode())
        if r.status_code == 200:
            _melhor_host = host       # memoriza o que funcionou
            return True, "ok"
        if r.status_code == 400 and "BadDeviceToken" in r.text:
            continue                   # ambiente errado → tenta o outro
        return False, r.text
```

Payloads:
```python
def atualizar(push_token, pct, done, total, label="", bundle=None):
    return _enviar(push_token, {"aps": {
        "timestamp": int(time.time()),
        "event": "update",
        "content-state": {"pct": int(pct), "done": int(done),
                          "total": int(total), "label": label or ""},
        "relevance-score": 100,
        "stale-date": int(time.time()) + 3600,
    }}, bundle)

def encerrar(push_token, pct=100, done=0, total=0, label="concluído", bundle=None):
    return _enviar(push_token, {"aps": {
        "timestamp": int(time.time()),
        "event": "end",
        "content-state": {...},
        "dismissal-date": int(time.time()) + 4,   # some do lock screen ~4s depois
    }}, bundle)
```

> **`relevance-score`:** com N bots, é isso que decide **qual** LA o Dynamic Island mostra
> como principal. Se quiser priorizar (ex: o que está mais perto de acabar, ou o que o
> usuário abriu por último), module esse número por run em vez de fixar 100.

### 3.8 Bundle por build (dev × preview convivendo)

**O problema:** cada build tem seu bundle (`.dev`, `.preview`). O tópico do APNs **tem que
ser o do build que criou a LA**. Se o server usa um `APNS_BUNDLE_ID` fixo do `.env`, um dos
dois builds sempre quebra.

**A solução:** o app manda o **próprio bundle** junto com o token; o server usa como tópico.

```js
// app.config.js
const extra = { bundleId: current.bundleId /* app.quasenada.bots.dev | .preview */ };
```
```python
# backend
_PREFIXO_OK = "app.quasenada.bots"

def bundle_valido(b):
    b = (b or "").strip()
    return b if b.startswith(_PREFIXO_OK) else ""    # guard: só bundle nosso

# no endpoint que recebe o token:
run.la_bundle = liveactivity.bundle_valido(payload.get("bundle")) or None
# e passa run.la_bundle em TODOS os pushes (atualizar/encerrar)
```
`APNS_BUNDLE_ID` do `.env` vira só **fallback** (app antigo que não manda bundle).

---

## 4. PEÇA 2 — Notificações push (começou / terminou)

**Zero dependência** — Expo Push API com `urllib` da stdlib.

```python
_EXPO_URL = "https://exp.host/--/api/v2/push/send"

def enviar(titulo, corpo, data=None):
    tokens = _ler()          # devices.json
    if not tokens: return
    msgs = [{"to": t, "title": titulo, "body": corpo, "sound": "default",
             "data": data or {}} for t in tokens]
    req = urllib.request.Request(_EXPO_URL, data=json.dumps(msgs).encode(),
        headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r: r.read()
    except Exception:
        pass     # best-effort: notificação nunca derruba a run
```

**Barrinha em blocos** pro corpo da notificação (fallback quando não tem LA):
```python
def barra_progresso(done, total, larg=10):
    pct = max(0, min(100, round(done / total * 100)))
    cheio = round(pct / 100 * larg)
    return "▓" * cheio + "░" * (larg - cheio) + f" {pct}%"
```

**Textos por tipo de processo** — no Brechó é uma função que devolve os textos. **No app de
Bots, faça isso por bot** (é o ponto de escala):

```python
def _proc_info(params):
    bot = (params or {}).get("bot", "desconhecido")
    nomes = {
        "dm":       "DM automática",
        "autolike": "Autolikes",
        # novos bots entram aqui — 1 linha cada
    }
    nome = nomes.get(bot, bot)
    return {
        "titulo":     nome,                                    # vai pro LA/widget
        "inicio":     (nome, "Começando… te mostro o progresso."),
        "fim_ok":     (f"{nome} concluído", "Deu tudo certo."),
        "fim_erro":   ("Deu ruim", f"O {nome} parou com erro."),
        "fim_parado": ("Parado", f"O {nome} foi parado."),
    }
```

**Regra de ouro que aprendi:** com Live Activity ativa, **não mande notificação de progresso**
(a barra viva já é o indicador). Só mande `começou` e `terminou`. Senão vira spam:

```python
if run.la_token:
    # tem LA → só atualiza a barra viva, sem notificação
    await asyncio.to_thread(liveactivity.atualizar, run.la_token, pct, done, total, label, run.la_bundle)
    return
# sem LA → notificação de progresso com throttle (>=15% ou >=25s)
if pct - run._ult_push_pct < 15 and (agora - run._ult_push_t) < 25:
    return
```

> **⚠️ Com N bots isso importa dobrado:** 5 bots × notificação a cada 15% = 35 notificações.
> Throttle **por run** (é o que o código faz: `run._ult_push_pct` é atributo da run).

---

## 5. PEÇA 3 — Barra de progresso in-app + log ao vivo

**Backend:** WebSocket que manda o histórico e depois faz streaming.

```python
@app.websocket("/runs/{run_id}/logs")
async def ws_logs(ws: WebSocket, run_id: str, token: str = ""):
    if token != settings.API_TOKEN:
        await ws.close(code=4401); return
    r = mgr.get(run_id)
    if not r: await ws.close(code=4404); return
    await ws.accept()
    q = asyncio.Queue()
    for l in list(r.linhas):            # histórico primeiro
        await ws.send_text(l)
    if r.status in ("finalizado", "parado", "erro"):
        await ws.close(); return        # run acabada → só histórico
    r.subs.add(q)                       # e agora streaming
    try:
        while True:
            l = await q.get()
            if l is None: break          # None = sinal de fim
            await ws.send_text(l)
    finally:
        r.subs.discard(q)
```

**App:** reconecta ao voltar do background (⚠️ o iOS **mata** o WebSocket):

```tsx
const conectar = async () => {
  try { wsRef.current?.close(); } catch {}
  const ws = new WebSocket(await logsWsUrl(runId));
  wsRef.current = ws;
  // o server reenvia TODO o histórico ao conectar → zera pra não duplicar
  ws.onopen = () => { if (alive) setLinhas([]); };
  ws.onmessage = (e) => { /* parse + append */ };
};
conectar();
const sub = AppState.addEventListener('change', (st) => {
  if (st === 'active' && alive) conectar();     // ← sem isso o log "morre" ao voltar
});
return () => { alive = false; wsRef.current?.close(); sub.remove(); };
```

**Log colorido por marcador** (opcional, mas fica lindo):
```tsx
function corEvento(nivel: string, resto: string) {
  if (resto.startsWith('SUCESSO'))  return { cor: colors.ok, forte: true };
  if (resto.startsWith('FALHA'))    return { cor: colors.erro, forte: true };
  if (resto.startsWith('resumo:'))  return { cor: colors.texto, forte: true };
  // …
}
```

---

## 6. PEÇA 4 — Widget flutuante global

Arrastável, cola nas laterais, colapsa em bolha, expande no toque. **É aqui que a adaptação
pra N bots dá mais trabalho de design.**

### 6.1 Como funciona no Brechó

```tsx
const ativaRun = (r: RunInfo) => r.status === 'rodando' || r.status === 'iniciando';

// poll a cada 2s → pega A run ativa mais recente
useEffect(() => {
  let vivo = true;
  const tick = async () => {
    try {
      const runs = await api.listRuns();
      const r = runs.filter(ativaRun).sort((a, b) => b.started_at - a.started_at)[0] ?? null;
      if (vivo) setRun(r);
    } catch { /* offline */ }
  };
  tick();
  const id = setInterval(tick, 2000);
  return () => { vivo = false; clearInterval(id); };
}, []);
```

Dois modos com animação (`Animated` + `PanResponder` puros — **sem** reanimated/gesture-handler):
- **BARRA**: pílula embaixo com título + % + barra. Aparece assim quando começa.
- **BOLHA**: bolinha com logo girando + %. Recolhe quando o usuário toca/scrolla a tela
  (via `interacaoBus`), é arrastável, cola na lateral, tocar expande de volta.

**`interacaoBus`** — bus simples pro RootNavigator avisar "o usuário mexeu na tela":
```ts
type Fn = () => void;
const subs = new Set<Fn>();
export const interacaoBus = {
  emitir() { subs.forEach((f) => { try { f(); } catch {} }); },
  ouvir(f: Fn) { subs.add(f); return () => { subs.delete(f); }; },
};
// RootNavigator emite via onStartShouldSetResponderCapture (NÃO rouba o toque)
```

**Trava de segurança (bug real que aconteceu):** a animação de saída podia ser engolida
quando a tela re-renderiza muito (log ao vivo), deixando o widget preso na última %:
```tsx
useEffect(() => {
  if (ativo) return;
  const t = setTimeout(() => setMontado(false), 600);   // garante o desmonte
  return () => clearTimeout(t);
}, [ativo]);
```

### 6.2 Adaptação pra N bots

Troque "a run ativa" por "**as** runs ativas":

```tsx
const [runs, setRuns] = useState<RunInfo[]>([]);
const tick = async () => {
  const todas = await api.listRuns();
  const ativas = todas.filter(ativaRun).sort((a, b) => b.started_at - a.started_at);
  if (vivo) setRuns(ativas);
};
const ativo = runs.length > 0;
```

**Design que recomendo** (mais simples e escala pra 10 bots):

| Estado | Com 1 run | Com N runs |
|---|---|---|
| **BOLHA** | logo + `%` | logo + **badge com N** (ex: "3") |
| **BARRA** | pílula com 1 progresso | **lista** de pílulas finas, uma por bot (scroll se >3) |

```tsx
// BOLHA com contador
<View style={styles.bolha}>
  <LoadingDog size={28} />
  {runs.length > 1
    ? <View style={styles.badge}><Text style={styles.badgeTxt}>{runs.length}</Text></View>
    : <Text style={styles.bolhaPct}>{pct != null ? `${pct}%` : '···'}</Text>}
</View>

// BARRA com N linhas
<View style={styles.pill}>
  {runs.slice(0, 3).map((r) => (
    <Pressable key={r.id} onPress={() => onAbrir?.(r.id)} style={styles.linha}>
      <Text style={styles.titulo} numberOfLines={1}>{r.titulo}</Text>
      <View style={styles.trilho}><View style={[styles.preenchido, { width: `${pctDe(r)}%` }]} /></View>
    </Pressable>
  ))}
  {runs.length > 3 && <Text style={styles.mais}>+{runs.length - 3} rodando</Text>}
</View>
```

> ⚠️ **`key={r.id}`** em toda lista — com N runs o React vai reclamar de key duplicada se
> você usar índice ou algo não-único. (Já paguei esse mico.)

---

## 7. PEÇA 5 — OTA (expo-updates) — atualizar sem build

**O que é:** *Over-The-Air*. Mudou **JS** → vai pro celular pela internet, sem build/loja.
**Só o nativo** (splash, ícone, Live Activity, lib nova) ainda exige build.

### Setup (copia e cola)

```bash
npx expo install expo-updates
```

`app.config.js`:
```js
{
  version: '1.0.0',
  // ⚠️ FIXO — não use policy 'appVersion' (ver armadilhas)
  runtimeVersion: '1.0.0',
  updates: { url: 'https://u.expo.dev/<SEU_PROJECT_ID>' },
}
```

`eas.json` — **channel por perfil**:
```json
{
  "build": {
    "development": { "channel": "development", "environment": "development", "...": "..." },
    "preview":     { "channel": "preview",     "environment": "preview",     "...": "..." }
  }
}
```

### Uso no dia a dia
```bash
npx eas-cli update --branch preview --environment preview --message "o que mudou"
```
Cai no app em ~1min. **Aplica no próximo abrir** → o usuário fecha/abre **2x** (baixa numa,
aplica na outra). Se quiser aplicar já na 1ª abertura, dá pra usar `fallbackToCacheTimeout`,
mas aí toda abertura espera o download — não vale a pena.

### Token embutido (pro app abrir já conectado)
```bash
# ⚠️ forma que funciona (ver armadilhas):
npx eas-cli env:create preview --name EXPO_PUBLIC_API_TOKEN --value "<token>" --visibility sensitive
```
No app: `apiToken: process.env.EXPO_PUBLIC_API_TOKEN || ''` (inlinado no bundle em build time
**e** em `eas update` — por isso o update também precisa do `--environment`).

---

## 8. Backend — RunManager (o motor)

**Boa notícia: já é multi-run.** `self.runs` é um dict `{run_id: Run}`. O Brechó tinha um
guard 409 **global** — no app de Bots, faça **por bot**:

```python
@app.post("/runs")
async def start_run(payload: dict = None):
    payload = payload or {}
    bot = payload.get("bot")
    # 1 run POR BOT ao mesmo tempo (mas N bots diferentes podem rodar juntos)
    if any(r.status in ("rodando", "iniciando") and r.params.get("bot") == bot
           for r in mgr.runs.values()):
        raise HTTPException(409, f"O bot {bot} já está rodando — espera terminar.")
    run = await mgr.start(payload)
    return run.info()
```

**Estado por run** (tudo que a LA precisa é atributo da Run — já escala):
```python
class Run:
    def __init__(self, params):
        self.id = f"run-{next(_counter)}"
        self.params = params or {}
        self.status = "iniciando"        # iniciando|rodando|finalizado|parado|erro
        self.progress = None             # {done, total, label}
        self.linhas = deque(maxlen=MAX_LOG_LINES)
        self.subs = set()                # set[asyncio.Queue] — assinantes do WS
        self.proc = None
        self.la_token = None             # push token da LA daquela run
        self.la_bundle = None            # bundle do build (.dev/.preview)
        self._ult_la_pct = -100          # throttle POR RUN
        self._ult_la_t = 0.0
        self.titulo = _proc_info(self.params)["titulo"]
```

**Spawn + pump** (lê stdout linha a linha e faz broadcast):
```python
run.proc = await asyncio.create_subprocess_exec(
    *cmd, cwd=worker_dir,
    stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
    env={**os.environ, "PYTHONUTF8": "1", "PYTHONUNBUFFERED": "1"},   # ⚠️ unbuffered
)
run.status = "rodando"
asyncio.create_task(self._pump(run))       # não bloqueia o request
asyncio.create_task(self._push_inicio(run))
```

**Throttle da LA** (não espanque o APNs):
```python
if pct - run._ult_la_pct < 3 and (agora - run._ult_la_t) < 3:
    return          # só empurra a cada 3% ou 3s
```

**Fim da run** → encerra a LA + notifica:
```python
run.returncode = await run.proc.wait()
if run.status != "parado":
    run.status = "finalizado" if run.returncode == 0 else "erro"
if run.la_token:
    await asyncio.to_thread(liveactivity.encerrar, run.la_token, 100,
                            done, total, label, run.la_bundle)
await asyncio.to_thread(notify.enviar, titulo, corpo, {"runId": run.id})
for q in list(run.subs):
    q.put_nowait(None)      # sinaliza fim aos assinantes do WS
```

> **`status = "parado"`** só é setado pelo `stop()` (SIGTERM via `proc.terminate()`).
> `returncode == -15` = SIGTERM. Se ver `-15` sem ninguém ter mandado stop, procure quem
> matou o processo (no meu caso foi stop mesmo).

---

## 9. Checklist de implementação (ordem sugerida)

**Fase 1 — base (sem nativo, sem build)**
- [ ] Bot imprime `[progress] done total label` com `flush=True`
- [ ] `RunManager` com `_pump` + `_parse_progress` + WebSocket de log
- [ ] Guard 409 **por bot**
- [ ] `notify.py` (Expo Push) + `POST /devices` + textos **por bot** (`_proc_info`)
- [ ] Tela de Run com log ao vivo + reconexão no `AppState`

**Fase 2 — widget flutuante (JS puro)**
- [ ] `interacaoBus` + emitir no RootNavigator
- [ ] `BarraBotsGlobal` com poll de **N runs** (bolha com badge / barra com lista)
- [ ] Trava de segurança do desmonte (`setTimeout` 600ms)

**Fase 3 — OTA**
- [ ] `expo-updates` + `runtimeVersion` **fixo** + `updates.url`
- [ ] `channel` por perfil no `eas.json`
- [ ] `EXPO_PUBLIC_API_TOKEN` no ambiente EAS
- [ ] **1 build** → a partir daí JS é OTA

**Fase 4 — Live Activity (nativo, precisa de build)**
- [ ] `modules/live-activity` com `start()` devolvendo **activityId** + `onToken` com **activityId**
- [ ] `targets/botswidget` (widget) — `ScrapeActivityAttributes.swift` **idêntico** nos dois lugares
- [ ] `NSSupportsLiveActivities: true` + `appleTeamId` + plugin `@bacons/apple-targets`
- [ ] `la.ts` com **listener global + Map activityId→runId**
- [ ] `liveactivity.py` (JWT ES256 + httpx http2 + fallback sandbox/prod + bundle por run)
- [ ] `POST /runs/{id}/liveactivity` recebendo `{token, bundle}`
- [ ] Widget com `minimal:` **por bot** (ícone/cor distintos)

---

## 10. Armadilhas (todas custaram tempo real)

| # | Armadilha | Sintoma | Solução |
|---|---|---|---|
| 1 | **Token da LA por timeout** | LA fica em 0% pra sempre | Evento `onToken` (nunca `setTimeout`) |
| 2 | **N LAs, token sem dono** | bot A mostra progresso do B | `activityId` no `start()` **e** no evento |
| 3 | **BadDeviceToken** | push 400, LA não anda | Tentar **sandbox e prod** e memorizar |
| 4 | **Tópico do APNs errado** | push rejeitado silenciosamente | `<bundle>.push-type.liveactivity` + bundle **do build** |
| 5 | **`Attributes` divergente** | LA **não aparece**, zero erro | Arquivo **byte a byte igual** nos 2 lugares |
| 6 | **`content-state` ≠ struct** | push 200 mas nada muda | Campos idênticos ao Swift |
| 7 | **`images` sem `./`** | logo some do widget, sem erro | `qnlogo: './logo.png'` |
| 8 | **`flush=True` esquecido** | progresso chega tudo no fim | `flush=True` + `PYTHONUNBUFFERED=1` |
| 9 | **WS morto no background** | log congela ao voltar pro app | Reconectar no `AppState === 'active'` + zerar linhas |
| 10 | **`runtimeVersion: appVersion`** | OTA para de chegar ao bumpar versão | `runtimeVersion` **fixo** |
| 11 | **`eas update` sem build c/ updates** | update publica mas não chega | O build **tem** que ter `expo-updates` |
| 12 | **`env:create` com `--type`** | "visibility must be set" (mentira) | Só `--name --value --visibility` |
| 13 | **Animação de saída engolida** | widget preso na última % | `setTimeout` forçando o desmonte |
| 14 | **`key` duplicada** | warning "two children with same key" | `key={r.id}` sempre |
| 15 | **Notificação de progresso + LA** | spam (×N bots!) | Com LA, só início/fim. Throttle **por run** |

---

## 11. Dependências

**Backend:** `pyjwt[crypto]` (JWT ES256), `httpx[http2]` (APNs HTTP/2). Notificação Expo usa
só `urllib` da stdlib.

**App:** `expo-updates`, `@bacons/apple-targets`, `expo-modules-core`.
O widget flutuante usa **só `Animated` + `PanResponder`** do próprio RN — **não** precisa de
`reanimated` nem `gesture-handler`.

**Credenciais APNs:** `.p8` (Apple Developer → Keys → APNs), `APNS_KEY_ID`, `APNS_TEAM_ID`,
`APNS_BUNDLE_ID`, `APNS_KEY_FILE`. O `.p8` é **secreto** — `chmod 600`, nunca no git.

---

## 12. Referência rápida — os arquivos no Brechó

Se precisar ver funcionando: `projetos/quase-nada-brecho/`

```
backend/
├── liveactivity.py     ← APNs (JWT, tópico, fallback sandbox/prod, bundle por run)
├── notify.py           ← Expo Push + barra em blocos
├── run_manager.py      ← o motor: spawn, _pump, progresso, LA, notificações
└── app.py              ← POST /runs (guard 409), /runs/{id}/liveactivity, WS de logs
frontend/
├── app.config.js       ← runtimeVersion, updates, extra.bundleId, NSSupportsLiveActivities
├── eas.json            ← channel por perfil
├── modules/live-activity/       ← módulo nativo (index.ts + Swift)
├── targets/scrapewidget/        ← o widget (Swift + expo-target.config.js)
└── src/
    ├── lib/la.ts                ← inicia LA e manda token+bundle
    ├── ui/BarraScraperGlobal.tsx ← widget flutuante
    ├── ui/interacaoBus.ts       ← bus de "usuário mexeu na tela"
    └── screens/RunScreen.tsx    ← log ao vivo + reconexão + barra
```