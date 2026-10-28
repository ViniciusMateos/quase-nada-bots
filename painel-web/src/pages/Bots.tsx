// /bots — os bots do EMULADOR (BOTS_EMULADOR do app): cada card com o que está rodando agora (linha
// viva + progresso) e a última execução. Clique: tela própria (criar/remover conta) ou a de rodar.
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import type { Variants } from 'framer-motion'
import { ArrowUpRight, ChevronRight, Smartphone } from 'lucide-react'
import { api } from '@/lib/api'
import type { RunHistorico, RunInfo } from '@/lib/api'
import { ehProcessoDeConta } from '@/lib/processo'
import { QK, useBots, useEmulador, useRuns } from '@/lib/queries'
import { arroba, cn, tempoRelativo } from '@/lib/utils'
import { PageBody, PageHeader, Skeleton, StatusDot } from '@/components/ui'
import { BOTS_EMULADOR, ehFantasma, quandoRun, rotaDoBot, runsAtivasDoBot, tomRun } from '@/components/bots/catalogo'
import type { BotCatalogo } from '@/components/bots/catalogo'
import { RunAtivaInfo } from '@/components/bots/RunViva'
import { Etiqueta } from '@/components/bots/Pilula'

const lista: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } }
const item: Variants = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' } } }

function EmuladorChip() {
  const { data, isError, isLoading } = useEmulador()
  if (isLoading) return <Skeleton className="hidden sm:block h-9 w-44 rounded-full" />
  const online = !!data?.online && !isError
  const n = data?.contas_logadas?.length ?? 0
  return (
    <Link
      to="/visao-geral"
      className="hidden sm:flex items-center gap-2 h-9 px-3.5 rounded-full border border-border bg-surface hover:bg-surface2 transition-colors"
    >
      <Smartphone className="h-4 w-4 text-txt-dim" />
      <StatusDot tone={online ? 'ok' : 'danger'} />
      <span className="text-xs font-semibold text-txt">{online ? 'Emulador online' : 'Emulador offline'}</span>
      {online && <span className="text-xs text-txt-dim tabular-nums">· {n} conta{n === 1 ? '' : 's'}</span>}
    </Link>
  )
}

export default function Bots() {
  const bots = useBots()
  const runs = useRuns()
  const hist = useQuery({ queryKey: QK.historico(), queryFn: () => api.getHistorico(), staleTime: 30_000 })

  // última execução de verdade de cada bot (sem fantasma e sem conectar/verificar contas)
  const ultimaPorBot = useMemo(() => {
    const m = new Map<string, RunHistorico>()
    for (const r of hist.data ?? []) {
      if (ehFantasma(r) || ehProcessoDeConta(r)) continue
      const atual = m.get(r.bot)
      if (!atual || quandoRun(r) > quandoRun(atual)) m.set(r.bot, r)
    }
    return m
  }, [hist.data])

  const rodando = BOTS_EMULADOR.reduce((n, b) => n + runsAtivasDoBot(runs.data, b.id).length, 0)

  return (
    <>
      <PageHeader
        title="Bots"
        subtitle={rodando ? `${rodando} rodando agora · clique num bot pra configurar e rodar` : 'Os bots que rodam no emulador. Clique num bot pra configurar e rodar.'}
        action={<EmuladorChip />}
      />
      <PageBody>
        <motion.div variants={lista} initial="hidden" animate="show" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {BOTS_EMULADOR.map((b) => (
            <motion.div key={b.id} variants={item}>
              <CardBot
                bot={b}
                nome={bots.data?.[b.id]?.nome ?? b.nomeFallback}
                desc={bots.data?.[b.id]?.descricao ?? b.descFallback}
                ativas={runsAtivasDoBot(runs.data, b.id)}
                ultima={ultimaPorBot.get(b.id)}
                carregandoHist={hist.isLoading}
              />
            </motion.div>
          ))}
        </motion.div>
      </PageBody>
    </>
  )
}

function CardBot({ bot, nome, desc, ativas, ultima, carregandoHist }: {
  bot: BotCatalogo; nome: string; desc: string; ativas: RunInfo[]; ultima?: RunHistorico; carregandoHist: boolean
}) {
  const Icone = bot.icone
  const ligado = ativas.length > 0
  return (
    <motion.div whileHover={{ y: -3 }} transition={{ type: 'spring', stiffness: 400, damping: 28 }} className="h-full">
      <Link
        to={rotaDoBot(bot.id)}
        className={cn(
          'group flex h-full flex-col rounded-xl2 border bg-surface shadow-card transition-colors',
          ligado ? 'border-primary/40 hover:border-primary/60' : 'border-border hover:border-txt-faint/40',
        )}
      >
        <div className="flex items-start gap-3.5 p-5 pb-4">
          <div className={cn(
            'relative h-11 w-11 shrink-0 rounded-xl flex items-center justify-center transition-colors',
            ligado ? 'bg-primary text-white shadow-glow' : 'bg-primary/10 text-primary-light group-hover:bg-primary/20',
          )}>
            <Icone className="h-5 w-5" strokeWidth={2.2} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-txt truncate">{nome}</h3>
              {bot.rota && <ArrowUpRight className="h-3.5 w-3.5 text-txt-faint shrink-0" />}
            </div>
            <p className="text-[13px] leading-snug text-txt-dim mt-1 line-clamp-2">{desc}</p>
          </div>
          <ChevronRight className="h-4 w-4 mt-1 text-txt-faint shrink-0 transition-transform group-hover:translate-x-0.5" />
        </div>

        <div className="mt-auto border-t border-border px-5 py-3.5 min-h-[58px] flex flex-col justify-center">
          {ligado ? (
            <div className="space-y-3">
              {ativas.slice(0, 2).map((r) => <RunAtivaInfo key={r.id} run={r} titulo={nome} />)}
              {ativas.length > 2 && <p className="text-[11px] text-txt-dim">+{ativas.length - 2} rodando</p>}
            </div>
          ) : carregandoHist ? (
            <Skeleton className="h-4 w-2/3" />
          ) : ultima ? (
            <div className="flex items-center gap-2 text-xs min-w-0">
              <StatusDot tone={tomRun(ultima)} />
              <span className="text-txt-dim shrink-0">Última</span>
              <span className="text-txt font-semibold tabular-nums shrink-0">{tempoRelativo(quandoRun(ultima) || null)}</span>
              {ultima.conta && <span className="text-txt-dim truncate">· {arroba(ultima.conta)}</span>}
              <span className="flex-1" />
              {ultima.bloqueio
                ? <Etiqueta className="bg-danger/15 text-danger">bloqueio</Etiqueta>
                : <span className="text-txt-faint shrink-0">{ultima.status}</span>}
            </div>
          ) : (
            <p className="text-xs text-txt-faint">{bot.rota ? 'Abre a tela própria dele.' : 'Ainda não rodou.'}</p>
          )}
        </div>
      </Link>
    </motion.div>
  )
}
