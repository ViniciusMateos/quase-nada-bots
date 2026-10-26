# Changelog

Todas as mudanças relevantes do Quase Nada Bots ficam registradas aqui.
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/).

## [2.3.0] — 2026-10-25

### Adicionado
- feat: no log da run, o bloco de cada conta fecha pelo rodapé também ("fechar @conta", sem rolar até o cabeçalho)
- feat: a senha do Criar Conta é digitada no app e fica salva SÓ no aparelho (SecureStore/localStorage), pré-preenchendo a próxima run — sem hardcode (o repo é público)

## [2.2.0] — 2026-10-24

### Adicionado
- feat: Criar Conta no emulador — cria a conta nova direto no app do Instagram (usuário → senha → nascimento → e-mail → código do Gmail → Concordo) e ela nasce logada
- feat: log da run com um card por conta que abre e fecha (cabeçalho com @conta, posição no lote, "agora" e alerta de erro; botão de abrir/fechar tudo)
- feat: conectar e verificar contas aparecem com nome e ícone próprios ("Conectar contas"/"Verificar sessões", não mais "Auto Follow") no app, nas notificações, no widget e no histórico

### Documentação
- docs: README com a Criar Conta no emulador (saiu do painel/Chromium)

## [2.1.0] — 2026-10-22

O brechó e as outras contas rodam juntos no emulador (cada um no seu), a raspagem do brechó saiu
do servidor e o app web ganhou endereço fixo, sempre no ar.

### Adicionado
- feat: modos dos bots do emulador reformulados (auto follow, DM e story), com os campos novos na tela de editar modo
- feat: modos padrão do emulador semeiam o perfis.json dos bots
- feat: Story Repost do brechó e das segue ao mesmo tempo, cada um no seu emulador; lote na ordem em que as contas foram marcadas
- feat: conta do brechó vira a Principal (Principal/Auxiliares) e sincroniza no emulador dela; o cadeado saiu e as sessões ficam salvas no backend (deslogada, senha incorreta)
- feat: raspagem do brechó no emulador (bot brecho-scraper) com o painel de prontidão (`GET /emulador/raspagem/prontidao`)
- feat: app web em http://quase-nada-bots.localhost, sempre no ar (liga com o PC e volta se cair)

### Documentação
- docs: README com o paralelo brechó/segue, raspagem e app web

## [2.0.0] — 2026-10-20

Os bots saíram do servidor: agora rodam **no emulador** (o app real do Instagram num Android no PC),
pelo agente do `quase-nada-bots-device`. O backend virou uma fila de jobs e o app ficou só do emulador.

### Adicionado
- feat: backend roda os bots no emulador (fila de jobs pro agente do PC) — login com a senha do app, várias contas numa run só, verificação de sessões, código do IG pelo app
- feat: app só do emulador — tela inicial com Rodando agora, contas e bots; a tela do servidor (Hub) saiu
- feat: Contas com o estado de cada conta no emulador; "Verificar" já sincroniza (loga as que faltam, traz pro app as que estavam lá); conta adicionada loga sozinha
- feat: Story Repost no emulador, numa instância só da conta do brechó (liga só na hora)
- feat: log sem info técnica, com a conta rodando em destaque e o saldo resumido; histórico com o nome certo de login/verificar
- feat: criar conta nova pelo app — automático no PC (Chromium + código do Gmail + bio/foto) e WebView no iPhone

### Modificado
- update: cadeado agora deixa a conta fora da sincronização (e do cronograma)
- update: skeleton no formato da tela no lugar do loader de tela cheia (Chats, Cronograma)

### Corrigido
- fix: botão voltar em JS (o nativo trava no iOS 26)

### Documentação
- docs: README da v2.0.0 (bots no emulador)

## [1.9.0] — 2026-10-13

### Adicionado
- feat: **app no navegador** — uma cópia do app dos bots roda no PC (mesmo código, via `react-native-web`), servida pela ferramenta local **`painel-sessao`** (`iniciar.bat` → `http://127.0.0.1:8777`): Hub, contas por grupo, rodar bots, logs e histórico, tudo com dados ao vivo. Live Activity e push ficam de fora (são nativos de iPhone)
- feat: **reconexão da sessão do Instagram pelo navegador** — o painel abre um **Chromium de verdade** (Playwright) no login; você loga na mão e ele captura a sessão (o `sessionid` é httpOnly, nenhuma página comum lê) e manda pro backend, sem precisar do celular. Perfil persistente por conta + máscara de automação pra reduzir captcha; o login só pré-preenche user+senha (não clica em nada)
- feat: **seletor de conta (tela de rodar) com as contas separadas por grupo** (Vitrine, Captação + Avulsas), igual o card de Contas do Hub

## [1.8.0] — 2026-10-02

### Adicionado
- feat: **bot Story Repost** (worker novo [`story-repost-instagram`](https://github.com/ViniciusMateos/story-repost-instagram)) — reposta as **peças disponíveis do brechó** no story das contas-vitrine, num card de post com fundo laranja, etiqueta de preço e chamada "comente fila"; modos **aleatório** (abre com o vídeo "confiram as peças disponíveis") e **drop novo**; 10 stories por run, sem repetir peça até a conta postar todas. No editor de modo, campos novos (o que postar, vídeo de abertura, estilo, etiqueta de preço) e um tipo de campo "opção" (chips)
- feat: **grupos de contas** (ex: Vitrine, Captação) — criados e editados na tela de Contas (tocar escolhe as contas, segurar renomeia/apaga); na tela do bot, o **lote** (agora também no Story Repost) tem chips de grupo que marcam só as contas dele
- feat: **trava por conta** (cadeado) — conta travada fica fora de qualquer automático (hoje, o aquecimento do cronograma); rodar na mão continua normal
- feat: **Hub** com as contas **separadas por grupo** (+ avulsas) e os bots **reordenados segurando e arrastando** (saíram as setas)

### Modificado
- update: **cronograma** vira "**Rodar automaticamente**" — dá pra **pausar**; ao religar, o que passou da hora é pulado e ele segue do próximo horário. Saiu o push de lembrete: horário que não deu pra rodar é só pulado (o único aviso que sobra é o de reconectar)

### Corrigido
- fix: **login do Instagram** — o autopreenchimento preenchia qualquer campo de texto (até o de trocar e-mail) e reescrevia por ~9s; agora só preenche na tela de login, uma vez, e para assim que você mexe num campo

## [1.7.4] — 2026-10-01

### Corrigido
- fix: **histórico não mistura mais runs** — o id da run reiniciava em 1 a cada restart do backend, então ids se repetiam e o log (aberto em append) juntava várias runs no mesmo arquivo; ao abrir o histórico de uma conta dentro de um bot apareciam runs grudadas. Agora o contador começa acima do maior id já existente e cada run abre o log limpo

## [1.7.3] — 2026-09-23

### Adicionado
- feat: **adicionar conta sem precisar conectar** — ao adicionar uma conta no app, ela já entra na lista e no **cronograma** como **pendente** (só o @; a senha continua só no aparelho, nunca vai pro server); nos horários de aquecimento o cronograma manda **"conecta pra rodar"** em vez de rodar. Quando você conecta de verdade, a pendente **funde** na conta real (mesmo @, idade preservada, sem duplicar). Contas que você já tinha adicionado mas ainda não conectou viram pendentes sozinhas ao abrir a tela de Contas

## [1.7.2] — 2026-09-22

### Modificado
- update: **verificar contas ficou mais rápido** — o check de sessão bate no IG por conta pelo túnel (~5s pra 10 contas) e o app refazia isso a cada abrir/trocar de tela; agora **cacheia ~60s**, então reabrir/navegar é **instantâneo**. Pull-to-refresh, reconectar conta e o lote passam `force` pra refazer o check na hora

### Corrigido
- fix: **cronograma não dá mais falso "reconecta"** — a validação da sessão agora tenta até 3x antes de considerar caída; um tranco isolado no túnel residencial não vira mais falso "sem sessão" (sessão morta de verdade continua falhando nas 3)

## [1.7.1] — 2026-09-18

### Modificado
- chore: liga o entitlement **`NSSupportsLiveActivitiesFrequentUpdates`** (exigiu build) — aumenta o budget que o iOS dá pra acordar o app e entregar o token de update, deixando a **Live Activity do cronograma com o app fechado mais consistente**. Não resolve 100% (com o app fechado há muito tempo o iOS simplesmente não acorda — limite da plataforma), mas melhora a taxa de acerto

## [1.7.0] — 2026-09-18

### Adicionado
- feat: **menu de segurar no modo** — segura o pill do modo e abre um menu (mesmo esqueleto do brechó) com **editar / duplicar / excluir**; **duplicar** copia o config inteiro e abre a cópia pra ajustar (baixar o cap de follow etc.). Tem também um link "Duplicar" na linha, junto de Editar/Novo modo
- feat: **cronograma sincroniza as contas em tempo real** — conta criada no meio do dia **entra sozinha** no plano do dia (reconcilia a cada 60s) e conta **deletada sai sozinha**; antes o plano ficava congelado do dia e só pegava conta nova no dia seguinte

### Modificado
- update: **cronograma auto-run não manda mais notificação** — quando roda sozinho mostra só a **Live Activity** e grava uma linha no log da run; antes vinham dois avisos ("começou" + "rodando sozinho"). O push de **"reconecta"** (sessão caída) continua

### Corrigido
- fix: **Live Activity anda com o app fechado** — o módulo nativo posta o token de update **direto no server**, então a barra continua andando mesmo com o app fechado (o iOS acorda o app em background só pra entregar o token e o JS pode nem bootar)
- fix: cronograma **pula conta deletada** sem encher de "reconecta" — checa se a conta ainda existe antes de rodar

## [1.6.2] — 2026-09-17

### Modificado
- update: o **cronograma fecha o aquecimento até 17h** (janela 10h–13h30 + 13h30–17h, antes ia até 22h) — a noite fica livre pro auto-follow/DM manual sem o cronograma disparar por cima; o guard já serializa os aquecimentos (nunca 2 juntos)

## [1.6.1] — 2026-09-16

### Corrigido
- fix: a **Live Activity automática** (push-to-start) não congela mais com o app fechado — como o iOS só entrega o token de update pro app rodando, a barra agora **expira sozinha** (staleDate curto) em vez de ficar travada até a run acabar
- fix: o push **"Cronograma · rodando sozinho"** passa a ser enviado **sempre** (aviso confiável, separado do banner da LA) — antes sumia quando a LA subia e você ficava sem aviso

## [1.6.0] — 2026-09-10

### Adicionado
- feat: **cronograma roda o Aquecimento Humano sozinho** no horário (auto-run) — valida a sessão pelo proxy antes, **adia** se já tem bot rodando (1 IP = um por vez) e, se a sessão caiu, manda push pra **reconectar** em vez de rodar à toa
- feat: **Live Activity automática** (push-to-start, iOS 17.2+) — a barra do lock screen **liga sozinha** quando o cronograma roda, com o app fechado (o app registra o pushToStartToken no boot e o server dispara o push de start)

### Corrigido
- fix: no **lote**, conta sem sessão viva fica **travada** (cadeado) e não pode ser marcada; só as vivas vêm pré-selecionadas
- fix: `playwright` adicionado no `requirements.txt` (os workers rodam no mesmo venv do backend)

### Modificado
- chore: o app passou a apontar pro **server 2** (`quasenadaserver2.duckdns.org/bots`) — o backend dos bots migrou de servidor

### Manutenção
- chore: removidos os bots de exemplo (`auto-2` a `auto-6`)

### Documentação
- docs: README do backend menciona os 4 bots e o cronograma auto-run

## [1.5.0] — 2026-09-04

### Adicionado
- feat: **lista das últimas runs por bot** — ao entrar num bot, mostra as 10 últimas runs dele agrupadas por dia (Hoje / Ontem / N dias atrás), com a conta e a hora; ignora run-fantasma (a que nem chegou a subir)
- feat: **transição suave no "Atualizar agora"** — um overlay "Atualizando…" com o cachorro em fade antes do reload, no lugar do flash seco

### Modificado
- update: **splash escura no reload** — a splash nativa passa a casar com o overlay (#0F0F0F + cachorro), então aplicar um OTA fica escuro→escuro, sem o flash do degradê (config nativa, vale no build)

### Manutenção
- chore: bots de exemplo (auto-2 a auto-6) pra testar a UI com vários bots

## [1.4.0] — 2026-08-18

### Adicionado
- feat: **notificações separadas em montes** — cada push carrega um `threadId` (iOS), então os avisos ficam agrupados por **bot**, por **cronograma** e por **conexão de conta**, em vez de tudo embolado no lock screen
- feat: **seletor de conta na tela de rodar** — o botão vira "Rodar com @conta" (mostra a ativa) e um botão "trocar" abre o popup com todas as contas e o status de sessão; sem sessão viva, cai direto no reconectar
- feat: **tela "Verificando conta"** ao tocar o lembrete do cronograma — mostra o cachorro + "verificando @conta" e avisa se está disponível (abre o bot) ou se a sessão caiu (leva pro reconectar), em vez da tela parada
- feat: **status de sessão na tela de Contas** (igual o Hub) e botão **"Adicionar conta" no topo**
- feat: **aviso de OTA desatualizada** no Settings — checa se há versão nova e mostra "desatualizado" + botão "Atualizar agora"

### Modificado
- update: **cronograma só aquecimento humano** — 2x por dia em cada conta (uma de manhã, uma de tarde/noite), horários sorteados e separados; sai a lógica de tier/drop/descanso e os bots de dinheiro; escala pra qualquer número de contas
- update: **cores do Hub** — verde só na conta ativa/em uso; "sessão ok" e "ativar" ficam neutros
- update: **logo do Live Activity maior** — a logo passa a preencher o anel (igual o brechó); a imagem tinha 44% de margem transparente
- refactor: **remove o estágio (tier) das contas** — some do backend, da API e das telas

### Corrigido
- fix: **locks órfãos do Chromium** — remove `SingletonLock/Cookie/Socket` de um Chromium morto antes de subir o próximo run no mesmo profile (destravava o auto-follow depois de uma run morta)

## [1.3.1] — 2026-08-06

### Adicionado
- feat: **cabeçalhos de data no histórico** — as runs ficam agrupadas por **Hoje / Ontem / N dias atrás** (até 6) e depois por **Semana 2, 3…**; vale com qualquer filtro ativo

## [1.3.0] — 2026-08-05

### Adicionado
- feat: **bot like-repost** — curte e reposta os posts de uma conta-alvo (ex: o drop do brechó) a partir das contas auxiliares, pelas **mutations GraphQL do próprio IG web** (registra de verdade); alvo configurável por modo e fluxo resumável (marco por conta e alvo)
- feat: **modo lote** — roda o like-repost em **várias contas numa run só**, uma de cada vez, mostrando qual conta está e o progresso por post (parar aborta o lote inteiro)
- feat: **listagens em ordem natural** — filtros do histórico, contas e modos agora ordenam com número na ordem certa (segue2 antes de segue10)
- feat: **rotação de mensagens no DM** — 5 variações mais suaves (sem apelo de desconto, sem emoji), pra cortar o flag de "mesma mensagem em massa"

### Modificado
- update: o **Hub revalida a sessão sozinho** quando termina de conectar uma conta — não precisa mais tocar em "sincronizar"

### Corrigido
- fix: **sessão por conta** no lote (cada run usa a sessão da sua conta, sem corromper as outras); o worker só age se a sessão logar de verdade (não finge "curti") e não salva sessão deslogada por cima da boa

## [1.2.1] — 2026-07-29

### Adicionado
- feat: a notificação de fim avisa quando a run parou por **instabilidade do proxy/túnel** — deixa claro que não é bloqueio nem conta, é só tentar de novo mais tarde

## [1.2.0] — 2026-07-29

### Adicionado
- feat: **gerenciador de contas do Instagram** — várias contas salvas (user + senha no aparelho, Keychain), **login autofill** no webview, ativar/apagar; só **uma conta ativa** por vez
- feat: **histórico com filtros em bottom sheet** (chips ativos removíveis), animações ao filtrar e a **conta usada** em cada run no card
- feat: **modos** — exige um modo selecionado pra rodar; o **padrão virou um modo real** (semeado na 1ª vez); editar mostra os campos no padrão e permite **renomear**

### Corrigido
- fix: histórico **persiste o log em disco** e abre os runs antigos; run que trava/some vira registro no histórico; **Live Activity órfã** encerra sozinha; o **spinner** do botão Rodar não trava mais

### Modificado
- update: anel do **LoadingDog** e do **splash** mais colado no dog
- update: conectar o Instagram com mensagem e cabeçalho **universais** (sem citar bot)

### Removido
- chore: testes de barrinha / Live Activity das configurações

### Documentação
- docs: README com o gerenciador de contas e o histórico com filtros

## [1.1.0] — 2026-07-25

### Adicionado
- feat: tela de modo **reformulada** — campos por categoria (Limites/Ritmo/Horário), cada limite/delay vira **toggle** que abre o campo (0 = sem limite, sem ambiguidade), **apagar modo**, modo novo zerado, criar sem presets e **animação uniforme** (Reanimated)
- feat: cap de **interações de follow** por run (público + pedido a privado) separado do **follow real** (só público)

### Corrigido
- fix: LA de 2+ bots volta a mostrar "N bots rodando" — o build instalado não decodifica `LinhaBot` preenchido, então o server manda `linhas` vazio + os nomes na label
- fix: **parar** um bot pelo app agora é **Ctrl+C** (SIGINT) — mostra o saldo e sai limpo, sem virar erro (escala pra SIGKILL só se travar)

### Modificado
- update: o "conectar Instagram" aparece como **"Conectando Instagram"** no app, não o id cru "auto-follow"

## [1.0.0] — 2026-07-22

Primeiro lançamento — hub de automações de Instagram (auto-follow e dm-followers) rodando num server, controlado por um app iOS.

### Adicionado
- feat: Live Activity unificada — barra viva no lock screen / Dynamic Island com progresso multi-bot, empurrada pelo server via APNs
- feat: módulo nativo de Live Activity (ActivityKit) + widget e barra flutuante dentro do app
- feat: histórico das runs com deep-link e push de progresso / início / fim
- feat: sessão universal do Instagram — conecta uma vez e vale pra todos os bots
- feat: splash e loader do cachorro em base64 (não depende da pipeline de asset) + pull-to-refresh
- feat: aba de testes da Live Activity — simula de 1 a 4 bots pra ver a renderização

### Modificado
- update: robustez das runs — reaper de processos zumbis, stop confiável (kill de process-group) e watchdog de travamento
- update: sessão do Instagram deixa de ser por-bot e passa a ser central (fim das corridas de escrita no cookie)

### Documentação
- docs: READMEs (raiz, backend, frontend), PLANO e handoffs da sessão

### Manutenção
- chore: `.gitignore` blinda segredos (`.p8` / `.key` / `.env`), config do Expo e dependências
