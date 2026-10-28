# Painel web dos Bots — convenções

Versão **web profissional** do app Quase Nada Bots (React Native em `../frontend`), pra rodar no PC
em `http://quase-nada-bots.localhost`. Mesmas funções do app, mas com cara de painel/dashboard de
mercado (sidebar retrátil, tabelas/grids, telas largas), não um celular esticado.

Stack: Vite + React 19 + TypeScript + Tailwind 3 + framer-motion + lucide-react + @tanstack/react-query
+ react-router 7 + axios. Imports com `@/` (= `src/`).

## Regras de ouro

- **Nada de emoji**, em lugar nenhum (nem em texto, nem em placeholder). Ícones = `lucide-react`.
- Texto **em português (Brasil)**, tom direto e informal, igual ao app ("verificar", "rodando", "deu ruim").
- **Mesmas funções do app**: leia a tela RN correspondente em `../frontend/src/screens/` e replique o
  comportamento (o que mostra, o que cada botão faz, as regras). Pode reorganizar o layout pra desktop.
- **Responsivo**: funciona de 360px a 1920px. Desktop aproveita a largura (grids de 2–3 colunas,
  tabelas); celular empilha.
- **Listas sempre em ordem natural** (segue2 antes de segue10): `cmpTexto` de `@/lib/ordenar`.
- **Backend é PRODUÇÃO.** Nunca chame a API pra testar (nada de script/curl/POST). Verifique com
  `npx tsc -b` (typecheck). Não rode `npm run dev`/build — quem integra roda.

## Onde mexer (cada um no seu)

- Suas páginas em `src/pages/` e componentes da sua área em `src/components/<area>/`.
- **NÃO edite os arquivos compartilhados**: `src/components/{Layout,ui,Modal,Toast}.tsx`,
  `src/lib/*`, `src/App.tsx`, configs. Precisa de algo novo? Crie dentro da sua pasta de área.

## Peças prontas (use)

- `@/components/ui`: `Button` (variant primary|ghost|subtle|danger, size sm|md|lg|icon, `loading`),
  `Input`, `TextArea`, `Label`, `Card`, `Section` (cartão com título + ação), `PageHeader`
  (título + subtítulo + ação), `PageBody` (área padrão da página), `Badge`, `Spinner`, `Skeleton`,
  `EmptyState`, `Switch`, `StatusDot` (ok|warn|danger|neutro|ativo, `pulse`), `Tabs`, `Logo`.
- `@/components/Modal`: `Modal` (open, onClose, title, footer, size sm|md|lg) e `ConfirmModal`
  (ação destrutiva SEMPRE confirma).
- `@/components/Toast`: `useToast()` → `toast.ok('...')`, `toast.error('...')`, `toast.info('...')`
  (confira a assinatura exata no arquivo).
- `@/lib/api`: `api.*` (todas as chamadas do app) + tipos (`RunInfo`, `Account`, `EmuladorStatus`…)
  + `logsWsUrl(runId)` (WebSocket do log). `@/lib/apiClient`: `erroMsg(e)` pra mensagem de erro.
- `@/lib/queries`: hooks compartilhados com cache/polling — `useBots`, `useRuns` (3s),
  `useRunsAtivas`, `useEmulador` (10s), `useContas` (já ordenadas), `useGrupos`, e as chaves `QK`.
  **Use estes** em vez de `useQuery` próprio pros mesmos dados. Depois de uma ação, invalide:
  `queryClient.invalidateQueries({ queryKey: QK.runs })` etc.
- `@/lib/utils`: `cn`, `tempoRelativo(epochS)`, `fmtDuracao(s)`, `fmtDataHora(epochS)`,
  `STATUS_COR` / `STATUS_BG` (por status de run: iniciando, rodando, finalizado, parado, erro).
- `@/lib/credenciais`: senhas das contas IG salvas SÓ no navegador (localStorage, mesmas chaves do
  app web: `lerCredenciais`, `salvarCredencial`, `removerCredencial`, senha/data padrão do Criar
  Conta, pendentes). `@/lib/syncEmulador`: `sincronizarEmulador()` (o "Verificar e sincronizar").
- `@/lib/processo`, `@/lib/datas`: helpers de nome de processo e datas do app.

## Visual

- Tema escuro da marca: `bg`, `surface`, `surface2`, `border`, `primary` (rosa #F63F93), `roxo`,
  `amarelo`, `txt`, `txt-dim`, `txt-faint`, `ok`, `warn`, `danger`; gradiente `bg-marca`.
- Página = `<PageHeader title subtitle action/>` + `<PageBody>` com `Section`s / grids.
- Animação com framer-motion, sutil e profissional: entrada de listas com stagger curto
  (opacity + y 6–8px), `layout` em listas que mudam, hover com leve elevação, modais com escala.
  A transição ENTRE páginas já é feita pelo Layout — não repita.
- Estados: carregando = `Skeleton`; vazio = `EmptyState`; erro = mensagem + botão tentar de novo.
- Números com `tabular-nums`. Status com `StatusDot`/`Badge`. Ações destrutivas em `danger`.

## Rotas

`/visao-geral` · `/bots` · `/bots/:botId` · `/bots/:botId/modos/:modo` (modo `novo` = criar) ·
`/bots/:botId/chats` · `/execucoes` · `/execucoes/:runId` · `/historico` · `/contas` ·
`/contas/criar` · `/contas/remover` · `/cronograma` · `/ajustes`.
Bots com tela própria no app: `criar-conta` → `/contas/criar`, `remover-conta` → `/contas/remover`.
Depois de disparar uma run, navegue pra `/execucoes/<run_id>` (igual o app abre a tela da Run).
