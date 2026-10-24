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
| `painel-sessao/` | **App no navegador** em `http://quase-nada-bots.localhost` (local, sempre no ar: liga com o PC e volta se cair) e o **helper de login do IG** (Chromium + Playwright). |
| `workers/` | Workers antigos do servidor (Playwright/API), cada um com repo próprio — legado. A pasta `story-brecho-emulador/` guarda só os modos do Story Repost do emulador. |

Os bots do emulador moram no repo **`quase-nada-bots-device`** (agente + supervisor) e cada um no
seu repo: `auto-follow-emulador`, `dm-followers-emulador`, `story-repost-emulador` e
`criar-conta-emulador`.

## Bots

- **Auto Follow** — segue os curtidores dos posts de um chat, em lote de contas.
- **DM Followers** — DM de boas-vindas pros novos seguidores (5 variações, desconto de 10%, ou as
  mensagens do próprio modo).
- **Story Repost** — peças disponíveis do brechó no story, pelo app. A conta do brechó roda numa
  instância do emulador só dela (liga só na hora) e pode rodar **junto** com as outras contas,
  cada uma com o seu modo; o modo "brechó com abertura" posta antes o vídeo "confiram as peças".
- **Raspagem do brechó** (`brecho-scraper`, disparada pelo app do Brechó) — uma conta auxiliar lê
  o perfil público da loja no emulador e atualiza as peças (novas, preço, vendidas). Nunca usa a
  conta da loja; `GET /emulador/raspagem/prontidao` diz se dá pra raspar agora e quem está apta.
- **Criar Conta** — cria uma conta nova do Instagram no app do emulador, preenchendo cada
  passo (usuário, senha, nascimento, e-mail) e lendo o código de confirmação do Gmail; a
  conta nasce logada no seletor multi-conta.

Os bots rodam em **lote na ordem em que as contas foram marcadas**, e cada um tem **modos** feitos
pro emulador (teto por conta e do lote, descanso depois de soft-block, pausa entre contas, limites
de DM por hora/dia etc.), editáveis no app.

O que ainda falta trazer do servidor: Aquecimento Humano (+ cronograma), Like + Repost e os extras
do Story (apagar peça vendida, modo drop novo).

## Contas

Tela **Contas**: adicionar (a senha fica só no aparelho), criar conta nova, grupos e o estado de
cada conta no emulador (sessão ok, bloqueada, não sincronizada, senha incorreta). A lista separa a
**Principal** (a conta do brechó, no emulador dela) das **Auxiliares**. **Verificar** já
sincroniza: loga no emulador as que faltam (toda conta sincroniza), traz pro app as que já estavam
lá e confere cada sessão. Login de várias contas vira **uma run só**.

Conta que cai em **verificação humana** ("confirma que és uma pessoa") é tirada do emulador sozinha
pra não travar as outras: vira "bloqueada", sai do rodízio, chega um push avisando e a sincronização
não reloga ela — só o **Reconectar**, depois que você resolver.

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
