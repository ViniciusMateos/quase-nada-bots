// Metadata dos campos de um modo — cópia fiel do EditModoScreen do app (rótulo, categoria, tipo,
// sugestão ao ligar, dica, opções), na mesma ordem. Mudou lá, muda aqui.
export type Valor = number | boolean | number[] | string | string[]
// cap   → interruptor; ligado abre 1 número; desligado = 0 (sem limite)
// range → interruptor; ligado abre "de X até Y"; desligado = [0,0]
// bool  → só o interruptor
// opcao → escolhe UMA das opções (sempre tem valor, sem interruptor)
// lista → vários textos (ex: mensagens do DM); vazio = padrão do bot (sem interruptor)
// text  → texto livre (sem interruptor)
export type Tipo = 'bool' | 'cap' | 'range' | 'text' | 'opcao' | 'lista'
export type Opcao = { valor: string; label: string }
export type MetaF = { label: string; cat: string; tipo: Tipo; sug?: Valor; dica?: string; opcoes?: Opcao[] }

// categorias (ordem de exibição)
export const CATS: { key: string; titulo: string }[] = [
  { key: 'alvo', titulo: 'Alvo e ações' },
  { key: 'limites', titulo: 'Limites de segurança' },
  { key: 'aquecimento', titulo: 'Aquecimento humano' },
  { key: 'ritmo', titulo: 'Ritmo e delays' },
  { key: 'horario', titulo: 'Horário' },
  { key: 'outros', titulo: 'Outros' },
]

const META: Record<string, MetaF> = {
  aplicar_caps: { label: 'Respeitar limites', cat: 'limites', tipo: 'bool',
    dica: 'Desligado = ignora os limites abaixo e roda até o Instagram bloquear.' },
  max_follows_dia: { label: 'Máx. follows por dia', cat: 'limites', tipo: 'cap', sug: 60 },
  max_follows_hora: { label: 'Máx. follows por hora', cat: 'limites', tipo: 'cap', sug: 15 },
  max_posts_por_run: { label: 'Máx. posts por run', cat: 'limites', tipo: 'cap', sug: 5 },
  limite_follows_run: { label: 'Máx. follows reais por run', cat: 'limites', tipo: 'cap', sug: 150,
    dica: 'Só quem virou "Seguindo" (público). Pedido a privado NÃO conta aqui.' },
  limite_interacoes_run: { label: 'Máx. interações por run', cat: 'limites', tipo: 'cap', sug: 200,
    dica: 'Toda ação de follow: público + pedido a privado. É o que o IG conta pro rate-limit.' },
  max_dms_dia: { label: 'Máx. DMs por dia', cat: 'limites', tipo: 'cap', sug: 50 },
  max_dms_hora: { label: 'Máx. DMs por hora', cat: 'limites', tipo: 'cap', sug: 15 },
  max_dms_por_run: { label: 'Máx. DMs por run', cat: 'limites', tipo: 'cap', sug: 30 },
  pausa_longa_cada: { label: 'Pausa longa a cada N ações', cat: 'ritmo', tipo: 'cap', sug: 10 },
  delay_follow: { label: 'Delay entre follows (s)', cat: 'ritmo', tipo: 'range', sug: [3, 8] },
  delay_dm: { label: 'Delay entre DMs (s)', cat: 'ritmo', tipo: 'range', sug: [5, 20] },
  delay_post: { label: 'Delay entre posts (s)', cat: 'ritmo', tipo: 'range', sug: [180, 480] },
  delay_acao_ui: { label: 'Delay de navegação (s)', cat: 'ritmo', tipo: 'range', sug: [1, 4] },
  pausa_longa: { label: 'Duração da pausa longa (s)', cat: 'ritmo', tipo: 'range', sug: [5, 15] },
  delay_entre_chats: { label: 'Delay entre chats (s)', cat: 'ritmo', tipo: 'range', sug: [120, 300] },
  usar_delay_entre_chats: { label: 'Esperar entre chats', cat: 'ritmo', tipo: 'bool' },
  delay_scroll: { label: 'Delay entre rolagens (s)', cat: 'ritmo', tipo: 'range', sug: [2, 6] },
  humanizar: { label: 'Humanizar (pausas navegando)', cat: 'ritmo', tipo: 'bool',
    dica: 'No meio de seguir/mandar DM, sai e navega (feed, story, curtir) e volta — quebra o padrão de rajada, que é o que o IG mais pega.' },
  pausa_cada: { label: 'Pausa humana a cada N ações', cat: 'ritmo', tipo: 'cap', sug: 10,
    dica: 'A cada quantos follows/DMs ele dá a paradinha pra navegar.' },
  active_hours: { label: 'Janela de horário (0–23)', cat: 'horario', tipo: 'range', sug: [9, 23] },
  // ── aquecimento humano ──
  duracao_min: { label: 'Duração da navegação (min)', cat: 'aquecimento', tipo: 'range', sug: [3, 7] },
  max_curtidas: { label: 'Máx. curtidas por run', cat: 'aquecimento', tipo: 'cap', sug: 5 },
  prob_curtir: { label: 'Chance de curtir por rolagem (%)', cat: 'aquecimento', tipo: 'cap', sug: 30,
    dica: 'De 0 a 100. Ex: 30 = 30% de chance de curtir a cada rolagem (até o máximo acima).' },
  ver_stories: { label: 'Ver stories', cat: 'aquecimento', tipo: 'bool' },
  max_stories: { label: 'Máx. stories por run', cat: 'aquecimento', tipo: 'cap', sug: 5 },
  prob_story: { label: 'Chance de ver stories (%)', cat: 'aquecimento', tipo: 'cap', sug: 25,
    dica: 'De 0 a 100. Chance de ir dar uma olhada nos stories durante a navegação.' },
  ver_explore: { label: 'Passar no explorar', cat: 'aquecimento', tipo: 'bool' },
  // ── like + repost ──
  alvo: { label: 'Conta-alvo', cat: 'alvo', tipo: 'text', sug: 'brechoquasenadaa',
    dica: 'De quem curtir/repostar os posts (sem o @). Ex: brechoquasenadaa.' },
  curtir: { label: 'Curtir os posts', cat: 'alvo', tipo: 'bool' },
  repostar: { label: 'Repostar os posts', cat: 'alvo', tipo: 'bool',
    dica: 'Repost nativo do IG (via web). Se o botão não existir no web, ele avisa e segue só curtindo.' },
  primeira_vez_ultimos: { label: 'Na 1ª vez, pegar os N mais recentes', cat: 'alvo', tipo: 'cap', sug: 10,
    dica: 'Quantos posts do alvo pegar na 1ª run (o drop). Depois pega só os novos, sozinho.' },
  max_por_run: { label: 'Máx. posts por run', cat: 'limites', tipo: 'cap', sug: 15,
    dica: 'Teto de posts por execução. Desligado = processa todos os pendentes.' },
  // ── story-repost ──
  selecao: { label: 'O que postar', cat: 'alvo', tipo: 'opcao', sug: 'aleatorio',
    opcoes: [{ valor: 'aleatorio', label: 'Aleatório' }, { valor: 'drop_novo', label: 'Drop novo' }],
    dica: 'Aleatório: sorteia entre TODAS as peças disponíveis (o último drop incluso). Drop novo: só as disponíveis do último drop postado. Nos dois, cada conta só repete peça depois de postar todas.' },
  repost_card: { label: 'Repostar como card', cat: 'alvo', tipo: 'bool',
    dica: 'Ligado: o post como card (dá pra tocar e abrir o post). Desligado: só a foto em tela cheia.' },
  estilo: { label: 'Estilo do story', cat: 'alvo', tipo: 'opcao', sug: 'vitrine',
    opcoes: [{ valor: 'vitrine', label: 'Vitrine' }, { valor: 'original', label: 'Igual o Insta' }],
    dica: 'Vitrine: fundo laranja do brechó + etiqueta de preço + chamada. Igual o Insta: cópia do card do app, sem preço.' },
  mostrar_preco: { label: 'Etiqueta de preço', cat: 'alvo', tipo: 'bool',
    dica: 'Vitrine: o adesivo com o valor e o tamanho (conjunto mostra o preço fechado + o avulso).' },
  quantos_posts: { label: 'Stories por run (por conta)', cat: 'alvo', tipo: 'cap', sug: 10,
    dica: 'Quantas peças cada conta posta a cada run. No lote, cada conta posta esse tanto.' },
  texto: { label: 'Chamada embaixo do card', cat: 'alvo', tipo: 'text', sug: '',
    dica: 'Em branco = "comente “fila” para garantir a sua!".' },
  link: { label: 'Link (sticker)', cat: 'alvo', tipo: 'text', sug: '',
    dica: 'Link opcional (sticker). Exige conta elegível a link no story.' },
}

// ── campos dos modos reformulados pro EMULADOR (20/10/2026) ──
const META_EMULADOR: Record<string, MetaF> = {
  // auto follow
  limite_follows_conta: { label: 'Máx. follows por conta', cat: 'limites', tipo: 'cap', sug: 80,
    dica: 'Teto em cada conta. Desligado = segue até o Instagram dar soft-block (~73 a 85 por conta).' },
  max_posts_conta: { label: 'Máx. posts por conta', cat: 'limites', tipo: 'cap', sug: 3,
    dica: 'Quantos posts do chat cada conta processa. Desligado = até acabar ou bater o teto.' },
  teto_follows_lote: { label: 'Teto de follows do lote', cat: 'limites', tipo: 'cap', sug: 400,
    dica: 'Soma de todas as contas do lote. ~420 follows em pouco tempo já travou o aparelho.' },
  parar_lote_apos_softblocks: { label: 'Parar o lote após N soft-blocks', cat: 'limites', tipo: 'cap', sug: 2,
    dica: 'N contas seguidas em soft-block (a última sem nenhum follow) = provável limite do aparelho: para o lote.' },
  cooldown_softblock_h: { label: 'Descanso após soft-block (h)', cat: 'limites', tipo: 'cap', sug: 12,
    dica: 'A conta que tomou soft-block fica de fora do lote por essas horas (só tempo cura o teto).' },
  pausa_entre_contas: { label: 'Pausa entre contas (s)', cat: 'ritmo', tipo: 'range', sug: [90, 240],
    dica: 'Respiro entre uma conta e outra no lote — espalha a carga do aparelho.' },
  // dm followers
  max_dms_por_conta: { label: 'Máx. DMs por conta', cat: 'limites', tipo: 'cap', sug: 10,
    dica: 'Por run, contando só DM que saiu (pulado não gasta).' },
  primeira_vez_n: { label: 'Na 1ª vez, só os N mais recentes', cat: 'alvo', tipo: 'cap', sug: 20,
    dica: 'Na primeira run de uma conta, manda só pros N que seguiram mais recentemente; o resto fica sem DM.' },
  idade_max_dias: { label: 'Seguiu há no máximo (dias)', cat: 'alvo', tipo: 'cap', sug: 7,
    dica: 'Quem seguiu há mais tempo que isso não recebe (agradecer 3 semanas depois fica estranho).' },
  ordem: { label: 'Ordem', cat: 'alvo', tipo: 'opcao', sug: 'recentes',
    opcoes: [{ valor: 'recentes', label: 'Recentes primeiro' }, { valor: 'antigos', label: 'Antigos primeiro' }] },
  mensagens: { label: 'Mensagens', cat: 'alvo', tipo: 'lista',
    dica: 'Vazio = as 5 padrão (com o desconto de 10%). {username} vira o @ da pessoa. Toda mensagem tem que ter @brechoquasenadaa — sem ela o bot não reconhece quem já recebeu.' },
  pausa_humana_cada: { label: 'Navegar no feed a cada N pessoas', cat: 'ritmo', tipo: 'cap', sug: 6,
    dica: 'De vez em quando sai, rola o feed e volta — quebra o padrão de rajada.' },
  resfriar_conta_h: { label: 'Descanso após falha (h)', cat: 'limites', tipo: 'cap', sug: 24,
    dica: 'Depois de "Falha ao enviar", soft-block ou bloqueio, a conta fica de fora por essas horas.' },
  // story repost
  fundo: { label: 'Fundo', cat: 'alvo', tipo: 'opcao', sug: 'laranja',
    opcoes: [{ valor: 'laranja', label: 'Laranja do brechó' }, { valor: 'instagram', label: 'Do Instagram' }],
    dica: 'Laranja: pinta com o conta-gotas. Do Instagram: o fundo que o IG gera pro post — bem mais rápido.' },
  chamada: { label: 'Chamada embaixo do card', cat: 'alvo', tipo: 'text', sug: '',
    dica: 'Vira maiúsculas, até 3 linhas. Vazio = COMENTE “FILA” PARA GARANTIR A SUA!' },
  pausa_story: { label: 'Pausa entre stories (s)', cat: 'ritmo', tipo: 'range', sug: [3, 8] },
  tentativas_por_peca: { label: 'Tentativas por peça', cat: 'outros', tipo: 'cap', sug: 2,
    dica: 'Se a conferência barrar o story, tenta a mesma peça de novo até N vezes.' },
  manter_ligado: { label: 'Deixar o emulador ligado no fim', cat: 'outros', tipo: 'bool',
    dica: 'Pra rodar de novo em seguida sem esperar ligar (gasta memória do PC enquanto isso).' },
}
Object.assign(META, META_EMULADOR)

// o mesmo campo muda de sentido/sugestão conforme o bot
const META_BOT: Record<string, Record<string, Partial<MetaF>>> = {
  'auto-follow': {
    delay_follow: { sug: [2, 5] },
    pausa_longa_cada: { label: 'Pausa longa a cada N follows', sug: 15 },
    pausa_longa: { sug: [30, 90] },
    delay_post: { sug: [120, 300] },
  },
  'dm-followers': {
    max_dms_hora: { dica: 'Contado pelas DMs que já saíram na última hora (o IG limita DM).' },
    max_dms_dia: { dica: 'Contado pelas DMs das últimas 24h.' },
    delay_dm: { sug: [20, 60] },
    pausa_longa_cada: { label: 'Pausa longa a cada N DMs enviadas', sug: 5 },
    pausa_longa: { sug: [180, 420] },
  },
  'story-brecho': {
    quantos_posts: { label: 'Stories por run', dica: 'Quantas peças postar no story a cada run.' },
    mostrar_preco: { dica: 'A etiqueta com o preço e o tamanho no canto do card.' },
  },
}

// campos ESCONDIDOS do editor (o bot já cuida deles)
export const OCULTOS = new Set([
  'pular_ja_seguidos', 'pular_pendentes', 'seguir_privados', 'start_from_oldest_se_vazio',
])

// valores dos ocultos gravados SEMPRE (vazio hoje, igual o app)
export const OCULTOS_DEFAULT: Record<string, Record<string, Valor>> = {}

// bots com o esquema NOVO (emulador): o editor mostra exatamente estes campos
export const ESQUEMA_NOVO = new Set(['auto-follow', 'dm-followers', 'story-brecho'])

// campos de um modo NOVO (zerado), por bot
export const CAMPOS_NOVO: Record<string, string[]> = {
  'auto-follow': [
    'limite_follows_conta', 'max_posts_conta', 'teto_follows_lote', 'parar_lote_apos_softblocks',
    'cooldown_softblock_h', 'delay_follow', 'pausa_longa_cada', 'pausa_longa', 'delay_post', 'pausa_entre_contas',
  ],
  'dm-followers': [
    'primeira_vez_n', 'idade_max_dias', 'ordem', 'mensagens', 'max_dms_por_conta', 'max_dms_hora',
    'max_dms_dia', 'resfriar_conta_h', 'delay_dm', 'delay_acao_ui', 'pausa_longa_cada', 'pausa_longa',
    'pausa_humana_cada', 'pausa_entre_contas',
  ],
  'story-brecho': [
    'quantos_posts', 'fundo', 'mostrar_preco', 'chamada', 'pausa_story', 'tentativas_por_peca',
    'manter_ligado',
  ],
  'human-warmup': [
    'aplicar_caps', 'duracao_min', 'max_curtidas', 'prob_curtir', 'ver_stories', 'max_stories',
    'prob_story', 'ver_explore', 'delay_scroll', 'delay_acao_ui', 'active_hours',
  ],
  'like-repost': [
    'alvo', 'curtir', 'repostar', 'primeira_vez_ultimos', 'aplicar_caps', 'max_por_run',
    'delay_post', 'delay_acao_ui', 'humanizar', 'pausa_cada', 'active_hours',
  ],
  'story-repost': [
    'selecao', 'quantos_posts', 'repost_card', 'estilo', 'mostrar_preco', 'texto', 'link',
    'delay_post', 'active_hours',
  ],
}

export function metaDe(k: string, v: unknown, botId?: string): MetaF {
  const extra = botId ? META_BOT[botId]?.[k] : undefined
  if (META[k]) return extra ? { ...META[k], ...extra } : META[k]
  const tipo: Tipo = typeof v === 'boolean' ? 'bool' : typeof v === 'string' ? 'text'
    : Array.isArray(v) ? 'range' : 'cap'
  return { label: k, cat: 'outros', tipo }
}

/** sugestão "crua" do META geral (sem o ajuste por bot) — usada pro valor padrão de opção */
export function sugGeral(k: string): Valor | undefined {
  return META[k]?.sug
}

export const zerado = (tipo: Tipo): Valor =>
  (tipo === 'bool' ? false : tipo === 'text' || tipo === 'opcao' ? '' : tipo === 'range' ? [0, 0]
    : tipo === 'lista' ? [] : 0)

// tipos SEM interruptor (o valor é editado direto): textos, opção e lista
export const ehString = (tipo: Tipo) => tipo === 'text' || tipo === 'opcao' || tipo === 'lista'

export function temValor(tipo: Tipo, v: Valor): boolean {
  if (tipo === 'bool') return Boolean(v)
  if (tipo === 'lista') return Array.isArray(v) && v.length > 0
  if (ehString(tipo)) return Boolean(String(v ?? '').trim())
  if (tipo === 'range') { const a = v as number[]; return (a?.[0] || 0) > 0 || (a?.[1] || 0) > 0 }
  return (v as number) > 0
}

export const num = (t: string): number => { const n = parseFloat(t.replace(',', '.')); return isNaN(n) ? 0 : n }
// mostra vazio quando é 0 (dá pra apagar e digitar do zero sem ficar "0" preso)
export const txtNum = (n: number): string => (n ? String(n) : '')
