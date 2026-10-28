import type { HTMLAttributes, ReactNode } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

/** Pílula de escolha (modo, chat, grupo). O fundo da selecionada desliza entre elas (layoutId). */
export function Pilula({ sel, onClick, children, grupo, tamanho = 'md', className, ...rest }: {
  sel: boolean
  onClick: () => void
  children: ReactNode
  grupo: string            // layoutId do fundo — um por conjunto de pílulas
  tamanho?: 'md' | 'sm'
  className?: string
} & Omit<HTMLAttributes<HTMLButtonElement>, 'onClick' | 'children' | 'className'>) {
  return (
    <button
      type="button"
      aria-pressed={sel}
      onClick={onClick}
      className={cn(
        'relative inline-flex items-center gap-1.5 rounded-full border font-semibold transition-colors select-none',
        tamanho === 'sm' ? 'h-8 px-3 text-xs' : 'h-9 px-4 text-sm',
        sel ? 'border-primary text-white' : 'border-border text-txt hover:border-txt-faint/60 hover:bg-surface2',
        className,
      )}
      {...rest}
    >
      {sel && (
        <motion.span
          layoutId={grupo}
          className="absolute inset-0 rounded-full bg-primary shadow-glow"
          transition={{ type: 'spring', stiffness: 500, damping: 36 }}
        />
      )}
      <span className="relative inline-flex items-center gap-1.5">{children}</span>
    </button>
  )
}

/** Etiqueta pequena com a cor que eu passar (o Badge do ui já vem rosa e o cn não mescla classes). */
export function Etiqueta({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center h-5 px-2 rounded-full text-[11px] font-semibold whitespace-nowrap', className)}>
      {children}
    </span>
  )
}
