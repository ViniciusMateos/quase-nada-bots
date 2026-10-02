# Quase Nada Bots

Hub das automações de Instagram da Quase Nada: um **app** (React Native) que comanda
os **bots** rodando num **backend** (FastAPI) — com log ao vivo, modos/chats, execução
paralela e notificações.

## Estrutura

| Pasta | O quê |
|---|---|
| `frontend/` | **App** React Native (Expo + TS) — o hub no iPhone. Builds EAS dev/preview. |
| `backend/` | **API** FastAPI — orquestra os bots como subprocessos, log via WebSocket, CRUD de modos/chats. |
| `workers/` | Os **bots** (`auto-follow-instagram`, `dm-followers-instagram`, `human-warmup-instagram`, `like-repost-instagram`, `story-repost-instagram`) — cada um com repo próprio no GitHub. |

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

**Lançado.** Bots (`auto-follow`, `dm-followers`, `human-warmup`, `like-repost` — curte
+ reposta o drop de uma conta-alvo — e `story-repost` — reposta as **peças disponíveis
do brechó** no story das contas-vitrine, modos aleatório/drop novo, com vídeo de
abertura), **lote** de várias contas numa run só (like-repost e story-repost), backend
FastAPI (runs, execução paralela, log ao vivo via WebSocket, histórico persistente com
log em disco, **cronograma** que **roda o aquecimento humano sozinho** 2x/dia por conta
em horários sorteados — dá pra **pausar**; ao religar, segue do próximo horário),
app iOS (hub com os bots **reordenados segurando e arrastando** e as contas **separadas
por grupo**, **histórico com filtros** em bottom sheet, log ao vivo, **gerenciador de
contas do Instagram** com login autofill e **status de sessão** — uma ativa por vez,
**grupos de contas** (ex: Vitrine, Captação) pra rodar um bot só num grupo, **trava por
conta** (cadeado: fora de qualquer automático), **seletor de conta na tela de rodar**,
**lista das últimas runs por bot** (agrupada por dia), revalidação automática ao
conectar), **Live Activity** no lock screen / Dynamic Island, **push separado em
montes** por bot/cronograma/conexão, aviso de **OTA desatualizada** no Settings,
deploy na Oracle e proxy residencial auto-curável.
