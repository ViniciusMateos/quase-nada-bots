// Histórico (o HistoricoScreen do app): todas as runs agrupadas por dia (Hoje/Ontem/N dias/Semana X),
// filtros de período, bot, conta e resultado, saldo de cada run em chips. Clique abre o log.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronRight, History as IconeHistorico, MessagesSquare, RefreshCw, SlidersHorizontal, UserPlus, X, Images, ListChecks } from 'lucide-react'
import type { RunHistorico } from '@/lib/api'
import { bucketData, fmtHora } from '@/lib/datas'
import { cmpTexto } from '@/lib/ordenar'
import { nomeDoProcesso } from '@/lib/processo'
import { useBots } from '@/lib/queries'
import { arroba, cn } from '@/lib/utils'
import { Button, Card, EmptyState, PageBody, PageHeader, Skeleton, Tabs } from '@/components/ui'
import { Kpi, ProcessoIcone, ResultadoBadge, SaldoChips } from '@/components/execucoes/pecas'
import {
  NOMES_ACAO,
  chaveRun,
  fmtDataCurta,
  fmtDur,
  resultadoDe,
  somarSaldos,
  useHistorico,
} from '@/components/execucoes/runUtils'

type FiltroRes = 'todos' | 'ok' | 'bloqueio' | 'erro' | 'parado'
type Periodo = 'tudo' | 'hoje' | 'ontem' | '7d' | '30d'

const RES_LABEL: Record<string, string> = { ok: 'ok', bloqueio: 'bloqueio', erro: 'erro', parado: 'parado' }
const PER_LABEL: Record<string, string> = { hoje: 'hoje', ontem: 'ontem', '7d': '7 dias', '30d': '30 dias' }
const PASSO = 120 // quantas runs renderiza por vez (o histórico pode ter milhares)

// janela [início, fim) em epoch-segundos pra cada período — igual o app
function janelaPeriodo(p: Periodo): [number, number] {
  const agora = Date.now() / 1000
  const d = new Date()
  const inicioHoje = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 1000
  if (p === 'hoje') return [inicioHoje, Infinity]
  if (p === 'ontem') return [inicioHoje - 86400, inicioHoje]
  if (p === '7d') return [agora - 7 * 86400, Infinity]
  if (p === '30d') return [agora - 30 * 86400, Infinity]
  return [0, Infinity]
}

function Select({
  value,
  onChange,
  options,
  label,
}: {
  value: string
  onChange: (v: string) => void
  options: [string, string][]
  label: string
}) {
  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'h-10 pl-3 pr-8 rounded-xl bg-surface2 border text-xs font-semibold appearance-none cursor-pointer transition-colors',
          value !== 'todos' ? 'border-primary/50 text-primary-light' : 'border-border text-txt hover:border-txt-faint/50',
        )}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v} className="bg-surface text-txt">
            {l}
          </option>
        ))}
      </select>
      <ChevronRight className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 rotate-90 text-txt-faint" />
    </label>
  )
}

export default function Historico() {
  const { data: regs, isLoading, isError, refetch, isFetching } = useHistorico()
  const { data: bots } = useBots()
  const [fBot, setFBot] = useState<string>('todos')
  const [fConta, setFConta] = useState<string>('todos')
  const [fRes, setFRes] = useState<FiltroRes>('todos')
  const [periodo, setPeriodo] = useState<Periodo>('tudo')
  const [limite, setLimite] = useState(PASSO)

  const nomeDe = (k: string) => NOMES_ACAO[k] ?? bots?.[k]?.nome ?? k

  const filtrados = useMemo(() => {
    if (!regs) return []
    const [ini, fim] = janelaPeriodo(periodo)
    return regs.filter((r) => {
      if (fBot !== 'todos' && chaveRun(r) !== fBot) return false
      if (fConta !== 'todos' && r.conta !== fConta) return false
      const t = r.ended_at ?? 0
      if (t < ini || t >= fim) return false
      if (fRes === 'ok' && !(r.status === 'finalizado' && !r.bloqueio)) return false
      if (fRes === 'bloqueio' && !r.bloqueio) return false
      if (fRes === 'erro' && !(r.status === 'erro' && !r.bloqueio)) return false
      if (fRes === 'parado' && r.status !== 'parado') return false
      return true
    })
  }, [regs, fBot, fConta, fRes, periodo])

  const resumo = useMemo(() => {
    const s = somarSaldos(filtrados)
    const bloqueios = filtrados.filter((r) => r.bloqueio).length
    return { runs: filtrados.length, bloqueios, ...s }
  }, [filtrados])

  // listagens SEMPRE ordenadas: bots pelo nome de exibição, contas em ordem natural
  const botsDisponiveis = useMemo(
    () => Array.from(new Set((regs ?? []).map(chaveRun))).sort((a, b) => cmpTexto(nomeDe(a), nomeDe(b))),
    [regs, bots],
  )
  const contasDisponiveis = useMemo(
    () => (Array.from(new Set((regs ?? []).map((r) => r.conta).filter(Boolean))) as string[]).sort(cmpTexto),
    [regs],
  )

  // runs (mais novas primeiro) agrupadas por dia — sobre o conjunto já filtrado
  const ordenados = useMemo(
    () => [...filtrados].sort((a, b) => (b.ended_at ?? 0) - (a.ended_at ?? 0)),
    [filtrados],
  )
  const grupos = useMemo(() => {
    const out: { titulo: string; runs: RunHistorico[] }[] = []
    for (const r of ordenados.slice(0, limite)) {
      const b = bucketData(r.ended_at)
      const ult = out[out.length - 1]
      if (ult && ult.titulo === b) ult.runs.push(r)
      else out.push({ titulo: b, runs: [r] })
    }
    return out
  }, [ordenados, limite])

  // filtros ATIVOS viram chips removíveis
  const chipsAtivos: { key: string; label: string; clear: () => void }[] = []
  if (fBot !== 'todos') chipsAtivos.push({ key: 'bot', label: nomeDe(fBot), clear: () => setFBot('todos') })
  if (fConta !== 'todos') chipsAtivos.push({ key: 'conta', label: `@${fConta}`, clear: () => setFConta('todos') })
  if (fRes !== 'todos') chipsAtivos.push({ key: 'res', label: RES_LABEL[fRes] ?? fRes, clear: () => setFRes('todos') })
  if (periodo !== 'tudo') chipsAtivos.push({ key: 'per', label: PER_LABEL[periodo] ?? periodo, clear: () => setPeriodo('tudo') })
  const limparTudo = () => {
    setFBot('todos')
    setFConta('todos')
    setFRes('todos')
    setPeriodo('tudo')
  }
  const chaveFiltro = `${fBot}|${fConta}|${fRes}|${periodo}`

  return (
    <>
      <PageHeader
        title="Histórico"
        subtitle="tudo que os bots já rodaram, com o saldo de cada execução"
        action={
          <Button variant="subtle" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
            Atualizar
          </Button>
        }
      />
      <PageBody className="space-y-4">
        {/* resumo do recorte */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {isLoading ? (
            [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[104px] rounded-xl2" />)
          ) : (
            <>
              <Kpi label="Execuções" icon={<ListChecks className="h-4 w-4" />} sub={resumo.bloqueios ? <span className="text-danger">{resumo.bloqueios} com bloqueio</span> : 'nenhum bloqueio'}>
                <Numero n={resumo.runs} />
              </Kpi>
              <Kpi label="Follows" icon={<UserPlus className="h-4 w-4" />} sub={resumo.pedidos ? `+ ${resumo.pedidos} pedidos` : 'seguidos pelos bots'}>
                <Numero n={resumo.follows} />
              </Kpi>
              <Kpi label="DMs" icon={<MessagesSquare className="h-4 w-4" />} sub="mensagens enviadas">
                <Numero n={resumo.dms} />
              </Kpi>
              <Kpi label="Stories" icon={<Images className="h-4 w-4" />} sub="postados no brechó">
                <Numero n={resumo.stories} />
              </Kpi>
            </>
          )}
        </div>

        {/* filtros */}
        <Card className="px-4 py-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <SlidersHorizontal className="h-4 w-4 text-txt-faint hidden sm:block" />
            <div className="max-w-full overflow-x-auto">
              <Tabs<Periodo>
                value={periodo}
                onChange={setPeriodo}
                options={[
                  { value: 'tudo', label: 'Tudo' },
                  { value: 'hoje', label: 'Hoje' },
                  { value: 'ontem', label: 'Ontem' },
                  { value: '7d', label: '7 dias' },
                  { value: '30d', label: '30 dias' },
                ]}
              />
            </div>
            <div className="max-w-full overflow-x-auto">
              <Tabs<FiltroRes>
                value={fRes}
                onChange={setFRes}
                options={[
                  { value: 'todos', label: 'Todos' },
                  { value: 'ok', label: 'ok' },
                  { value: 'bloqueio', label: 'bloqueio' },
                  { value: 'erro', label: 'erro' },
                  { value: 'parado', label: 'parado' },
                ]}
              />
            </div>
            {botsDisponiveis.length > 1 && (
              <Select
                label="Bot"
                value={fBot}
                onChange={setFBot}
                options={[['todos', 'Todos os bots'], ...botsDisponiveis.map((b) => [b, nomeDe(b)] as [string, string])]}
              />
            )}
            {contasDisponiveis.length > 1 && (
              <Select
                label="Conta"
                value={fConta}
                onChange={setFConta}
                options={[['todos', 'Todas as contas'], ...contasDisponiveis.map((c) => [c, `@${c}`] as [string, string])]}
              />
            )}
          </div>
          <AnimatePresence initial={false}>
            {chipsAtivos.length > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="flex flex-wrap items-center gap-1.5 pt-3">
                  <AnimatePresence initial={false}>
                    {chipsAtivos.map((c) => (
                      <motion.button
                        key={c.key}
                        layout
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        type="button"
                        onClick={c.clear}
                        className="inline-flex items-center gap-1 h-7 pl-2.5 pr-2 rounded-full border border-primary/50 text-primary-light text-xs font-semibold hover:bg-primary/10"
                      >
                        {c.label}
                        <X className="h-3 w-3" />
                      </motion.button>
                    ))}
                  </AnimatePresence>
                  <button type="button" onClick={limparTudo} className="ml-1 text-xs font-semibold text-txt-dim hover:text-txt">
                    Limpar tudo
                  </button>
                  <span className="ml-auto text-xs text-txt-faint tabular-nums">
                    {resumo.runs} {resumo.runs === 1 ? 'execução' : 'execuções'}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>

        {/* lista */}
        {isLoading ? (
          <Card className="p-4 space-y-2.5">
            <Skeleton className="h-4 w-24" />
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </Card>
        ) : isError ? (
          <Card>
            <EmptyState
              icon={<IconeHistorico className="h-9 w-9" />}
              title="Não consegui carregar o histórico"
              subtitle="O servidor não respondeu."
              action={<Button variant="subtle" onClick={() => refetch()}>Tentar de novo</Button>}
            />
          </Card>
        ) : !grupos.length ? (
          <Card>
            <EmptyState
              icon={<IconeHistorico className="h-9 w-9" />}
              title={regs?.length ? 'Nenhuma execução nesse filtro' : 'Nada no histórico ainda'}
              action={chipsAtivos.length ? <Button variant="subtle" onClick={limparTudo}>Limpar filtros</Button> : undefined}
            />
          </Card>
        ) : (
          <motion.div key={chaveFiltro} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }} className="space-y-4">
            {grupos.map((g, gi) => (
              <GrupoDia key={g.titulo} titulo={g.titulo} runs={g.runs} nomeDe={nomeDe} atraso={gi} />
            ))}
            {ordenados.length > limite && (
              <div className="flex justify-center pt-1">
                <Button variant="subtle" onClick={() => setLimite((l) => l + PASSO)}>
                  Mostrar mais ({ordenados.length - limite} restantes)
                </Button>
              </div>
            )}
          </motion.div>
        )}
      </PageBody>
    </>
  )
}

function Numero({ n }: { n: number }) {
  return (
    <motion.p
      key={n}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-3xl font-extrabold tracking-tight text-txt tabular-nums"
    >
      {n.toLocaleString('pt-BR')}
    </motion.p>
  )
}

function GrupoDia({
  titulo,
  runs,
  nomeDe,
  atraso,
}: {
  titulo: string
  runs: RunHistorico[]
  nomeDe: (k: string) => string
  atraso: number
}) {
  const s = somarSaldos(runs)
  const partes = [
    `${runs.length} ${runs.length === 1 ? 'execução' : 'execuções'}`,
    s.follows ? `${s.follows} follows` : null,
    s.dms ? `${s.dms} DMs` : null,
    s.stories ? `${s.stories} stories` : null,
  ].filter(Boolean)
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-4 pb-3 border-b border-border">
        <h2 className="text-[13px] font-extrabold uppercase tracking-wider text-txt">{titulo}</h2>
        <p className="text-xs text-txt-dim tabular-nums">{partes.join(' · ')}</p>
      </div>
      {/* cabeçalho da tabela (desktop) */}
      <div className="hidden md:flex items-center gap-4 px-5 py-2 text-[11px] font-bold uppercase tracking-wider text-txt-faint bg-surface2/30">
        <span className="w-7" />
        <span className="flex-1">Processo</span>
        <span className="w-[32%] hidden lg:block">Saldo</span>
        <span className="w-36 hidden xl:block">Conta</span>
        <span className="w-14 text-right">Hora</span>
        <span className="w-16 text-right">Duração</span>
        <span className="w-[92px]">Resultado</span>
        <span className="w-4" />
      </div>
      <div>
        {runs.map((r, i) => (
          <LinhaHistorico key={r.id} r={r} nomeDe={nomeDe} i={atraso === 0 ? i : 0} />
        ))}
      </div>
    </Card>
  )
}

function LinhaHistorico({ r, nomeDe, i }: { r: RunHistorico; nomeDe: (k: string) => string; i: number }) {
  // os logins antigos gravaram "Reconectar no app" → nomeDoProcesso mostra o nome novo
  const titulo = nomeDoProcesso(r.acao ?? null, r.titulo) ?? nomeDe(chaveRun(r))
  const dur = fmtDur(r.duracao_s)
  const res = resultadoDe(r)
  const saldoEl = r.acao ? (
    <span className="text-xs text-txt-dim line-clamp-2">{r.motivo || NOMES_ACAO[chaveRun(r)] || r.acao}</span>
  ) : (
    <SaldoChips saldo={r.saldo} vazio="sem saldo" />
  )
  const conteudo = (
    <>
      <ProcessoIcone run={r} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-txt truncate">
          {titulo}
          {r.dry_run && <span className="ml-2 text-[11px] font-semibold text-warn">simulação</span>}
        </p>
        <p className="text-xs text-txt-dim truncate tabular-nums">
          {r.conta && <span className="xl:hidden text-primary-light font-semibold">{arroba(r.conta)}</span>}
          {r.conta && <span className="xl:hidden md:hidden"> · </span>}
          <span className="md:hidden">
            {fmtDataCurta(r.ended_at)}
            {dur ? ` · ${dur}` : ''}
          </span>
          {r.backfill && <span className="text-txt-faint"> · importada</span>}
        </p>
        <div className="mt-1.5 lg:hidden">{saldoEl}</div>
      </div>
      <div className="w-[32%] hidden lg:block min-w-0">{saldoEl}</div>
      <span className="w-36 hidden xl:block truncate text-xs font-semibold text-primary-light">{r.conta ? arroba(r.conta) : <span className="text-txt-faint">—</span>}</span>
      <span className="w-14 hidden md:block text-right text-xs text-txt-dim tabular-nums" title={fmtDataCurta(r.ended_at)}>
        {fmtHora(r.ended_at)}
      </span>
      <span className="w-16 hidden md:block text-right text-xs text-txt-dim tabular-nums">{dur ?? '—'}</span>
      <span className="w-[92px] flex">
        <ResultadoBadge res={res} />
      </span>
      <ChevronRight className={cn('h-4 w-4 shrink-0 transition-colors', r.backfill ? 'opacity-0' : 'text-txt-faint group-hover:text-txt')} />
    </>
  )
  const cls = 'group flex items-start md:items-center gap-3 md:gap-4 px-5 py-3 border-b border-border/60 last:border-b-0 transition-colors'
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(i, 14) * 0.022 }}
    >
      {/* as importadas antigas não têm log — só o saldo */}
      {r.backfill ? (
        <div className={cls} title="Importada: sem log salvo">
          {conteudo}
        </div>
      ) : (
        <Link to={`/execucoes/${r.id}`} className={cn(cls, 'hover:bg-surface2/50')}>
          {conteudo}
        </Link>
      )}
    </motion.div>
  )
}
