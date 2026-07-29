# Changelog

Todas as mudanças relevantes do Quase Nada Bots ficam registradas aqui.
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/).

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
