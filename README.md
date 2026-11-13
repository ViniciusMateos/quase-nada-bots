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
| `painel-web/` | **Painel web** (Vite + React + Tailwind) — a versão desktop do app: menu lateral retrátil, tabelas e as mesmas funções (bots, execuções com log ao vivo, histórico, contas, cronograma). |
| `painel-sessao/` | **Servidor local** em `http://quase-nada-bots.localhost` (sempre no ar: liga com o PC e volta se cair): serve o painel web em `/`, o app RN exportado em `/app` e o **helper de login do IG** (Chromium + Playwright). |
| `workers/` | Workers antigos do servidor (Playwright/API), cada um com repo próprio — legado. A pasta `story-brecho-emulador/` guarda só os modos do Story Repost do emulador. |

Os bots do emulador moram no repo **`quase-nada-bots-device`** (agente + supervisor) e cada um no
seu repo: `auto-follow-emulador`, `dm-followers-emulador`, `story-repost-emulador`,
`criar-conta-emulador`, `like-repost-emulador`, `pre-drop-emulador`, `garimpo-posts-emulador` e
`like-fallback-emulador`.

## Bots

- **Auto Follow** — segue os curtidores dos posts de um chat, em lote de contas. No **modo funil**
  (campo `funil`, modo "funil 125") ele não usa o chat: cada conta segue quem ela mesma já tocou pelo
  Like Fallback — os privados que não pôde curtir e quem curtiu há 1+ dia e não seguiu o brechó.
- **DM Followers** — DM de boas-vindas pros novos seguidores (5 variações, desconto de 10%, ou as
  mensagens do próprio modo).
- **Story Repost** — peças disponíveis do brechó no story, pelo app. A conta do brechó roda numa
  instância do emulador só dela (liga só na hora) e pode rodar **junto** com as outras contas,
  cada uma com o seu modo. O modo **drop** posta só as disponíveis do último drop, na ordem do `#p`,
  com a arte "DROP ON!" antes; cada conta lembra o que já postou daquele drop e rodar de novo completa
  o que faltou. O vídeo de abertura saiu do bot (o IG do emulador estragava a capa) — ele é postado
  na mão.
- **Raspagem do brechó** (`brecho-scraper`, disparada pelo app do Brechó) — uma conta auxiliar lê
  o perfil público da loja no emulador e atualiza as peças (novas, preço, vendidas). Nunca usa a
  conta da loja; `GET /emulador/raspagem/prontidao` diz se dá pra raspar agora e quem está apta.
- **Criar Conta** — começa a conta nova no app do emulador **até o código**: usuário, senha,
  nascimento (roleta de data), e-mail e o código de confirmação lido do Gmail. Aí para e manda
  o push "sua vez": os termos e as boas-vindas são na mão (o IG desafia toda conta nova criada
  no automático). Enquanto isso o emulador fica reservado (até voltar pra tela principal do IG
  ou 15 min). No app só se preenche usuário + Gmail; senha e data vêm da última run.
- **Like + Repost** — curte e republica os posts do brechó com as contas do emulador. A lista sai
  do **perfil do brechó**, lido uma vez no começo da run. Modos: **drop** (do post mais novo até o
  primeiro pré-drop, ele incluso; se o mais novo já é um pré-drop, o drop não saiu e faz só ele) ou
  **recentes** (os N primeiros do perfil, de qualquer tipo). Confere cada post antes de agir, não
  desfaz o que já estava feito e cada conta lembra o que já fez. Conta sem o botão Republicar só curte.
- **Pré-drop** — reposta o pré-drop do dia nas contas auxiliares: o carrossel no feed (legenda com
  "no @brechoquasenadaa"), cada foto no story com o fundo laranja e o story "ativem as notificações"
  com a menção ao brechó. Cada conta lembra o que já fez; rodar de novo completa o que faltou.
- **Garimpo** — acha posts novos pro chat do Auto Follow sozinho e manda no grupo. Vai curtidor por
  curtidor dos posts da turma, olha a grade de cada perfil (o Gemini marca as fotos de roupa numa
  chamada só), abre as de roupa (foto, carrossel, reel ou vídeo) e só manda o post com curtidas
  suficientes e lista de curtidas com gente que a frota ainda não seguiu. Perfil bom entra num
  rodízio e volta pra mandar os posts seguintes. Conta com o direct bloqueado é pulada. Modo:
  posts por conta, curtidas mínimas e mínimo de gente nova na lista (seguidor mínimo desligado).
- **Like Fallback** — segunda chamada de atenção pra quem a conta seguiu há mais de 1 dia e ainda não
  segue o brechó: a **mesma** conta volta no perfil, curte os stories, curte as telas de um destaque e
  curte umas fotos. Antes confere, em lote, na lista de seguidores do brechó (reserva: a lista "a
  seguir" da pessoa); quem já segue conta como conversão e sai da fila, e quem não deu pra conferir
  não leva like. A fila prioriza quem foi seguido nos últimos dias, do mais recente pro mais antigo.
  Acabou a fila, ela não para (**funil**): colhe os curtidores dos próximos posts do chat (mesma
  fronteira do Auto Follow) e curte quem a frota nunca tocou; privado vai pro follow do modo funil.
  Privado que a conta seguiu é reconferido 1x por dia e, se aceitou, recebe o like. A conversão é
  medida pelos seguidores novos do brechó, lidos pela instância dele, e sai por caminho (só follow,
  follow → like, só like, like → follow) em `metricas.py`. Modo: perfis por conta, fotos por perfil,
  janela de dias, stories, destaque e a fonte do chat.
- **Remover Contas** — marca as contas logadas no emulador e o bot termina a sessão de cada uma
  (libera vaga no teto de ~10 contas por aparelho). A conta continua no Instagram e no app, só
  sai do emulador (o sincronizar não loga de volta).

Todo bot do emulador avisa por push quando **começa** e quando termina, com Live Activity. O
**parar** vale na hora em qualquer bot: um vigia ao lado do job consulta o backend a cada 1,5 s,
fecha o Instagram do emulador e derruba o job onde ele estiver.

Os bots rodam em **lote na ordem em que as contas foram marcadas**, e cada um tem **modos** feitos
pro emulador (teto por conta e do lote, descanso depois de soft-block, pausa entre contas, limites
de DM por hora/dia etc.), editáveis no app.

O que ainda falta trazer do servidor: Aquecimento Humano (+ cronograma) e apagar a peça vendida do
story.

No histórico, uma run em lote aparece como "N contas" (não como a primeira conta do lote).

## Contas

Tela **Contas**: adicionar (a senha fica só no aparelho), criar conta nova, grupos e o estado de
cada conta no emulador (sessão ok, bloqueada, não sincronizada, senha incorreta). A lista separa a
**Principal** (a conta do brechó, no emulador dela) das **Auxiliares**. **Verificar** já
sincroniza: num job só, loga no emulador as que faltam, traz pro app as que já estavam lá e confere
cada sessão, mostrando "verificando" em todas as contas cadastradas até chegar o resultado de cada
uma. Conta apagada no app não volta sozinha: a lixeira dispara o Remover Contas e o auto-registro
ignora ela até você adicionar de novo.

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

# painel web (dev em :5179; o build em painel-web/dist é o que o painel-sessao serve)
cd painel-web && npm install && npm run dev
npx vite build
```

O painel web lê a URL e o token do mesmo `frontend/.env.local` do app (nada de segredo duplicado).
Ele não tem OTA: atualiza quando roda o `vite build` de novo no PC (basta recarregar a janela).

O app **já vem conectado** — a URL do servidor e o token ficam cravados no build (via
`EXPO_PUBLIC_API_URL` / `EXPO_PUBLIC_API_TOKEN` no `eas.json` / `.env.local`). Atualização de JS vai
por OTA (`eas update --branch preview`; o número no rodapé das Configurações sobe a cada uma).

Detalhes: `frontend/README.md` (app), `backend/README.md` (API), `painel-sessao/README.md` e
`painel-web/CONVENCOES.md`.
