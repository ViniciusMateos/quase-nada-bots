# Quase Nada Bots

Hub das automações de Instagram da Quase Nada: um **app** (React Native) que comanda os **bots** —
com log ao vivo, modos, lote de contas, histórico e notificações. Desde a **v2.0.0** os bots rodam
**no emulador** (o app real do Instagram num Android no PC), não mais no servidor.

## Arquitetura

```
App RN (frontend) ──API──► Backend FastAPI (Oracle) ──fila de jobs──► Agente do PC ──► MuMu (app do IG)
  comanda, mostra          runs, log, histórico,        /emulador/*       quase-nada-bots-device
  log e contas             push e Live Activity
```

O backend não roda mais bot nenhum: ele **enfileira um job** por run, o agente do PC
(`quase-nada-bots-device`, repo à parte) pega, executa tocando no app real e devolve o log, o
progresso e o saldo. O app mostra tudo igual a antes (Rodando agora, log ao vivo, histórico, LA).

## Estrutura

| Pasta | O quê |
|---|---|
| `frontend/` | **App** React Native (Expo + TS) — o hub no iPhone (e na web). OTA pelo canal `preview`. |
| `backend/` | **API** FastAPI — runs, fila de jobs do emulador, contas, histórico, push/LA. |
| `painel-sessao/` | **App no navegador** (ferramenta local, `iniciar.bat` → `http://127.0.0.1:8777`) e o **Criar Conta** automático do PC (Chromium + código do Gmail). |
| `workers/` | Workers antigos do servidor (Playwright/API), cada um com repo próprio — legado. A pasta `story-brecho-emulador/` guarda só os modos do Story Repost do emulador. |

Os bots do emulador moram no repo **`quase-nada-bots-device`** (agente + supervisor) e cada um no
seu repo: `auto-follow-emulador`, `dm-followers-emulador` e `story-repost-emulador`.

## Bots

- **Auto Follow** — segue os curtidores dos posts de um chat, em lote de contas.
- **DM Followers** — DM de boas-vindas pros novos seguidores (5 variações, desconto de 10%).
- **Story Repost** — peças disponíveis do brechó no story da loja, pelo app (numa instância do
  emulador só da conta do brechó, que liga só na hora).

O que ainda falta trazer do servidor: Aquecimento Humano (+ cronograma), Like + Repost e os extras
do Story (vídeo de abertura, apagar peça vendida, modo drop novo).

## Contas

Tela **Contas**: adicionar (a senha fica só no aparelho), criar conta nova, grupos, cadeado (fora
da sincronização) e o estado de cada conta no emulador (sessão ok, bloqueada, não sincronizada).
**Verificar** já sincroniza: loga no emulador as que faltam, traz pro app as que já estavam lá e
confere cada sessão. Login de várias contas vira **uma run só**.

## Rodar (dev)

```bash
# backend
cd backend && pip install -r requirements.txt
BOTS_API_TOKEN=algumtoken uvicorn app:app --host 0.0.0.0 --port 8010

# app
cd frontend && npm install && npm run start
```

O app **já vem conectado** — a URL do servidor e o token ficam cravados no build (via
`EXPO_PUBLIC_API_URL` / `EXPO_PUBLIC_API_TOKEN` no `eas.json` / `.env.local`). Atualização de JS vai
por OTA (`eas update --branch preview`; o número no rodapé das Configurações sobe a cada uma).

Detalhes: `frontend/README.md` (app), `backend/README.md` (API) e `painel-sessao/README.md`.
