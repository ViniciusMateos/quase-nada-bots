import type { ReactNode } from 'react'
import { CheckCheck, Clock, Hourglass, Pause, Play, SkipForward, Timer, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Estado } from './plano'

type Meta = {
  label: string        // texto do estado (os do app: "rodou automático", "pulado", "roda automático", "pausado")
  icon: LucideIcon
  badge: string        // classes da pílula
  dot: string          // classes do marcador na linha do tempo
  barra: string        // cor da barra de duração da run
  pulse?: boolean
}

export const ESTADO: Record<Estado, Meta> = {
  rodando: { label: 'rodando agora', icon: Play, badge: 'bg-primary/15 text-primary-light', dot: 'bg-primary border-primary shadow-glow', barra: 'bg-primary/60', pulse: true },
  feita: { label: 'rodou automático', icon: CheckCheck, badge: 'bg-ok/15 text-ok', dot: 'bg-ok border-ok', barra: 'bg-ok/45' },
  pulada: { label: 'pulado', icon: SkipForward, badge: 'bg-surface2 text-txt-faint', dot: 'bg-bg border-txt-faint border-dashed', barra: 'bg-txt-faint/40' },
  esperando: { label: 'esperando vaga', icon: Hourglass, badge: 'bg-warn/15 text-warn', dot: 'bg-warn border-warn', barra: 'bg-warn/45', pulse: true },
  comecando: { label: 'começando', icon: Timer, badge: 'bg-warn/15 text-warn', dot: 'bg-warn border-warn', barra: 'bg-warn/45', pulse: true },
  proxima: { label: 'próxima', icon: Clock, badge: 'bg-primary/15 text-primary-light ring-1 ring-primary/40', dot: 'bg-surface border-primary ring-4 ring-primary/20', barra: 'bg-primary/45' },
  futura: { label: 'roda automático', icon: Clock, badge: 'bg-surface2 text-txt-dim', dot: 'bg-surface border-txt-dim', barra: 'bg-txt-dim/40' },
  pausada: { label: 'pausado', icon: Pause, badge: 'bg-surface2 text-txt-faint', dot: 'bg-surface border-txt-faint', barra: 'bg-txt-faint/40' },
}

/** Ordem da legenda da linha do tempo. */
export const ESTADOS_LEGENDA: Estado[] = ['feita', 'rodando', 'esperando', 'proxima', 'futura', 'pulada', 'pausada']

export function EstadoBadge({ estado, className }: { estado: Estado; className?: string }) {
  const m = ESTADO[estado]
  const Icon = m.icon
  return (
    <span className={cn('inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11px] font-semibold whitespace-nowrap', m.badge, className)}>
      <Icon className={cn('h-3.5 w-3.5', m.pulse && 'animate-pulso')} strokeWidth={2.4} />
      {m.label}
    </span>
  )
}

/** Bolinha do estado (marcador da linha do tempo / legenda). */
export function EstadoDot({ estado, pequeno, className }: { estado: Estado; pequeno?: boolean; className?: string }) {
  const m = ESTADO[estado]
  return (
    <span
      className={cn('inline-block rounded-full border-2 shrink-0', pequeno ? 'h-2.5 w-2.5' : 'h-3 w-3', m.dot, m.pulse && 'animate-pulso', className)}
    />
  )
}

/**
 * Pílula neutra/colorida. (O Badge do ui.tsx tem fundo rosa fixo e o Tailwind não deixa o
 * bg-surface2 passar por cima dele — por isso esta, com as cores escolhidas por `tom`.)
 */
export function Pilula({ tom = 'neutro', className, children }: {
  tom?: 'ok' | 'neutro' | 'fraco' | 'warn' | 'marca'; className?: string; children: ReactNode
}) {
  const cores = {
    ok: 'bg-ok/15 text-ok',
    neutro: 'bg-surface2 text-txt-dim',
    fraco: 'bg-surface2 text-txt-faint',
    warn: 'bg-warn/15 text-warn',
    marca: 'bg-primary/15 text-primary-light',
  }[tom]
  return (
    <span className={cn('inline-flex items-center h-5 px-2 rounded-full text-[11px] font-semibold whitespace-nowrap', cores, className)}>
      {children}
    </span>
  )
}
