import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

/** Linha "rótulo → valor" dos cartões de Ajustes. */
export function InfoLinha({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between gap-4 py-2.5 border-t border-border/60 first:border-t-0 text-sm', className)}>
      <span className="text-txt-dim shrink-0">{label}</span>
      <div className="min-w-0 flex items-center justify-end gap-2 text-right text-txt">{children}</div>
    </div>
  )
}

/** Entrada suave dos cartões (stagger curto). */
export function Aparece({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.25, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

/** Item com ícone + título + texto (listas explicativas). */
export function ItemExplicado({ icon, titulo, extra, children }: { icon: ReactNode; titulo: ReactNode; extra?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="h-8 w-8 shrink-0 rounded-lg bg-surface2 border border-border flex items-center justify-center text-primary-light">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-bold text-txt">{titulo}</p>
          {extra}
        </div>
        <div className="text-xs text-txt-dim leading-relaxed mt-1">{children}</div>
      </div>
    </div>
  )
}
