# Quase Nada Bots — App (frontend)

App React Native (Expo + TypeScript) que é o **hub dos bots** (auto-follow,
dm-followers). Conecta no backend FastAPI, dispara runs, mostra o **log ao vivo** e
controla modos/chats. Mesmo modelo dos apps Quase Nada Lembretes/Finanças.

## Stack
- Expo 52 · React Native 0.76 · TypeScript
- @react-navigation v7 · axios · expo-secure-store · expo-notifications
- Tema escuro, laranja da marca `#FF8234`

## Rodar (dev — Metro, edita JS sem rebuildar)
```bash
npm install
npm run start            # ou: npm run start:dev-client (com build de development)
```
Abra no app de **development** (build dev) ou no Expo Go. Em **Configurações** dentro
do app, informe a **URL do servidor** (o backend FastAPI) e o **token**.

> Dev: rode o backend no PC (`uvicorn app:app --host 0.0.0.0 --port 8010`) e use o IP
> da sua máquina na rede (ex: `http://192.168.0.10:8010`). O celular precisa estar na
> mesma rede Wi-Fi.

## Builds EAS

| Perfil | O quê | Comando |
|---|---|---|
| **development** | dev client (Metro, hot-reload do JS) | `npm run build:dev:ios` / `:android` |
| **preview** | o app de verdade, instalável | `npm run build:preview:ios` / `:android` |

URLs do backend por perfil ficam no `eas.json` (`EXPO_PUBLIC_API_URL`). A URL também
pode ser sobrescrita em Configurações dentro do app.

## Estrutura
```
App.tsx
src/
  config/env.ts        # apiBaseUrl do build
  theme.ts             # cores da marca
  lib/
    apiClient.ts       # axios (baseURL + token dinâmicos)
    api.ts             # chamadas + URL do WebSocket de log
    tokenStorage.ts    # secure-store (url + token)
  navigation/          # stack (Hub, Bot, Run, Settings)
  screens/             # HubScreen, BotScreen, RunScreen, SettingsScreen
  ui/components.tsx     # Botão, Card, Pill
```

## Telas (MVP)
- **Hub** — lista os bots + "Rodando agora".
- **Bot** — escolhe modo (e chat, no auto-follow) e dispara (rodar / dry-run).
- **Run** — **log ao vivo** (WebSocket) + botão parar.
- **Configurações** — URL do servidor + token.

Próximo: dashboard do brechó, barra de progresso, notificações push ao terminar.
