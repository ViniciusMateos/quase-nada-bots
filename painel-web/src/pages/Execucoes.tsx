// Execuções: as ATIVAS no topo (progresso, linha viva, parar) e as recentes que o servidor ainda
// tem na memória embaixo. Clique abre /execucoes/:runId. O histórico completo mora em /historico.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Activity, ChevronRight, Clock, History, Play } from 'lucide-react'
import type { RunHistorico, RunInfo } from '@/lib/api'
import { useBots, useContas, useRuns } from '@/lib/queries'
import { arroba, cn, fmtDataHora, fmtDuracao, tempoRelativo } from '@/lib/utils'
import { Button, EmptyState, PageBody, PageHeader, Section, Skeleton, Tabs } from '@/components/ui'
import { ListaRunsAtivas } from '@/components/execucoes/RunAtiva'
import { ProcessoIcone, ResultadoBadge, SaldoChips, StatusPill } from '@/components/execucoes/pecas'
import {
  contaDosParams,
  ehAtiva,
  resultadoDe,
  tituloDaRun,
  useHistorico,
  useHistoricoAoTerminar,
} from '@/components/execucoes/runUtils'

type Filtro = 'todas' | 'finalizado' | 'erro' | 'parado'

export default function Execucoes() {
  const { data: runs, isLoading, isError, refetch } = useRuns()
  const { data: bots } = useBots()
  const { data: contas } = useContas()
  const { data: hist } = useHistorico()
  const [filtro, setFiltro] = useState<Filtro>('todas')

  const ativas = useMemo(
    () => (runs ?? []).filter(ehAtiva).sort((a, b) => b.started_at - a.started_at),
    [runs],
  )
  useHistoricoAoTerminar(ativas)
  const terminadas = useMemo(
    () => (runs ?? []).filter((r) => !ehAtiva(r)).sort((a, b) => (b.ended_at ?? b.started_at) - (a.ended_at ?? a.started_at)),
    [runs],
  )
  const visiveis = filtro === 'todas' ? terminadas : terminadas.filter((r) => r.status === filtro)
  const porId = useMemo(() => new Map((hist ?? []).map((h) => [h.id, h])), [hist])
  const cont = (s: string) => terminadas.filter((r) => r.status === s).length

  return (
    <>
      <PageHeader
        title="Execuções"
        subtitle={
          ativas.length
            ? `${ativas.length} rodando agora · ${terminadas.length} recentes`
            : 'o que está rodando e o que rodou desde que o servidor subiu'
        }
        action={
          <Link to="/historico">
            <Button variant="subtle" size="sm">
              <History className="h-3.5 w-3.5" />
              Histórico completo
            </Button>
          </Link>
        }
      />
      <PageBody className="space-y-4">
        {/* ── ativas ── */}
        <Section
          title={
            <span className="inline-flex items-center gap-2">
              Rodando agora
              {ativas.length > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/15 px-1.5 text-[11px] font-bold text-primary-light normal-case tabular-nums">
                  {ativas.length}
                </span>
              )}
            </span>
          }
        >
          {isLoading ? (
            <div className="grid gap-3 lg:grid-cols-2">
              <Skeleton className="h-[132px] rounded-xl" />
              <Skeleton className="h-[132px] rounded-xl hidden lg:block" />
            </div>
          ) : isError ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3">
              <p className="text-sm text-danger">Não consegui falar com o servidor.</p>
              <Button variant="subtle" size="sm" onClick={() => refetch()}>
                Tentar de novo
              </Button>
            </div>
          ) : ativas.length ? (
            <ListaRunsAtivas runs={ativas} bots={bots} comParar className="lg:grid-cols-2" />
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border px-4 py-5">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-surface2 flex items-center justify-center">
                  <Activity className="h-[18px] w-[18px] text-txt-faint" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-txt">Nada rodando agora</p>
                  <p className="text-xs text-txt-dim">Dispare um bot e ele aparece aqui na hora.</p>
                </div>
              </div>
              <Link to="/bots">
                <Button size="sm">
                  <Play className="h-3.5 w-3.5 fill-current" />
                  Abrir bots
                </Button>
              </Link>
            </div>
          )}
        </Section>

        {/* ── recentes ── */}
        <Section
          title="Recentes"
          subtitle="o que o servidor ainda tem na memória (some quando ele reinicia)"
          action={
            terminadas.length > 0 ? (
              <Tabs<Filtro>
                value={filtro}
                onChange={setFiltro}
                options={[
                  { value: 'todas', label: `Todas ${terminadas.length}` },
                  { value: 'finalizado', label: `Ok ${cont('finalizado')}` },
                  { value: 'erro', label: `Erro ${cont('erro')}` },
                  { value: 'parado', label: `Parado ${cont('parado')}` },
                ]}
                className="hidden sm:inline-flex"
              />
            ) : undefined
          }
          bodyClassName="px-0 pb-2"
        >
          {terminadas.length > 0 && (
            <div className="px-5 pb-3 sm:hidden">
              <Tabs<Filtro>
                value={filtro}
                onChange={setFiltro}
                options={[
                  { value: 'todas', label: 'Todas' },
                  { value: 'finalizado', label: 'Ok' },
                  { value: 'erro', label: 'Erro' },
                  { value: 'parado', label: 'Parado' },
                ]}
              />
            </div>
          )}
          {isLoading ? (
            <div className="px-5 space-y-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-14 rounded-lg" />
              ))}
            </div>
          ) : !visiveis.length ? (
            <EmptyState
              icon={<Clock className="h-9 w-9" />}
              title={terminadas.length ? 'Nada nesse filtro' : 'Nenhuma execução recente'}
              subtitle={terminadas.length ? undefined : 'As anteriores ao último restart do servidor estão no histórico.'}
              action={
                !terminadas.length ? (
                  <Link to="/historico">
                    <Button variant="subtle" size="sm">Ver histórico</Button>
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <>
              {/* cabeçalho da tabela (desktop) */}
              <div className="hidden md:flex items-center gap-4 px-5 pb-2 text-[11px] font-bold uppercase tracking-wider text-txt-faint border-b border-border">
                <span className="w-7" />
                <span className="flex-1">Processo</span>
                <span className="w-[30%] hidden lg:block">Saldo</span>
                <span className="w-36 hidden xl:block">Conta</span>
                <span className="w-24 text-right">Início</span>
                <span className="w-20 text-right">Duração</span>
                <span className="w-24">Status</span>
                <span className="w-4" />
              </div>
              <motion.div key={filtro} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}>
                {visiveis.map((r, i) => (
                  <LinhaRecente
                    key={r.id}
                    run={r}
                    i={i}
                    titulo={tituloDaRun(r, bots)}
                    conta={porId.get(r.id)?.conta ? arroba(porId.get(r.id)!.conta!) : contaDosParams(r.params, contas)}
                    hist={porId.get(r.id)}
                  />
                ))}
              </motion.div>
            </>
          )}
        </Section>
      </PageBody>
    </>
  )
}

function LinhaRecente({
  run,
  i,
  titulo,
  conta,
  hist,
}: {
  run: RunInfo
  i: number
  titulo: string
  conta: string | null
  hist?: RunHistorico
}) {
  const dur = run.ended_at ? run.ended_at - run.started_at : null
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(i, 12) * 0.025 }}
    >
      <Link
        to={`/execucoes/${run.id}`}
        className="group flex items-center gap-3 md:gap-4 px-5 py-3 border-b border-border/60 last:border-b-0 hover:bg-surface2/50 transition-colors"
      >
        <ProcessoIcone run={run} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-txt truncate">{titulo}</p>
          <p className="text-xs text-txt-dim truncate tabular-nums">
            {conta && <span className="xl:hidden text-primary-light font-semibold">{conta} · </span>}
            <span className="md:hidden">{tempoRelativo(run.started_at)} · {fmtDuracao(dur)}</span>
            <span className="hidden md:inline">{run.id}</span>
          </p>
          {hist && <SaldoChips saldo={hist.saldo} className="mt-1.5 lg:hidden" />}
        </div>
        <div className="w-[30%] hidden lg:block min-w-0">
          {hist ? (
            hist.acao ? (
              <span className="text-xs text-txt-dim truncate block">{hist.motivo || '—'}</span>
            ) : (
              <SaldoChips saldo={hist.saldo} vazio="sem saldo" />
            )
          ) : (
            <span className="text-xs text-txt-faint">—</span>
          )}
        </div>
        <span className="w-36 hidden xl:block truncate text-xs font-semibold text-primary-light">{conta ?? '—'}</span>
        <span className="w-24 hidden md:block text-right text-xs text-txt-dim tabular-nums" title={fmtDataHora(run.started_at)}>
          {fmtDataHora(run.started_at).split(' ')[1]}
          <span className="block text-[10.5px] text-txt-faint">{tempoRelativo(run.started_at)}</span>
        </span>
        <span className="w-20 hidden md:block text-right text-xs text-txt-dim tabular-nums">{fmtDuracao(dur)}</span>
        <span className="w-24 flex items-center">
          {hist?.bloqueio ? <ResultadoBadge res={resultadoDe(hist)} /> : <StatusPill status={run.status} />}
        </span>
        <ChevronRight className={cn('h-4 w-4 text-txt-faint group-hover:text-txt transition-colors shrink-0')} />
      </Link>
    </motion.div>
  )
}
