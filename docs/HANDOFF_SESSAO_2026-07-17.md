# Handoff — Quase Nada Bots (sessão 16-17/jul/2026)

> Documento pra abrir uma sessão nova zerada. Cobre tudo que mexemos e **o problema aberto agora**.

---

## 0. TL;DR do problema ATUAL (o que estava rolando no momento do corte)

**Auto-follow: a varredura da thread do grupo carrega só as 20 mensagens iniciais e não puxa o histórico antigo.** O backlog fica em ~17 posts quando deveria ser 180+.

**CAUSA-RAIZ JÁ ISOLADA (com bisect A/B no server, reprodução limpa):**
Qualquer navegação Playwright ANTES de abrir a thread quebra o carregador de mensagens
antigas do IG. A thread precisa ser um **load fresco**, não uma transição SPA vinda de
outra rota (ex: home).

```
A: ig.ir(THREAD_URL) direto, é a 1ª navegação  → scrollHeight 10833 → 29917  CRESCEU ✓
C: ig.ir(home) e DEPOIS ig.ir(THREAD_URL)      → scrollHeight 10833 → 10833  TRAVOU ✗
```
Mesma sessão, minutos de diferença. A única variável é a navegação prévia.

**A CORREÇÃO JÁ ESTÁ ESCRITA E DEPLOYADA, faltou só o teste final** (que eu cancelei):
- `main.py` NÃO navega pra lugar nenhum antes de chamar `ler_mensagens_scroll` (removido o `ig.ir(home)` do preâmbulo).
- `ig.py` → `ler_mensagens_scroll`: a ordem virou **(1) pendura listener `page.on("response")` → (2) `ig.ir(THREAD_URL)` [1ª e única navegação] → (3) valida `logado()`/`salvar_sessao()`/`usuario()`/`carregar_tokens()` → (4) espera 12s → (5) scroll**.
- Isso resolve os DOIS sintomas que apareceram no meio: `sh` travado em 10833 (navegação dupla) E `msgs=0` (listener pendurado tarde demais, perdia a leva inicial).

**PRÓXIMO PASSO IMEDIATO (era o comando cancelado):** rodar 1 dry-run no server e confirmar que o `sh` cresce de 10833 → 20619+ e o backlog vira 100+ posts. Comando:
```bash
ssh -i ~/.ssh/private_oracle_quase_nada_server1.key ubuntu@147.15.7.119
cd ~/quase_nada_bots/workers/auto-follow-instagram
set -a; . ~/quase_nada_bots/.env; set +a
PYTHONUNBUFFERED=1 python main.py --dry-run 2>&1 | grep -E "scroll|varridas|backlog|Próximos"
```
Procurar no log: `[scroll N] ... sh=20619` (ou maior). Se `sh` continuar 10833, a correção não pegou — investigar se sobrou alguma navegação antes da thread.

---

## 1. Infra / acesso (pra não redescobrir)

- **Server 1 (bots):** `ubuntu@147.15.7.119`, chave `~/.ssh/private_oracle_quase_nada_server1.key`
- **Backend:** `/home/ubuntu/quase_nada_bots/` (underscore no server; `quase-nada-bots` local). Serviço systemd `quase-nada-bots.service`, porta 8010, `.env` em `/home/ubuntu/quase_nada_bots/.env`.
- **Deploy = scp** (não git). Padrão: editar local → `scp` pro server → testar. O git dos workers está DESSINCRONIZADO do server (server tem tudo, git não).
- **Proxy:** `socks5://127.0.0.1:1080` (residencial, fixo no `proxy.json` de cada worker). **Rotaciona IP a cada ~30min** — provável fator de estrangulamento (sessão migrando de IP parece sequestro pro IG). Vale um proxy sticky no futuro.
- **App URL (prod):** `https://quasenadaserver1.duckdns.org/bots`
- **Token da API:** `BOTS_API_TOKEN` no `.env` do server.

### Workers = repos git próprios (gitignored pelo pai)
- `workers/auto-follow-instagram/` → repo `ViniciusMateos/auto-follow-instagram`
- `workers/dm-followers-instagram/` → repo `ViniciusMateos/dm-followers-instagram`
- **NADA foi commitado nesta sessão** — nem workers nem o app pai. É a dívida mais urgente.

---

## 2. Contas de Instagram usadas

- **`@quasenadasegue1`** (ds_user_id `80430510553`) — conta ANTIGA, tem histórico grande (597 DMs, 9044 follows). Está estrangulada pelo IG (rate limit 1357005) de tanto teste hoje.
- **`@quasenadasegue2`** (ds_user_id `10358174032`) — conta NOVA, importada no fim da sessão. É a que está logada nos workers do server agora.
- Cookies são importados via `python main.py --import-cookies <arquivo>`. **A sessão NÃO persiste no browser_profile** (ver §4) — vive em `session_cookies.json`, reinjetada a cada run.

---

## 3. O bug do scroll — investigação completa (pra não refazer)

### Contexto
O auto-follow lê a thread de DM do grupo "vaitomanoquasenada" (`THREAD_ID=24092553240433373`),
acha os posts compartilhados, e segue os curtidores de cada um. **O critério de "já
processei" é a REAÇÃO (❤) no post** — não estado local. O bot sobe a thread até achar o
bloco contíguo de posts já reagidos; tudo acima disso é backlog.

### Por que scroll e não paginação GraphQL
A versão antiga pedia páginas do GraphQL na mão (`IGDMessageListOffMsysQuery`). Isso é um
padrão de **burst** que o IG estrangula: **erro `1357005`** ("Sua solicitação não pôde ser
processada", corpo de 329 bytes, HTTP 200) depois de ~5-7 páginas. A run morria.
O **brecho-tracker** (em `projetos/quase-nada-brecho/workers/brecho-tracker/iglib.py`,
método `raspar_perfil_scroll`) já resolveu isso pro feed de perfil: **rola como humano e
COLHE as respostas graphql que a própria página dispara** (`page.on("response")`), sem
pedir nada. Foi a pista certa do Vinicius. Portei pra thread como `ler_mensagens_scroll`.

### Descobertas técnicas do scroll (TODAS medidas, não chutadas)
1. **A lista de mensagens é `flex-direction: column-reverse`.** `scrollTop=0` é o FUNDO
   (msg mais nova) e vai NEGATIVO conforme sobe pro passado. Meu 1º `Math.max(0, ...)`
   travava tudo em zero. Correto: `scrollTop = scrollTop - 2500` (sem clamp).
2. **A thread demora ~10s pra montar.** Com wait de 4s a página é só esqueleto cinza e não
   há lista pra rolar. Usar `THREAD_MONTAGEM_MS = 12000` FIXO (não polling — polling voltava
   em 1s com a página meio-montada e o carregador não armava).
3. **O `mouse.wheel` do Playwright NÃO serve** — trava em elemento interno da mensagem
   (parou em -3109 sem chegar ao topo -10167). Usar `scrollTop` por JS.
4. **O IG só busca o passado quando você ENCOSTA no topo do carregado E CONTINUA
   EMPURRANDO.** Esperar parado no topo (mesmo 2 min) NÃO carrega. Empurrar `-2500` de
   2,5s em 2,5s carrega — o `scrollHeight` cresce ~4 scrolls DEPOIS de bater no limite.
5. **NÃO disparar `Event('scroll')` sintético** — fazia a lista parar de crescer.
6. **O regex do shortcode precisa de teto:** era `([A-Za-z0-9_-]{5,})` sem limite, casava
   tokens de 39 chars (lixo) → `code_to_pk` gerava pk inexistente → `get_likers` vazio →
   `Expecting value: line 1 column 1` (JSONDecodeError). Corrigido pra `{5,14}` + lookahead.
7. **`timestamp_ms` vem ora int ora string** — ordenar misturando levanta TypeError.
   Criado helper `_ts()` que coage pra int.
8. **Filtrar por `thread_fbid`** — o inbox e outras conversas também disparam graphql
   enquanto a página vive; sem filtro, node de outra thread virava post fantasma.
9. **E A CAUSA-RAIZ FINAL (§0):** navegação prévia quebra o carregador. Thread tem que ser
   a 1ª navegação, com o listener já pendurado.

### Onde ficou o código
- `workers/auto-follow-instagram/ig.py` → `ler_mensagens_scroll`, `_tem_lista`, `_ts`,
  `_no_bloco_reagido`, `_rate_limited`. Tudo comentado com as armadilhas acima.
- `workers/auto-follow-instagram/config.py` → `SCROLL_MAX=60`, `SCROLL_ESTAVEL_MAX=12`,
  `SCROLL_PAUSA_MS=(2000,3000)`, `THREAD_MONTAGEM_MS=12000`, `SCROLL_BLOCO_MIN=6`.
- `main.py` → chama `ler_mensagens_scroll()` no lugar do `ler_mensagens(parar_na_reacao=True)`.

### Ainda a validar depois que o scroll carregar
- **Critério de parada = reação.** `_no_bloco_reagido` para quando os N posts mais antigos
  capturados estão todos reagidos. Confirmar que para no lugar certo (@calebejpg era a
  fronteira real na conta antiga; o "próximo" era @1kamui `DatKX40ESl-`).
- **`estavel` só conta quando top E sh estão parados** (não só o top). Já corrigido, revalidar.
- O `ler_mensagens` (paginação na mão) virou legado — quando o scroll fechar, apagar.

---

## 4. O outro bug grande resolvido: cookie não persiste

**O Chromium DESTE server não grava cookie em disco NENHUM** (testado mecanicamente: cookie
fake, fecha, reabre → some; nem os que o próprio site seta sobrevivem). O `browser_profile`
guarda cache/localStorage, mas o `Default/Cookies` (SQLite) fica com 0 linhas.
- **Sintoma:** import dizia "Sessão logada!" mas o dry-run seguinte dizia "Sem sessão".
- **Correção:** a sessão vive em `session_cookies.json` (chmod 600, no dir do worker) e é
  **reinjetada a cada `abrir()`** via `_restaurar_sessao()`. Gravada por `salvar_sessao()`
  no import E a cada run. Isso é mais robusto que o profile (sobrevive a apagar o profile).
- Métodos em `ig.py`: `salvar_sessao()`, `_restaurar_sessao()`, `usuario()`.

---

## 5. Outras correções nos workers (todas testadas, no server via scp)

- **`--import-cookies` saía 0 mesmo falhando** → agora `sys.exit(1)` quando a sessão não
  valida (o app decide "conectado" vs "deu ruim" pelo exit code). Vale pros DOIS workers.
- **Rename `auto-like` → `auto-follow`** em tudo (bot_id, pastas, backend, front, docs,
  worker, histórico do server migrado). E `dm-followers` → pasta `dm-followers-instagram`.
- **Resiliência de rede:** `Failed to fetch` (blip do proxy) na LEITURA agora tem retry
  (helper `_gql`, 3-5x com backoff). O `seguir()` PULA em vez de repetir (não arrisca
  seguir 2x). Reação idem. **NÃO recarregar tokens no retry** — `carregar_tokens()`
  sobrescreve `self.tokens` e se a releitura vier sem csrf, perde os bons (foi bug: "meia
  hora sem acontecer nada"). `carregar_tokens` agora preserva o que já funciona.
- **Rate limit 1357005** reconhecido explicitamente (`_rate_limited`) com backoff de 20-45s
  e log "o IG pediu calma" (era o "resposta estranha" que escondia a causa).
- **Fronteira por bloco contíguo, não `max()`:** uma reação solta de OUTRA pessoa lá na
  frente fazia a fronteira saltar e pular 165 posts. Agora acha o FIM do bloco contíguo de
  reagidos. (Isso era na paginação antiga; reconfirmar na versão scroll.)
- **Progresso por curtidor (opção C):** `[progress] 12 32 post 3/187 · @1kamui`. A barra
  mede os curtidores do post e o rótulo carrega o todo. Emitido no TOPO do loop (tem vários
  `continue`), fecha em 100% ao fim do post.
- **`@user` da conta em toda run:** `Conta: @quasenadasegue1 (80430510553)` — via
  `/data/shared_data/` (viewer). Nos dois workers.

---

## 6. DM followers — estado por conta

**Bug:** ao trocar de conta, o bot herdava o histórico da anterior (`state.json` único) e
achava que já falou com todo mundo (conta nova mandou só 2 DMs em vez de 100).
**Correção:** estado POR CONTA. `config.conta_da_sessao()` lê o `ds_user_id` do
`session_cookies.json`; `config.state_file(conta)` → `state-<id>.json`. Sem conta
identificada, NÃO cai no `state.json` legado (vai pra `state-desconhecida.json`) — herdar
histórico alheio é justo o bug. Conta nova SEM histórico → `start_oldest=True` (varre tudo,
em vez de travar no `COMECAR_DE="n.mondra"` do config, que era marco da conta antiga).
- O `state.json` antigo (conta `80430510553`) foi renomeado pra `state-80430510553.json`
  no server E local, pra não perder os 597 DMs.
- **Auto-follow NÃO usa estado por conta** — o critério é a REAÇÃO no grupo, que é
  compartilhada entre contas. Vinicius confirmou. Foi revertido lá.
- **DM tem janela de horário 9h-23h** (`--ignore-window` pula). `MAX_DMS_POR_RUN=0` = sem
  cap = manda pra TODOS de uma vez. **Cuidado: conta nova + 100 DMs de uma vez = bloqueio.**
  Sugerido cap baixo (20-30) na 1ª leva — não implementado.

---

## 7. O APP (frontend RN + backend) — o que foi feito nesta sessão

Tudo isto está PRONTO e no Metro (Expo Go), faltando build:

- **Splash com fade:** mantém o `splash.png` atual, overlay JS desenha o mesmo PNG + anel
  girando do LoadingDog, fade pro app. `src/ui/Splash.tsx` (`SplashGate`). Testável no Expo Go.
- **Widget flutuante global:** `src/ui/BarraBotsGlobal.tsx` + `interacaoBus.ts` — pílula
  embaixo que recolhe em bolha arrastável ao tocar/scrollar. Adaptado pra N bots (bolha com
  contador, barra vira lista). Wired no RootNavigator.
- **Transição ao trocar de run no log:** limpa log+barra e mostra o LoadingDog até o log do
  bot novo chegar (`setLinhas([])`+`setConectando(true)` na troca de runId). `RunScreen.tsx`.
- **Reconexão do WebSocket no AppState** (bug: o log "morria" ao voltar do background). Com
  `ws.onopen` zerando linhas (senão duplica). `RunScreen.tsx`.
- **`.gitignore`:** adicionado `*.p8 *.key *.pem frontend/ios/ frontend/android/` (a APNs
  key não pode vazar; o prebuild geraria centenas de arquivos).
- **Pull-to-refresh no Histórico** + `topOffset` no DogRefresh.
- **Barra de progresso por curtidor** consumida do `[progress]` novo.

### Live Activity — IMPLEMENTADA, esperando build
Redesenhada pra **UMA LA por app** (não uma por run) — decisão do Vinicius depois de ver
mockups. Com 1 bot mostra o bot; com N, "3 bots rodando · 62%" e lista os bots com barra
por bot. Logo BRANCO da marca (não o ícone) no lock screen; bolinha com anel no Dynamic
Island. `ContentState` tem `titulo/pct/medido/label/quantos/bot/linhas[]` (LinhaBot tem
`id` da run pra ForEach não duplicar). Arquivos: `frontend/modules/live-activity/`,
`frontend/targets/botswidget/`, `backend/liveactivity.py`, `run_manager.py`, `la.ts`.

**⚠️ 2 BUGS que a revisão adversarial pegou, PRECISAM ser corrigidos ANTES do build:**
1. **Janela de 4s:** quando a LA encerra (push `end`, dismissal +4s), `laAtual()` ainda
   devolve o id dela, e `garantirLA` acha que já existe e não cria outra → run roda sem
   barra. Fix: expor `activityState` no nativo e só considerar `.active`.
2. **Run fantasma:** se `create_subprocess_exec` falha, a run fica "iniciando" pra sempre
   (nenhum `_pump` a move) → trava o guard 409 e a LA nunca encerra. Fix: try/except no
   `start()` do RunManager, marca "erro" e remove.

### App precisa de 1 build (EAS)
- Projeto EAS: `@visoma/quase-nada-bots`, projectId `1c474754-09c7-4aff-8fea-10902a77b9a8`.
- OTA configurado (`runtimeVersion: '1.0.0'` FIXO, channels, `EXPO_PUBLIC_API_TOKEN` nos
  ambientes). Depois do build, JS vai por `eas update --branch preview`.
- `.p8` do APNs: reaproveitado do Brechó (mesma APNs key vale pro time Apple todo), só o
  bundle muda. Já no server, `configurado()=True`, JWT assinando.
- Comando: `cd frontend && eas build -p ios --profile preview` (pede login Apple, interativo).

---

## 8. Metro / Expo Go (como estava rodando)

- Metro na porta 8082, mantido vivo com `tail -f /dev/null | EXPO_PACKAGER_PROXY_URL=<url> npx expo start --port 8082` (NUNCA `CI=1` — mata o file watcher).
- Túnel cloudflared: `exp://spots-gates-minimal-jewellery.trycloudflare.com`.
- Se cair: `cloudflared tunnel --url http://localhost:8082` → pega a URL → religa o Metro
  com `EXPO_PACKAGER_PROXY_URL=<url nova>`.

---

## 9. Preferências do Vinicius reforçadas nesta sessão (já na memória)

- **NUNCA emoji** — ícones (Ionicons) no lugar; em texto de notificação, só remover.
- **Teclado nunca cobrindo inputs** — sempre `TecladoView`/KeyboardAvoidingView em tela com TextInput.
- **Commits só via `/commit`**, e sem co-author Claude.
- Tom descontraído, PT-BR, direto.

### Lição minha desta sessão (pra eu não repetir)
Editei arquivo com `str.replace` e segui em frente SEM verificar que aplicou — 4 vezes.
Uma delas deployei código velho e "testei" achando que era o novo. **Sempre verificar o
resultado do replace (parsear/grep) antes de deployar e testar.** E: contra um alvo vivo
(IG), parar depois de 3 falhas e fazer bisect A/B controlado em vez de tentativa-e-erro —
foi o bisect que achou a causa-raiz em 2 runs, depois de eu queimar ~25 runs no chute.
