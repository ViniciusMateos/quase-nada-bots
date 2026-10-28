// Peças visuais da área de execuções: pílula de status, barra de progresso, contagem regressiva,
// chips de saldo, badge de resultado e ícone do processo.
import { useEffect, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Ban, CircleCheck, CirclePause, CircleStop, CircleX } from 'lucide-react'
import type { Espera } from '@/lib/api'
import { STATUS_BG, cn, fmtDuracao } from '@/lib/utils'
import { chipsDoSaldo, ehAtiva, mmss, pctDe, visualDoProcesso, type Resultado } from './runUtils'

const COR_PONTO = { ok: 'bg-ok', warn: 'bg-warn', danger: 'bg-danger', neutro: 'bg-txt-faint', ativo: 'bg-primary' } as const

/** Bolinha pequena (o StatusDot do ui tem tamanho fixo de 10px). */
export function Ponto({ tone = 'neutro', pulse, className }: { tone?: keyof typeof COR_PONTO; pulse?: boolean; className?: string }) {
  return <span className={cn('inline-block h-1.5 w-1.5 rounded-full shrink-0', COR_PONTO[tone], pulse && 'animate-pulso', className)} />
}

/** Pílula do status da run (iniciando/rodando/finalizado/parado/erro), pulsando quando ativa. */
export function StatusPill({ status, className }: { status: string; className?: string }) {
  const ativa = ehAtiva({ status })
  const tone = status === 'finalizado' ? 'ok' : status === 'erro' ? 'danger' : status === 'iniciando' ? 'warn' : ativa ? 'ativo' : 'neutro'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[11px] font-semibold whitespace-nowrap',
        STATUS_BG[status] ?? 'bg-surface2 text-txt-dim',
        className,
      )}
    >
      <Ponto tone={tone} pulse={ativa} />
      {status}
    </span>
  )
}

/** Barra de progresso com o gradiente da marca + rótulo e done/total. */
export function BarraProgresso({
  done,
  total,
  label,
  compacta,
}: {
  done: number
  total: number
  label?: string
  compacta?: boolean
}) {
  const pct = pctDe({ done, total }) ?? 0
  return (
    <div className={cn('min-w-0', compacta ? 'space-y-1' : 'space-y-1.5')}>
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="truncate text-txt-dim">{label || 'Progresso'}</span>
        <span className="shrink-0 tabular-nums font-semibold text-txt">
          {done}/{total}
          <span className="text-txt-faint font-medium"> · {pct}%</span>
        </span>
      </div>
      <div className={cn('rounded-full bg-surface2 overflow-hidden', compacta ? 'h-1.5' : 'h-2')}>
        <motion.div
          className="h-full rounded-full bg-marca"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
        />
      </div>
    </div>
  )
}

/** Contagem regressiva de uma pausa: ticka a cada 1s em cima do `ate` (epoch s) do backend. */
export function Contagem({ espera, compacta, className }: { espera: Espera; compacta?: boolean; className?: string }) {
  const [restam, setRestam] = useState(() => Math.max(0, espera.ate - Date.now() / 1000))
  useEffect(() => {
    const calc = () => setRestam(Math.max(0, espera.ate - Date.now() / 1000))
    calc()
    const id = setInterval(calc, 1000)
    return () => clearInterval(id)
  }, [espera.ate])
  const txt = restam > 0 ? `pausa · faltam ${mmss(restam)}` : 'voltando…'
  const mot = espera.motivo ? ` (${espera.motivo})` : ''
  if (compacta) {
    return (
      <p className={cn('text-xs font-mono text-warn truncate tabular-nums', className)} title={txt + mot}>
        {txt}
        {mot}
      </p>
    )
  }
  return (
    <div className={cn('flex items-center gap-2 text-warn min-w-0', className)}>
      <CirclePause className="h-4 w-4 shrink-0" />
      <span className="text-sm font-semibold truncate tabular-nums">
        {txt}
        <span className="font-medium opacity-80">{mot}</span>
      </span>
    </div>
  )
}

/** Duração de uma run ativa, andando a cada segundo. */
export function DuracaoViva({ desde, ate }: { desde?: number | null; ate?: number | null }) {
  const [agora, setAgora] = useState(() => Date.now() / 1000)
  useEffect(() => {
    if (ate) return
    const id = setInterval(() => setAgora(Date.now() / 1000), 1000)
    return () => clearInterval(id)
  }, [ate])
  if (!desde) return <>—</>
  const s = (ate ?? agora) - desde
  // abaixo de 1h mostra os segundos andando (o fmtDuracao arredonda pra minuto)
  if (s < 3600) {
    const m = Math.floor(s / 60), seg = Math.floor(s % 60)
    return <>{m ? `${m}min ${String(seg).padStart(2, '0')}s` : `${seg}s`}</>
  }
  return <>{fmtDuracao(s)}</>
}

/** Chips do saldo de uma run ("12 follows", "3 DMs"…). */
export function SaldoChips({
  saldo,
  className,
  vazio,
}: {
  saldo?: Record<string, number | string> | null
  className?: string
  vazio?: string
}) {
  const chips = chipsDoSaldo(saldo)
  if (!chips.length) return vazio ? <span className="text-xs text-txt-faint">{vazio}</span> : null
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {chips.map((c) => (
        <span
          key={c.key}
          className={cn(
            'inline-flex items-baseline gap-1 h-6 px-2 rounded-md text-[11px] border leading-6',
            c.tom === 'bom' && 'border-ok/25 bg-ok/10 text-ok',
            c.tom === 'ruim' && 'border-danger/25 bg-danger/10 text-danger',
            c.tom === 'neutro' && 'border-border bg-surface2 text-txt-dim',
          )}
        >
          <span className="font-bold tabular-nums">{c.valor}</span>
          <span>{c.rotulo}</span>
        </span>
      ))}
    </div>
  )
}

const RES: Record<Resultado, { Icon: typeof CircleCheck; label: string; cls: string }> = {
  ok: { Icon: CircleCheck, label: 'ok', cls: 'bg-ok/10 text-ok border-ok/25' },
  bloqueio: { Icon: Ban, label: 'bloqueio', cls: 'bg-danger/10 text-danger border-danger/30' },
  erro: { Icon: CircleX, label: 'erro', cls: 'bg-danger/10 text-danger border-danger/30' },
  parado: { Icon: CircleStop, label: 'parado', cls: 'bg-surface2 text-txt-dim border-border' },
}

/** Badge do resultado de uma run do histórico (ok / bloqueio / erro / parado). */
export function ResultadoBadge({ res, className }: { res: Resultado; className?: string }) {
  const r = RES[res]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 h-6 px-2 rounded-full border text-[11px] font-semibold whitespace-nowrap',
        r.cls,
        className,
      )}
    >
      <r.Icon className="h-3.5 w-3.5" />
      {r.label}
    </span>
  )
}

/** Cartão de KPI (rótulo, número grande, linha de apoio e ícone). */
export function Kpi({
  label,
  icon,
  children,
  sub,
  className,
  tone,
}: {
  label: string
  icon?: ReactNode
  children: ReactNode
  sub?: ReactNode
  className?: string
  tone?: 'ok' | 'danger' | 'ativo' | 'neutro'
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl2 border border-border bg-surface shadow-card p-4 md:p-5',
        'transition-colors hover:border-txt-faint/40',
        className,
      )}
    >
      {tone && tone !== 'neutro' && (
        <div
          className={cn(
            'pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full blur-3xl opacity-25',
            tone === 'ok' && 'bg-ok',
            tone === 'danger' && 'bg-danger',
            tone === 'ativo' && 'bg-primary',
          )}
        />
      )}
      <div className="relative flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-txt-dim">{label}</p>
        {icon && <div className="text-txt-faint">{icon}</div>}
      </div>
      <div className="relative mt-2.5">{children}</div>
      {sub && <div className="relative mt-1.5 text-xs text-txt-dim min-w-0">{sub}</div>}
    </div>
  )
}

/** Quadradinho com o ícone do processo (cor por bot/ação). */
export function ProcessoIcone({
  run,
  className,
  size = 'md',
}: {
  run: { bot?: string | null; params?: Record<string, unknown> | null; acao?: string | null }
  className?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const { Icon, cor, fundo } = visualDoProcesso(run)
  const box = { sm: 'h-7 w-7 rounded-lg', md: 'h-9 w-9 rounded-xl', lg: 'h-11 w-11 rounded-xl' }[size]
  const ic = { sm: 'h-3.5 w-3.5', md: 'h-[18px] w-[18px]', lg: 'h-5 w-5' }[size]
  return (
    <div className={cn('flex items-center justify-center shrink-0', box, fundo, className)}>
      <Icon className={cn(ic, cor)} strokeWidth={2.2} />
    </div>
  )
}
