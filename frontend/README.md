# Quase Nada Bots — App (frontend)

App React Native (Expo + TypeScript) que é o **hub dos bots** (`auto-follow`,
`dm-followers`). Fala com o backend FastAPI, dispara runs, mostra o **log ao vivo**,
guarda o **histórico** e reflete o progresso numa **Live Activity** (lock screen /
Dynamic Island). Mesma linha dos apps Quase Nada Lembretes/Finanças.

## Stack
- Expo 54 · React Native 0.81 · TypeScript
- @react-navigation v7 · axios · expo-secure-store · expo-notifications
- Live Activity nativa (ActivityKit) via módulo próprio + widget (iOS)
- Tema escuro, gradiente da marca (roxo → rosa)

## Config — o app já vem conectado
Não há tela de "informar servidor". A **URL** e o **token** ficam **cravados no build**:

- `EXPO_PUBLIC_API_URL` — URL do backend (default de produção em `config/env.ts`:
  `https://quasenadaserver1.duckdns.org/bots`).
- `EXPO_PUBLIC_API_TOKEN` — token da API (`Authorization: Bearer …`).

Ficam no `eas.json` (por perfil) e/ou `.env.local` (nunca commitados). O `apiClient.ts`
lê direto do `env` — sem config manual, sem `tokenStorage`.

## Rodar (dev — Metro, edita JS sem rebuildar)
```bash
npm install
npm run start            # ou: npm run start:dev-client (com build de development)
```
Abra num **build de development** (a Live Activity e o módulo nativo só existem em build,
não no Expo Go). Pra apontar num backend local, defina `EXPO_PUBLIC_API_URL` com o IP da
sua máquina na rede (ex: `http://192.168.0.10:8010`) e rode o backend com
`uvicorn app:app --host 0.0.0.0 --port 8010`. Celular na mesma Wi-Fi.

## Builds EAS

| Perfil | O quê | Comando |
|---|---|---|
| **development** | dev client (Metro, hot-reload do JS) | `npm run build:dev:ios` / `:android` |
| **preview** | o app de verdade, instalável (Ad Hoc) | `npm run build:preview:ios` / `:android` |

> A maioria das mudanças de JS sai por **OTA** (`eas update --branch preview`), sem
> rebuildar. Só código nativo (widget, splash nativo, módulo) exige build novo.

## Estrutura
```
App.tsx
src/
  config/env.ts          # apiBaseUrl + apiToken + bundleId (cravados do build)
  theme.ts               # cores da marca
  lib/
    apiClient.ts         # axios (baseURL + token do env)
    api.ts               # chamadas REST + URL do WebSocket de log
    la.ts                # controla a Live Activity (cria, entrega token, encerra)
    push.ts              # registro de push + teste de progresso local
  navigation/            # stack (Hub, Bot, Chats, Run, Histórico, Settings, InstagramLogin)
  screens/               # telas (ver abaixo)
  ui/
    components.tsx       # Botão, Card, Pill, barra de progresso
    BarraBotsGlobal.tsx  # barra flutuante "rodando agora" (segue em todas as telas)
    LoadingDog.tsx       # loader do cachorro + anel
    Splash.tsx           # splash com transição (cachorro base64 + anel)
    DogRefresh.tsx       # pull-to-refresh com o cachorro
    TecladoView.tsx      # KeyboardAvoiding padrão
modules/live-activity/   # módulo nativo (ActivityKit) — cria a LA e stream do push token
targets/botswidget/      # widget da Live Activity (Swift) — renderiza o card/ilha
```

## Telas
- **Hub** — lista os bots + "Rodando agora" (com progresso ao vivo).
- **Bot** — escolhe modo (e chat, no auto-follow) e dispara (rodar / dry-run).
- **Chats** — escolhe o chat/thread do auto-follow.
- **Run** — **log ao vivo** (WebSocket) + botão parar.
- **Histórico** — runs passadas, tocáveis (abre a Run).
- **Instagram** — conecta a conta **uma vez** (sessão universal, vale pra todos os bots).
- **Configurações** — conectar Instagram, notificações, **testes da Live Activity**
  (simula 1–4 bots) e info do servidor (só leitura).
