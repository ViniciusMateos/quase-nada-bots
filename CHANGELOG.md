# Changelog

Todas as mudanças relevantes do Quase Nada Bots ficam registradas aqui.
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/).

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
