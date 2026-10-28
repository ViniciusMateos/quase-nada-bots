// Peças pequenas da área de Contas (só desta área — as compartilhadas ficam em components/ui).
import { Fragment, forwardRef, useCallback, useState } from 'react'
import type { ReactNode, SelectHTMLAttributes } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Check, ChevronDown, ChevronRight, Eye, EyeOff, type LucideIcon } from 'lucide-react'
import { Input, Label, PageHeader } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { Tom } from './modelo'

const COR_TXT: Record<Tom, string> = { ok: 'text-ok', warn: 'text-warn', danger: 'text-danger', neutro: 'text-txt-dim' }
const COR_BG: Record<Tom, string> = { ok: 'bg-ok', warn: 'bg-warn', danger: 'bg-danger', neutro: 'bg-txt-faint' }

/** Selo de estado (pílula com bolinha na cor do estado). `pulse` = ainda verificando. */
export function Selo({ texto, tom, pulse, className }: { texto: string; tom: Tom; pulse?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full border border-border bg-surface2 text-[11px] font-semibold whitespace-nowrap',
        COR_TXT[tom],
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', COR_BG[tom], pulse && 'animate-pulso')} />
      {texto}
    </span>
  )
}

/** Etiqueta de grupo (neutra). */
export function TagGrupo({ nome }: { nome: string }) {
  return (
    <span className="inline-flex items-center h-5 px-2 rounded-md bg-surface2 border border-border text-[11px] font-semibold text-txt-dim whitespace-nowrap">
      {nome}
    </span>
  )
}

/** Botão só de ícone, com dica (title) — ações por linha. */
export function IconBtn({
  title,
  onClick,
  tom = 'neutro',
  disabled,
  children,
}: {
  title: string
  onClick: () => void
  tom?: 'neutro' | 'marca' | 'danger'
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={(ev) => {
        ev.stopPropagation()
        onClick()
      }}
      className={cn(
        'h-8 w-8 inline-flex items-center justify-center rounded-lg transition-colors shrink-0 disabled:opacity-40 disabled:pointer-events-none',
        tom === 'danger' && 'text-txt-dim hover:text-danger hover:bg-danger/10',
        tom === 'marca' && 'text-primary-light hover:bg-primary/10',
        tom === 'neutro' && 'text-txt-dim hover:text-txt hover:bg-surface2',
      )}
    >
      {children}
    </button>
  )
}

/** Caixinha de marcar (visual; o clique fica no elemento pai). */
export function Caixa({ marcado, tom = 'marca' }: { marcado: boolean; tom?: 'marca' | 'danger' }) {
  return (
    <span
      className={cn(
        'h-[18px] w-[18px] rounded-md border flex items-center justify-center transition-colors shrink-0',
        marcado ? (tom === 'danger' ? 'bg-danger border-danger' : 'bg-primary border-primary') : 'border-txt-faint',
      )}
    >
      {marcado && (
        <motion.span initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.14 }}>
          <Check className="h-3 w-3 text-white" strokeWidth={3.5} />
        </motion.span>
      )}
    </span>
  )
}

/** <select> nativo com a cara do painel (tema escuro, seta própria). */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { compacto?: boolean }>(
  function Select({ className, children, compacto, ...rest }, ref) {
    return (
      <div className={cn('relative min-w-0', className)}>
        <select
          ref={ref}
          style={{ colorScheme: 'dark' }}
          className={cn(
            'w-full appearance-none bg-surface2 border border-border text-txt rounded-xl pl-3.5 pr-9 cursor-pointer tabular-nums',
            'transition-colors hover:border-txt-faint focus:border-primary [&>option]:bg-surface',
            compacto ? 'h-10 text-sm' : 'h-11',
          )}
          {...rest}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-txt-dim" />
      </div>
    )
  },
)

/** Rótulo + campo + dica, alinhado em grid. */
export function Campo({
  label,
  dica,
  acao,
  className,
  children,
}: {
  label?: ReactNode
  dica?: ReactNode
  acao?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('min-w-0', className)}>
      {(label || acao) && (
        <div className="flex items-end justify-between gap-2">
          {label ? <Label>{label}</Label> : <span />}
          {acao && <div className="mb-1">{acao}</div>}
        </div>
      )}
      {children}
      {dica && <p className="text-[11.5px] text-txt-faint mt-1.5 leading-snug">{dica}</p>}
    </div>
  )
}

/** Campo de senha com o olhinho (mostrar/esconder). Não deixa o navegador oferecer salvar. */
export function CampoSenha({
  value,
  onChange,
  placeholder,
  autoFocus,
  visivelInicial,
  className,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoFocus?: boolean
  visivelInicial?: boolean
  className?: string
}) {
  const [ver, setVer] = useState(!!visivelInicial)
  return (
    <div className={cn('relative', className)}>
      <Input
        type={ver ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        data-lpignore="true"
        data-1p-ignore="true"
        className="pr-11 font-mono"
      />
      <button
        type="button"
        onClick={() => setVer((v) => !v)}
        title={ver ? 'Esconder' : 'Mostrar'}
        aria-label={ver ? 'Esconder senha' : 'Mostrar senha'}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center rounded-lg text-txt-dim hover:text-txt hover:bg-border/60 transition-colors"
      >
        {ver ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}

/** PageHeader com trilha simples em cima ("Contas / Criar"). */
export function CabecalhoMigalha({
  trilha,
  title,
  subtitle,
  action,
}: {
  trilha: { label: string; to?: string }[]
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <>
      <nav aria-label="Trilha" className="px-5 md:px-8 pt-6 md:pt-8 flex items-center gap-1 text-xs font-semibold">
        {trilha.map((t, i) => (
          <Fragment key={t.label}>
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-txt-faint" />}
            {t.to ? (
              <Link to={t.to} className="text-txt-dim hover:text-primary-light transition-colors">
                {t.label}
              </Link>
            ) : (
              <span className="text-txt-faint">{t.label}</span>
            )}
          </Fragment>
        ))}
      </nav>
      <div className="-mt-4 md:-mt-6">
        <PageHeader title={title} subtitle={subtitle} action={action} />
      </div>
    </>
  )
}

/** Faixa de aviso (emulador offline, verificando…). */
export function Faixa({
  tom,
  icon: Icon,
  children,
  className,
}: {
  tom: 'warn' | 'info' | 'danger'
  icon: LucideIcon
  children: ReactNode
  className?: string
}) {
  const cor = {
    warn: 'border-warn/30 bg-warn/[0.07] text-warn',
    info: 'border-primary/30 bg-primary/[0.07] text-primary-light',
    danger: 'border-danger/30 bg-danger/[0.07] text-danger',
  }[tom]
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2 }}
      className={cn('flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm', cor, className)}
    >
      <Icon className="h-4 w-4 mt-0.5 shrink-0" />
      <div className="min-w-0 text-txt-dim leading-relaxed">{children}</div>
    </motion.div>
  )
}

/**
 * Estado de um diálogo que guarda os dados mesmo depois de fechar — assim o conteúdo não some
 * no meio da animação de saída do Modal.
 */
export function useDialogo<T>() {
  const [st, setSt] = useState<{ aberto: boolean; dados: T | null }>({ aberto: false, dados: null })
  const abrir = useCallback((d: T) => setSt({ aberto: true, dados: d }), [])
  const fechar = useCallback(() => setSt((s) => ({ ...s, aberto: false })), [])
  const atualizar = useCallback(
    (p: Partial<T>) => setSt((s) => (s.dados ? { ...s, dados: { ...s.dados, ...p } } : s)),
    [],
  )
  return { aberto: st.aberto, dados: st.dados, abrir, fechar, atualizar }
}
