# Quase Nada Bots

Hub das automações de Instagram da Quase Nada: um **app** (React Native) que comanda
os **bots** rodando num **backend** (FastAPI) — com log ao vivo, modos/chats, execução
paralela e notificações.

## Estrutura

| Pasta | O quê |
|---|---|
| `frontend/` | **App** React Native (Expo + TS) — o hub no iPhone. Builds EAS dev/preview. |
| `backend/` | **API** FastAPI — orquestra os bots como subprocessos, log via WebSocket, CRUD de modos/chats. |
| `workers/` | Os **bots** (`auto-follow-instagram`, `dm-followers`) — cada um com repo próprio no GitHub. |

O **backend + workers** rodam juntos na Oracle (uma unidade de deploy). O **app** é
buildado com EAS e fala com o backend pela API + WebSocket.

## Arquitetura

```
App RN (frontend)  ──API + WebSocket──►  Backend FastAPI  ──subprocess──►  Bots (workers)
  comanda, mostra                          orquestra, faz                    fazem o serviço
  log/dashboard                            stream do log                     (Playwright)
```

Uma fonte da verdade: os bots continuam sendo os scripts Python (modularizados);
o backend roda eles; o app é só a interface. Sem duplicar lógica.

## Rodar (dev)

```bash
# backend (no PC, acessível pelo celular)
cd backend && pip install -r requirements.txt
BOTS_API_TOKEN=algumtoken uvicorn app:app --host 0.0.0.0 --port 8010

# app
cd frontend && npm install && npm run start
```

O app **já vem conectado** — a URL do servidor e o token ficam **cravados no build**
(via `EXPO_PUBLIC_API_URL` / `EXPO_PUBLIC_API_TOKEN` no `eas.json` / `.env.local`). Não
existe tela de configurar servidor: o app abre e fala com a Oracle direto. Pra dev com
backend local, aponte o `EXPO_PUBLIC_API_URL` pro IP da sua máquina antes de buildar/rodar.

Detalhes: `frontend/README.md` (app) e `backend/README.md` (API).

## Status

**v1.0.0 — lançado.** Bots (`auto-follow` + `dm-followers`), backend FastAPI (runs,
execução paralela, log ao vivo via WebSocket), app iOS (hub, histórico, log ao vivo,
sessão universal do Instagram), **Live Activity** no lock screen / Dynamic Island,
push de progresso, deploy na Oracle e proxy residencial auto-curável.
