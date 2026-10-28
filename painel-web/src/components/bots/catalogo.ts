// Catálogo e regras dos bots do EMULADOR — espelho do BOTS_EMULADOR (EmuladorScreen) e das regras
// do BotScreen do app. Tudo aqui é puro (sem React) pra Bots/Bot/EditModo/Chats usarem igual.
import type { LucideIcon } from 'lucide-react'
import { CircleMinus, CirclePlus, Images, MessagesSquare, UserPlus } from 'lucide-react'
import type { EmuladorStatus, Account, RunHistorico, RunInfo } from '@/lib/api'
import { locaisDe } from '@/lib/api'
import { cmpTexto } from '@/lib/ordenar'
import { ehProcessoDeConta } from '@/lib/processo'
import { CONTA_BRECHO } from '@/lib/syncEmulador'

export { CONTA_BRECHO }

export type BotCatalogo = {
  id: string
  icone: LucideIcon
  nomeFallback: string
  descFallback: string
  /** bots com tela própria no app (não abrem a tela de rodar) */
  rota?: string
}

// Bots que rodam NO EMULADOR. Fallback cobre backend que não devolva o bot em /bots.
export const BOTS_EMULADOR: BotCatalogo[] = [
  { id: 'auto-follow', icone: UserPlus, nomeFallback: 'Auto Follow',
    descFallback: 'Segue os curtidores dos posts compartilhados num chat.' },
  { id: 'dm-followers', icone: MessagesSquare, nomeFallback: 'DM Followers',
    descFallback: 'Manda DM de obrigado pros novos seguidores de cada conta.' },
  { id: 'story-brecho', icone: Images, nomeFallback: 'Story Repost',
    descFallback: 'Posta as peças disponíveis no story do brechó pelo app.' },
  { id: 'criar-conta', icone: CirclePlus, nomeFallback: 'Criar Conta',
    descFallback: 'Começa a conta nova no emulador até o código do e-mail; o resto você termina.', rota: '/contas/criar' },
  { id: 'remover-conta', icone: CircleMinus, nomeFallback: 'Remover Contas',
    descFallback: 'Tira contas do app do Instagram no emulador pra liberar vaga.', rota: '/contas/remover' },
]

export function botDoCatalogo(id: string): BotCatalogo | undefined {
  return BOTS_EMULADOR.find((b) => b.id === id)
}

/** Pra onde o clique no bot leva: tela própria (criar/remover conta) ou a tela de rodar. */
export function rotaDoBot(id: string): string {
  return botDoCatalogo(id)?.rota ?? `/bots/${id}`
}

/** O que a tela de rodar mostra pra cada bot (mesmas regras do BotScreen). */
export function recursosDoBot(botId: string, temChatsBackend?: boolean) {
  return {
    temChats: botId === 'auto-follow' || !!temChatsBackend,
    temPostInicial: botId === 'like-repost',
    // lote por COOKIE (contas do servidor)
    temLote: botId === 'like-repost' || botId === 'story-repost',
    // emulador: lote pelas contas logadas no device, uma de cada vez, na ORDEM da seleção
    ehVitrine: botId === 'auto-follow' || botId === 'dm-followers' || botId === 'story-brecho',
    // Story Repost: a conta do brechó entra na mesma ordem (roda no emulador próprio dela)
    ehStoryBrecho: botId === 'story-brecho',
  }
}

// ── ordem do lote ──────────────────────────────────────────────────────────

/** Ordem padrão do lote: tudo marcado, da menor pra maior; no Story o brechó entra no fim. */
export function ordemPadrao(contas: string[], comBrecho: boolean): string[] {
  return comBrecho ? [...contas, CONTA_BRECHO] : [...contas]
}

/** Marca/desmarca na ORDEM (igual carrossel do IG): marcar põe no fim; desmarcar tira e os
 * números das outras se ajustam. */
export function alternarNaOrdem(ordem: string[], u: string): string[] {
  return ordem.includes(u) ? ordem.filter((x) => x !== u) : [...ordem, u]
}

/** "todas" COMPLETA a seleção: as já marcadas mantêm a vez; as que faltam entram depois. */
export function completarOrdem(atual: string[], padrao: string[]): string[] {
  const ja = atual.filter((u) => padrao.includes(u))
  return [...ja, ...padrao.filter((u) => !ja.includes(u))]
}

/** Contas do pool do emulador: logadas no device, só as marcadas pro EMULADOR (conta que o app
 * ainda não conhece fica), sem a do brechó, em ordem natural. */
export function contasVitrine(status?: EmuladorStatus | null, contas?: Account[] | null): string[] {
  let us = status?.contas_logadas ?? []
  if (contas) {
    const porLabel = new Map(contas.map((a) => [(a.label || '').toLowerCase(), a]))
    us = us.filter((u) => {
      const a = porLabel.get(u.toLowerCase())
      return !a || locaisDe(a).includes('emulador')
    })
  }
  return [...new Set(us)].filter((u) => u.toLowerCase() !== CONTA_BRECHO).sort(cmpTexto)
}

// ── emuladores do Story (brechó x segue rodam juntos) ─────────────────────

export type Emu = 'brecho' | 'principal'

export function emuladoresDe(contas: string[]): Set<Emu> {
  if (!contas.length) return new Set<Emu>(['brecho'])   // story sem lista = só o brechó
  return new Set<Emu>(contas.map((c) => (c.toLowerCase() === CONTA_BRECHO ? 'brecho' : 'principal')))
}

export function contasDaRun(r: RunInfo): string[] {
  const p = (r.params ?? {}) as { lote_contas?: unknown[]; contas?: unknown[] }
  return (p.lote_contas ?? p.contas ?? [])
    .map((c) => (typeof c === 'string' ? c : String((c as { label?: string; id?: string })?.label
      ?? (c as { id?: string })?.id ?? '')))
    .map((c) => c.replace(/^@/, '').trim().toLowerCase())
    .filter(Boolean)
}

export function cruza(a: Set<Emu>, b: Set<Emu>): boolean {
  for (const x of a) if (b.has(x)) return true
  return false
}

// ── runs ───────────────────────────────────────────────────────────────────

/** Runs ativas DESTE bot. Conectar/verificar contas usam o "auto-follow" de veículo — não contam. */
export function runsAtivasDoBot(runs: RunInfo[] | undefined, botId: string): RunInfo[] {
  return (runs ?? []).filter((r) => r.bot === botId && (r.status === 'rodando' || r.status === 'iniciando')
    && !(r.params as { import_cookies?: unknown })?.import_cookies && !ehProcessoDeConta(r))
}

/** Run-fantasma: nem chegou a rodar (sem conta E sem saldo). */
export function ehFantasma(r: RunHistorico): boolean {
  return !r.conta && Object.keys(r.saldo || {}).length === 0
}

export function quandoRun(r: RunHistorico): number {
  return r.ended_at ?? r.started_at ?? 0
}

/** Tom do pontinho de resultado: vermelho erro/bloqueio, cinza parado, verde ok. */
export function tomRun(r: RunHistorico): 'ok' | 'danger' | 'neutro' | 'ativo' {
  if (r.bloqueio || r.status === 'erro') return 'danger'
  if (r.status === 'parado') return 'neutro'
  if (r.status === 'rodando' || r.status === 'iniciando') return 'ativo'
  return 'ok'
}

/** Status 4xx de um erro do axios. */
export function statusHttp(e: unknown): number | undefined {
  return (e as { response?: { status?: number } })?.response?.status
}

/** Nome único pra cópia de um modo: "padrão" → "padrão 2", "padrão 3"… */
export function nomeCopia(base: string, existentes: Record<string, unknown>): string {
  let i = 2
  let n = `${base} ${i}`
  while (existentes[n]) { i += 1; n = `${base} ${i}` }
  return n
}

/** Rota de edição de um modo (o `state.editar` desambigua um modo chamado "novo"). */
export function rotaModo(botId: string, modo: string | null): string {
  return `/bots/${botId}/modos/${modo === null ? 'novo' : encodeURIComponent(modo)}`
}
