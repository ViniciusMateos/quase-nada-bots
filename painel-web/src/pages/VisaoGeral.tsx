// Visão geral — a "home" do painel (a aba Emulador do app): KPIs do emulador/contas/execuções/dia,
// o que está rodando agora (linha viva + contagem + barra), as contas do emulador com o
// "Verificar e sincronizar", atalhos pros bots e as últimas execuções.
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Activity, CalendarDays, Smartphone, Users } from 'lucide-react'
import { useBots, useEmulador, useRunsAtivas } from '@/lib/queries'
import { cn, tempoRelativo } from '@/lib/utils'
import { PageBody, PageHeader, Section, Skeleton, StatusDot } from '@/components/ui'
import { ContasEmulador } from '@/components/execucoes/ContasEmulador'
import { ListaRunsAtivas } from '@/components/execucoes/RunAtiva'
import { Kpi } from '@/components/execucoes/pecas'
import { AtalhosBots, NadaRodando, UltimasRuns } from '@/components/execucoes/VisaoBlocos'
import {
  inicioDeHoje,
  somarSaldos,
  tituloDaRun,
  useHistorico,
  useHistoricoAoTerminar,
  type EmuladorStatusExt,
} from '@/components/execucoes/runUtils'

// teto de contas logadas no app do IG por aparelho (~10 — o Remover Contas existe pra liberar vaga)
const TETO_CONTAS = 10

const entrada = {
  hidden: { opacity: 0, y: 8 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { duration: 0.25, delay: i * 0.05 } }),
}

export default function VisaoGeral() {
  const { data: statusRaw, isError: semStatus, isLoading: carregandoStatus } = useEmulador()
  const status = statusRaw as EmuladorStatusExt | undefined
  const { ativas, isLoading: carregandoRuns } = useRunsAtivas()
  const { data: bots } = useBots()
  const { data: hist, isLoading: carregandoHist } = useHistorico()
  useHistoricoAoTerminar(ativas)

  const ativasOrd = useMemo(() => [...ativas].sort((a, b) => b.started_at - a.started_at), [ativas])

  // resumo de HOJE (somando o saldo das runs que terminaram hoje)
  const hoje = useMemo(() => {
    const ini = inicioDeHoje()
    const regs = (hist ?? []).filter((r) => (r.ended_at ?? 0) >= ini)
    return { runs: regs.length, bloqueios: regs.filter((r) => r.bloqueio).length, ...somarSaldos(regs) }
  }, [hist])

  const online = !!status?.online && !semStatus
  const statusTxt = semStatus ? 'indisponível' : online ? 'online' : 'offline'
  const statusSub = semStatus ? 'sem status do PC agora' : online ? 'conectado e pronto pra rodar' : 'o PC não está respondendo'
  const logadas = (status?.contas_logadas ?? []).length
  const pendentes = status?.fila?.pendentes ?? 0

  return (
    <>
      <PageHeader title="Visão geral" subtitle="o emulador, as contas e o que os bots estão fazendo" />
      <PageBody className="space-y-4">
        {/* ── KPIs ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <motion.div custom={0} variants={entrada} initial="hidden" animate="show">
            <Kpi
              label="Emulador"
              icon={<Smartphone className="h-4 w-4" />}
              tone={semStatus ? 'neutro' : online ? 'ok' : 'danger'}
              sub={
                carregandoStatus ? (
                  <Skeleton className="h-3 w-40" />
                ) : (
                  <span className="block truncate">
                    {statusSub}
                    {status?.ultimo_ping ? ` · ${tempoRelativo(status.ultimo_ping)}` : ''}
                  </span>
                )
              }
            >
              {carregandoStatus ? (
                <Skeleton className="h-8 w-28" />
              ) : (
                <div className="flex items-center gap-2.5">
                  <StatusDot tone={semStatus ? 'neutro' : online ? 'ok' : 'danger'} pulse={online} className="h-3 w-3" />
                  <span className="text-2xl font-extrabold tracking-tight text-txt">{statusTxt}</span>
                  {pendentes > 0 && (
                    <span className="ml-auto text-[11px] font-semibold text-warn tabular-nums">{pendentes} na fila</span>
                  )}
                </div>
              )}
            </Kpi>
          </motion.div>

          <motion.div custom={1} variants={entrada} initial="hidden" animate="show">
            <Kpi
              label="Contas logadas"
              icon={<Users className="h-4 w-4" />}
              sub={
                status?.conta_ativa ? (
                  <span className="block truncate">
                    ativa agora: <span className="text-primary-light font-semibold">@{status.conta_ativa}</span>
                  </span>
                ) : (
                  'no app do Instagram do emulador'
                )
              }
            >
              {carregandoStatus ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <>
                  <p className="text-3xl font-extrabold tracking-tight text-txt tabular-nums">
                    {semStatus ? '—' : logadas}
                    <span className="text-base font-bold text-txt-faint"> de {TETO_CONTAS}</span>
                  </p>
                  <div className="mt-2 h-1.5 rounded-full bg-surface2 overflow-hidden">
                    <motion.div
                      className={cn('h-full rounded-full', logadas >= TETO_CONTAS ? 'bg-warn' : 'bg-marca')}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, (logadas / TETO_CONTAS) * 100)}%` }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                    />
                  </div>
                </>
              )}
            </Kpi>
          </motion.div>

          <motion.div custom={2} variants={entrada} initial="hidden" animate="show">
            <Link to="/execucoes" className="block">
              <Kpi
                label="Rodando agora"
                icon={<Activity className="h-4 w-4" />}
                tone={ativas.length ? 'ativo' : 'neutro'}
                sub={
                  <span className="block truncate">
                    {ativasOrd.length
                      ? ativasOrd.map((r) => tituloDaRun(r, bots)).join(' · ')
                      : 'nenhuma execução ativa'}
                  </span>
                }
              >
                {carregandoRuns ? (
                  <Skeleton className="h-8 w-12" />
                ) : (
                  <div className="flex items-center gap-2.5">
                    <p className="text-3xl font-extrabold tracking-tight text-txt tabular-nums">{ativas.length}</p>
                    {ativas.length > 0 && <StatusDot tone="ativo" pulse />}
                  </div>
                )}
              </Kpi>
            </Link>
          </motion.div>

          <motion.div custom={3} variants={entrada} initial="hidden" animate="show">
            <Link to="/historico" className="block">
              <Kpi
                label="Hoje"
                icon={<CalendarDays className="h-4 w-4" />}
                sub={
                  carregandoHist ? (
                    <Skeleton className="h-3 w-28" />
                  ) : (
                    <span>
                      {hoje.runs} {hoje.runs === 1 ? 'execução' : 'execuções'}
                      {hoje.bloqueios ? <span className="text-danger"> · {hoje.bloqueios} bloqueio{hoje.bloqueios === 1 ? '' : 's'}</span> : null}
                    </span>
                  )
                }
              >
                {carregandoHist ? (
                  <Skeleton className="h-8 w-full" />
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    <MiniNum n={hoje.follows} label="follows" />
                    <MiniNum n={hoje.dms} label="DMs" />
                    <MiniNum n={hoje.stories} label="stories" />
                  </div>
                )}
              </Kpi>
            </Link>
          </motion.div>
        </div>

        {/* ── corpo ── */}
        <div className="grid gap-4 lg:grid-cols-3 items-start">
          <div className="lg:col-span-2 space-y-4 min-w-0">
            <motion.div custom={4} variants={entrada} initial="hidden" animate="show">
              <Section
                title="Rodando agora"
                action={
                  ativas.length ? (
                    <Link to="/execucoes" className="text-xs font-semibold text-txt-dim hover:text-txt transition-colors">
                      ver execuções
                    </Link>
                  ) : undefined
                }
              >
                {carregandoRuns ? (
                  <Skeleton className="h-[120px] rounded-xl" />
                ) : ativasOrd.length ? (
                  <ListaRunsAtivas runs={ativasOrd} bots={bots} className={ativasOrd.length > 1 ? 'xl:grid-cols-2' : undefined} />
                ) : (
                  <NadaRodando />
                )}
              </Section>
            </motion.div>

            <motion.div custom={5} variants={entrada} initial="hidden" animate="show">
              <UltimasRuns regs={hist} carregando={carregandoHist} bots={bots} />
            </motion.div>
          </div>

          <div className="space-y-4 min-w-0">
            <motion.div custom={5} variants={entrada} initial="hidden" animate="show">
              <ContasEmulador />
            </motion.div>
            <motion.div custom={6} variants={entrada} initial="hidden" animate="show">
              <AtalhosBots bots={bots} ativas={ativas} />
            </motion.div>
          </div>
        </div>
      </PageBody>
    </>
  )
}

function MiniNum({ n, label }: { n: number; label: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xl font-extrabold tracking-tight text-txt tabular-nums leading-tight">{n.toLocaleString('pt-BR')}</p>
      <p className="text-[11px] text-txt-faint truncate">{label}</p>
    </div>
  )
}
