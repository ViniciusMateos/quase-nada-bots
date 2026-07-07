# Quase Nada Bots

Hub das automações de Instagram da Quase Nada: um **app** (React Native) que comanda
os **bots** rodando num **backend** (FastAPI) — com log ao vivo, modos/chats, execução
paralela e notificações. (A parte de brechó virou um app próprio, o `quase-nada-brecho`.)

## Estrutura

| Pasta | O quê |
|---|---|
| `frontend/` | **App** React Native (Expo + TS) — o hub no iPhone. Builds EAS dev/preview. |
| `backend/` | **API** FastAPI — orquestra os bots como subprocessos, log via WebSocket, CRUD de modos/chats. |
| `workers/` | Os **bots** (`auto-like-instagram`, `dm-followers`) — cada um com repo próprio no GitHub. |

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

No app → **Configurações** → informe a URL do servidor + token.

Detalhes: `frontend/README.md` (app) e `backend/README.md` (API).

## Status

- ✅ Bots modularizados (modos/chats) · ✅ Backend MVP (runs, log ao vivo) · ✅ App MVP (hub, log ao vivo)
- ⏳ Dashboard do brechó, progresso + push, deploy na Oracle, proxy, cookies via link
