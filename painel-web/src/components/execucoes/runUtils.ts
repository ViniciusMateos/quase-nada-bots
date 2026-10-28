// Helpers da área de execuções (Visão geral, Execuções, Run, Histórico). Mesmas regras do app:
// nome do processo pela AÇÃO (login/verificar não são "Auto Follow"), saldo por bot, resultado.
import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CircleMinus,
  Images,
  LogIn,
  MessagesSquare,
  ShieldCheck,
  UserPlus,
  UserRoundPlus,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { api, type Account, type Bot, type EmuladorStatus, type RunHistorico, type RunInfo } from '@/lib/api'
import { acaoDe, ehProcessoDeConta, nomeDoProcesso } from '@/lib/processo'
import { QK } from '@/lib/queries'

export const ehAtiva = (r: { status: string }) => r.status === 'rodando' || r.status === 'iniciando'

/** % do progresso (0–100) ou null quando a run ainda não sabe o tamanho da fila. */
export function pctDe(p?: { done: number; total: number } | null): number | null {
  if (!p || !p.total) return null
  return Math.max(0, Math.min(100, Math.round((p.done / p.total) * 100)))
}

/** Nome do processo (não do bot): "Conectar contas", "Auto Follow · lote (7 contas)"… */
export function tituloDaRun(
  r: { titulo?: string | null; bot?: string | null; params?: Record<string, unknown> | null; acao?: string | null },
  bots?: Record<string, Bot>,
): string {
  const n = nomeDoProcesso(acaoDe(r), r.titulo ?? null)
  if (n) return n
  const b = r.bot ?? ''
  return bots?.[b]?.nome ?? (b || 'Execução')
}

// login/verificar usam o "auto-follow" como veículo — no histórico a AÇÃO é a chave (filtro e nome)
export const NOMES_ACAO: Record<string, string> = {
  'acao:login': 'Conectar contas',
  'acao:verificar': 'Verificar sessões',
}
export function chaveRun(r: RunHistorico): string {
  return r.acao ? `acao:${r.acao}` : r.bot
}

/** Ícone + cor por processo — mesma linguagem do widget flutuante do app (corDoBot/iconeDoBot). */
export function visualDoProcesso(r: { bot?: string | null; params?: Record<string, unknown> | null; acao?: string | null }): {
  Icon: LucideIcon
  cor: string
  fundo: string
} {
  const acao = acaoDe(r)
  if (acao === 'login') return { Icon: LogIn, cor: 'text-primary-light', fundo: 'bg-primary/10' }
  if (acao === 'verificar') return { Icon: ShieldCheck, cor: 'text-primary-light', fundo: 'bg-primary/10' }
  if (ehProcessoDeConta(r)) return { Icon: ShieldCheck, cor: 'text-primary-light', fundo: 'bg-primary/10' }
  switch (r.bot) {
    case 'auto-follow':
      return { Icon: UserPlus, cor: 'text-primary-light', fundo: 'bg-primary/10' }
    case 'dm-followers':
      return { Icon: MessagesSquare, cor: 'text-amarelo', fundo: 'bg-amarelo/10' }
    case 'story-brecho':
    case 'story-repost':
      return { Icon: Images, cor: 'text-[#B66BDB]', fundo: 'bg-roxo/20' }
    case 'criar-conta':
      return { Icon: UserRoundPlus, cor: 'text-ok', fundo: 'bg-ok/10' }
    case 'remover-conta':
      return { Icon: CircleMinus, cor: 'text-danger', fundo: 'bg-danger/10' }
    default:
      return { Icon: Zap, cor: 'text-[#B66BDB]', fundo: 'bg-roxo/20' }
  }
}

/** De qual conta é a run (o /runs não manda a conta — sai dos params do job). */
export function contaDosParams(params: Record<string, unknown> | null | undefined, contas?: Account[]): string | null {
  const p = (params ?? {}) as Record<string, unknown>
  const lote = p.lote_contas
  if (Array.isArray(lote) && lote.length) {
    if (lote.length === 1) {
      const c = lote[0] as { label?: string; id?: string }
      return c?.label ? `@${c.label}` : null
    }
    return `${lote.length} contas`
  }
  const ec = p.emulador_conta as { label?: string } | undefined
  if (ec && typeof ec === 'object' && ec.label) return `@${ec.label}`
  const lista = p.contas
  if (Array.isArray(lista) && lista.length) {
    const nomes = lista.filter((x): x is string => typeof x === 'string')
    if (nomes.length === 1) return `@${nomes[0]}`
    if (nomes.length > 1) return `${nomes.length} contas`
  }
  if (typeof p.conta_id === 'string' && contas) {
    const a = contas.find((c) => c.id === p.conta_id)
    if (a?.label) return `@${a.label}`
  }
  if (typeof p.username === 'string' && p.username) return `@${p.username}`
  return null
}

// ── saldo ────────────────────────────────────────────────────────────────────

// rótulo legível por chave do saldo (cada bot manda o seu: auto-follow do emulador = follows/posts,
// do server = seguidos/pedidos/pulados; DM = enviadas/puladas; story = postados/falhas…)
const ROTULO_SALDO: Record<string, [string, string]> = {
  follows: ['follow', 'follows'],
  seguidos: ['seguido', 'seguidos'],
  pedidos: ['pedido', 'pedidos'],
  pulados: ['pulado', 'pulados'],
  posts: ['post', 'posts'],
  enviadas: ['DM', 'DMs'],
  puladas: ['pulada', 'puladas'],
  postados: ['story', 'stories'],
  falhas: ['falha', 'falhas'],
  criadas: ['criada', 'criadas'],
  removidas: ['removida', 'removidas'],
  novas: ['nova', 'novas'],
  atualizadas: ['atualizada', 'atualizadas'],
  vendidas: ['vendida', 'vendidas'],
  vistos: ['visto', 'vistos'],
  imagens: ['imagem', 'imagens'],
}
// chaves "boas" (verde) e "ruins" (vermelho) — o resto fica neutro
const SALDO_BOM = new Set(['follows', 'seguidos', 'enviadas', 'postados', 'criadas', 'removidas', 'novas'])
const SALDO_RUIM = new Set(['falhas'])

export type ChipSaldo = { key: string; valor: string; rotulo: string; tom: 'bom' | 'ruim' | 'neutro' }

export function chipsDoSaldo(saldo?: Record<string, number | string> | null): ChipSaldo[] {
  if (!saldo) return []
  return Object.entries(saldo).map(([k, v]) => {
    const n = typeof v === 'number' ? v : Number(v)
    const par = ROTULO_SALDO[k]
    const rotulo = par ? (n === 1 ? par[0] : par[1]) : k
    const tom: ChipSaldo['tom'] = SALDO_RUIM.has(k) && n > 0 ? 'ruim' : SALDO_BOM.has(k) && n > 0 ? 'bom' : 'neutro'
    return { key: k, valor: String(v), rotulo, tom }
  })
}

/** Soma do dia/filtro: follows (emulador "follows" + server "seguidos"), DMs, stories. */
export function somarSaldos(regs: RunHistorico[]) {
  let follows = 0, pedidos = 0, dms = 0, stories = 0
  for (const r of regs) {
    if (r.acao) continue   // login/verificar não são ações de bot
    const s = r.saldo || {}
    const n = (k: string) => Number(s[k] ?? 0) || 0
    follows += n('follows') + n('seguidos')
    pedidos += n('pedidos')
    dms += n('enviadas')
    stories += n('postados')
  }
  return { follows, pedidos, dms, stories }
}

/** Resultado de uma run do histórico (bloqueio > erro > parado > ok) — igual o app. */
export type Resultado = 'ok' | 'bloqueio' | 'erro' | 'parado'
export function resultadoDe(r: Pick<RunHistorico, 'bloqueio' | 'status'>): Resultado {
  if (r.bloqueio) return 'bloqueio'
  if (r.status === 'erro') return 'erro'
  if (r.status === 'parado') return 'parado'
  return 'ok'
}

// ── tempo ────────────────────────────────────────────────────────────────────

/** "agora" que anda sozinho (pra durações/contagens ao vivo). */
export function useAgora(ms = 1000, ativo = true): number {
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    if (!ativo) return
    const id = setInterval(() => setAgora(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms, ativo])
  return agora
}

/** mm:ss da contagem regressiva — mesmo formato do app ("3m 05s", "40s"). */
export function mmss(seg: number): string {
  const s = Math.max(0, Math.round(seg))
  const m = Math.floor(s / 60), r = s % 60
  return m ? `${m}m ${String(r).padStart(2, '0')}s` : `${r}s`
}

/** Duração de histórico no formato do app: "40s", "12m 5s", "1h 05m". */
export function fmtDur(s: number | null | undefined): string | null {
  if (s == null || !isFinite(s)) return null
  if (s < 60) return `${Math.round(s)}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${Math.round(s % 60)}s`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
/** "28/out · 21:34" */
export function fmtDataCurta(epoch: number | null | undefined): string {
  if (!epoch) return '—'
  const d = new Date(epoch * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${MESES[d.getMonth()]} · ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function inicioDeHoje(): number {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 1000
}

// ── dados ────────────────────────────────────────────────────────────────────

/** Histórico completo (todas as runs). Chave compartilhada QK.historico(). */
export function useHistorico() {
  return useQuery<RunHistorico[]>({
    queryKey: QK.historico(),
    queryFn: () => api.getHistorico(),
    staleTime: 10_000,
    refetchInterval: 60_000,
  })
}

/** Quando alguma run ativa some da lista (terminou), recarrega o histórico — é lá que mora o saldo. */
export function useHistoricoAoTerminar(ativas: { id: string }[]) {
  const qc = useQueryClient()
  const antes = useRef<Set<string>>(new Set())
  const chave = ativas.map((r) => r.id).sort().join(',')
  useEffect(() => {
    const agora = new Set(chave ? chave.split(',') : [])
    const terminou = [...antes.current].some((id) => !agora.has(id))
    antes.current = agora
    // o backend grava o histórico no fim da run; dá um respiro e busca
    if (terminou) setTimeout(() => qc.invalidateQueries({ queryKey: QK.historico() }), 1200)
  }, [chave, qc])
}

/** O backend manda mais coisa no /emulador/status do que o tipo declara (fila, ha_segundos). */
export type EmuladorStatusExt = EmuladorStatus & {
  ha_segundos?: number | null
  fila?: { pendentes: number; em_execucao: number; total: number }
}

/** Run do GET /runs/:id — runs que saíram da memória voltam do histórico com conta/saldo. */
export type RunDetalhe = RunInfo & {
  log: string[]
  conta?: string | null
  saldo?: Record<string, number | string> | null
  historico?: boolean
}
