// "Últimas runs" do bot: as 10 mais novas (sem as fantasmas), com cabeçalho por dia — igual o
// cartão do BotScreen, com mais detalhe por linha no desktop (status, duração, saldo).
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronRight, CircleUser, History } from 'lucide-react'
import type { RunHistorico } from '@/lib/api'
import { bucketData, fmtHora } from '@/lib/datas'
import { acaoDe, ehProcessoDeConta, nomeDoProcesso } from '@/lib/processo'
import { arroba, cn, fmtDuracao, STATUS_COR } from '@/lib/utils'
import { EmptyState, Skeleton, StatusDot } from '@/components/ui'
import { Etiqueta } from './Pilula'
import { ehFantasma, quandoRun, tomRun } from './catalogo'

type Linha = RunHistorico | { _header: string }

function saldoCurto(s: Record<string, number | string> | undefined): string {
  const pares = Object.entries(s || {}).filter(([, v]) => v !== '' && v !== null && v !== undefined)
  return pares.slice(0, 3).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(' · ')
}

export function UltimasRuns({ historico, carregando, erro, onTentar }: {
  historico: RunHistorico[] | undefined; carregando: boolean; erro?: boolean; onTentar?: () => void
}) {
  const nav = useNavigate()
  const linhas = useMemo<Linha[]>(() => {
    if (!historico?.length) return []
    const ord = historico.filter((r) => !ehFantasma(r)).sort((a, b) => quandoRun(b) - quandoRun(a)).slice(0, 10)
    const out: Linha[] = []
    let atual: string | null = null
    for (const r of ord) {
      const b = bucketData(quandoRun(r) || null)
      if (b !== atual) { out.push({ _header: b }); atual = b }
      out.push(r)
    }
    return out
  }, [historico])

  if (carregando && !historico) {
    return <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>
  }
  if (erro && !historico) {
    return (
      <div className="flex items-center justify-between gap-3 py-2">
        <p className="text-sm text-txt-dim">Não consegui puxar o histórico.</p>
        {onTentar && <button onClick={onTentar} className="text-xs font-bold text-primary-light hover:underline">tentar de novo</button>}
      </div>
    )
  }
  if (!linhas.length) {
    return <EmptyState icon={<History className="h-8 w-8" />} title="Esse bot ainda não rodou." />
  }

  return (
    <div className="-mx-2">
      {linhas.map((item, i) => {
        if ('_header' in item) {
          return (
            <p key={`h:${item._header}:${i}`} className="px-2 pt-3 pb-1 first:pt-0 text-[11px] font-extrabold uppercase tracking-wider text-txt-faint">
              {item._header}
            </p>
          )
        }
        const r = item
        const processo = ehProcessoDeConta(r) ? nomeDoProcesso(acaoDe(r), r.titulo) : null
        const saldo = saldoCurto(r.saldo)
        return (
          <motion.button
            key={r.id}
            type="button"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i, 12) * 0.025 }}
            disabled={r.backfill}
            onClick={() => nav(`/execucoes/${r.id}`)}
            className={cn(
              'w-full flex items-center gap-3 px-2 py-2.5 rounded-lg text-left transition-colors',
              !r.backfill && 'hover:bg-surface2',
            )}
          >
            <StatusDot tone={tomRun(r)} />
            <CircleUser className="h-4 w-4 text-primary-light shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-semibold text-txt truncate">{r.conta ? arroba(r.conta) : 'conta ?'}</span>
                {r.dry_run && <Etiqueta className="bg-surface2 text-txt-dim">simulação</Etiqueta>}
                {r.bloqueio && <Etiqueta className="bg-danger/15 text-danger">bloqueio</Etiqueta>}
                {processo && <Etiqueta className="bg-roxo/20 text-txt-dim">{processo}</Etiqueta>}
              </div>
              {saldo && <p className="text-[11px] text-txt-faint truncate mt-0.5">{saldo}</p>}
            </div>
            <span className={cn('hidden sm:block text-[11px] font-semibold', STATUS_COR[r.status] ?? 'text-txt-dim')}>{r.status}</span>
            <span className="hidden md:block w-16 text-right text-xs text-txt-dim tabular-nums">{fmtDuracao(r.duracao_s)}</span>
            <span className="w-11 text-right text-xs text-txt-dim tabular-nums">{fmtHora(quandoRun(r) || null)}</span>
            <ChevronRight className={cn('h-4 w-4 shrink-0', r.backfill ? 'opacity-0' : 'text-txt-faint')} />
          </motion.button>
        )
      })}
    </div>
  )
}
