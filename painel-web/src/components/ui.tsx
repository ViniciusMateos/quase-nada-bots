import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '../lib/utils'

type Variant = 'primary' | 'ghost' | 'danger' | 'subtle'
type Size = 'sm' | 'md' | 'lg' | 'icon'

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-light hover:shadow-glow',
  ghost: 'bg-transparent text-txt-dim hover:bg-surface2 hover:text-txt',
  subtle: 'bg-surface2 text-txt hover:bg-border',
  danger: 'bg-danger/15 text-danger hover:bg-danger/25',
}
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs rounded-lg gap-1.5',
  md: 'h-10 px-4 text-sm rounded-xl gap-2',
  lg: 'h-12 px-6 text-[15px] rounded-xl gap-2',
  icon: 'h-9 w-9 rounded-lg justify-center',
}

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button(
  { className, variant = 'primary', size = 'md', loading, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-semibold transition-all duration-150 active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none select-none',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
    </button>
  )
})

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'w-full h-11 px-3.5 rounded-xl bg-surface2 border border-border text-txt placeholder:text-txt-faint',
          'transition-colors focus:border-primary',
          className,
        )}
        {...rest}
      />
    )
  },
)

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function TextArea({ className, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          'w-full px-3.5 py-3 rounded-xl bg-surface2 border border-border text-txt placeholder:text-txt-faint resize-none',
          'transition-colors focus:border-primary',
          className,
        )}
        {...rest}
      />
    )
  },
)

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('bg-surface border border-border rounded-xl2 shadow-card', className)}>
      {children}
    </div>
  )
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <label className={cn('block text-xs font-semibold text-txt-dim mb-1.5', className)}>
      {children}
    </label>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('animate-spin text-primary', className)} />
}

// Logo do app (o ícone do iPhone, cantos arredondados igual ao app). Vira a marca do painel.
export function Logo({ className }: { className?: string }) {
  return <img src="/logo.png" alt="Quase Nada Bots" className={cn('rounded-[22%] object-cover', className)} draggable={false} />
}

export function EmptyState({
  icon,
  title,
  subtitle,
  action,
}: {
  icon?: ReactNode
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      {icon && <div className="mb-4 text-txt-faint">{icon}</div>}
      <p className="text-txt font-semibold">{title}</p>
      {subtitle && <p className="text-sm text-txt-dim mt-1 max-w-sm">{subtitle}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 md:px-8 pt-6 md:pt-8 pb-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-txt">{title}</h1>
        {subtitle && <p className="text-sm text-txt-dim mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export function Badge({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center h-5 px-2 rounded-full text-[11px] font-semibold',
        'bg-primary/15 text-primary-light',
        className,
      )}
    >
      {children}
    </span>
  )
}

/** Interruptor on/off (switch). */
export function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-surface2 border border-border',
      )}
    >
      <span className={cn('inline-block h-5 w-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[22px]' : 'translate-x-0.5')} />
    </button>
  )
}

/** Bolinha de status (ok / alerta / erro / neutro / ativo pulsando). */
export function StatusDot({ tone = 'neutro', pulse, className }: { tone?: 'ok' | 'warn' | 'danger' | 'neutro' | 'ativo'; pulse?: boolean; className?: string }) {
  const cor = { ok: 'bg-ok', warn: 'bg-warn', danger: 'bg-danger', neutro: 'bg-txt-faint', ativo: 'bg-primary' }[tone]
  return <span className={cn('inline-block h-2.5 w-2.5 rounded-full shrink-0', cor, pulse && 'animate-pulso', className)} />
}

/** Bloco cinza animado de carregamento. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('relative overflow-hidden rounded-lg bg-surface2', className)}>
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
    </div>
  )
}

/** Cartão com título (e ação opcional à direita) — o bloco padrão das páginas. */
export function Section({ title, subtitle, action, children, className, bodyClassName }: {
  title?: ReactNode; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string
}) {
  return (
    <Card className={cn('overflow-hidden', className)}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
          <div className="min-w-0">
            {title && <h2 className="text-[13px] font-bold uppercase tracking-wide text-txt-dim">{title}</h2>}
            {subtitle && <p className="text-xs text-txt-faint mt-0.5">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
        </div>
      )}
      <div className={cn('px-5 pb-5', !(title || action) && 'pt-5', bodyClassName)}>{children}</div>
    </Card>
  )
}

/** Abas segmentadas (pílulas). */
export function Tabs<T extends string>({ value, onChange, options, className }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string
}) {
  return (
    <div className={cn('inline-flex p-1 rounded-xl bg-surface2 border border-border gap-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'h-8 px-3 rounded-lg text-xs font-semibold transition-colors',
            value === o.value ? 'bg-primary text-white' : 'text-txt-dim hover:text-txt',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Área de conteúdo padrão de uma página (largura máxima + respiro), embaixo do PageHeader. */
export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('px-5 md:px-8 pb-10 max-w-[1400px]', className)}>{children}</div>
}
