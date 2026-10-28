// Pedaços "ao vivo" de uma run: a linha viva do log, a contagem da pausa e a barra de progresso
// (o mesmo que o "Rodando agora" do app mostra embaixo do nome).
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { CirclePause } from 'lucide-react'
import type { Espera, RunInfo } from '@/lib/api'
import { cn, STATUS_BG } from '@/lib/utils'
import { StatusDot } from '@/components/ui'
import { Etiqueta } from './Pilula'

function mmss(seg: number): string {
  const s = Math.max(0, Math.round(seg))
  const m = Math.floor(s / 60), r = s % 60
  return m ? `${m}m ${String(r).padStart(2, '0')}s` : `${r}s`
}

/** Contagem regressiva de uma pausa — ticka sozinha (1s) em cima do `ate` do backend. */
export function Contagem({ espera, className }: { espera: Espera; className?: string }) {
  const [restam, setRestam] = useState(() => Math.max(0, espera.ate - Date.now() / 1000))
  useEffect(() => {
    const calc = () => setRestam(Math.max(0, espera.ate - Date.now() / 1000))
    calc()
    const id = setInterval(calc, 1000)
    return () => clearInterval(id)
  }, [espera.ate])
  const txt = restam > 0 ? `pausa · faltam ${mmss(restam)}` : 'voltando…'
  return (
    <p className={cn('flex items-center gap-1.5 text-xs font-semibold text-warn min-w-0', className)}>
      <CirclePause className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate tabular-nums">{txt}{espera.motivo ? ` (${espera.motivo})` : ''}</span>
    </p>
  )
}

/** Barra de progresso com o gradiente da marca. */
export function BarraProgresso({ done, total, label, className }: { done: number; total: number; label?: string; className?: string }) {
  const pct = total > 0 ? Math.min(1, Math.max(0, done / total)) : 0
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between gap-3 text-[11px]">
        <span className="text-txt-dim truncate">{label || 'Progresso'}</span>
        <span className="text-txt font-semibold tabular-nums">{done}/{total}</span>
      </div>
      <div className="h-1.5 rounded-full bg-surface2 overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-marca"
          initial={false}
          animate={{ width: `${pct * 100}%` }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
        />
      </div>
    </div>
  )
}

/** O que o bot está fazendo AGORA: contagem da pausa ou a última linha do log. */
export function LinhaViva({ run, className }: { run: RunInfo; className?: string }) {
  if (run.espera) return <Contagem espera={run.espera} className={className} />
  if (run.status_log) {
    return <p className={cn('font-mono text-[11.5px] text-txt-dim truncate', className)} title={run.status_log}>{run.status_log}</p>
  }
  return null
}

/** Bloco completo de uma run ativa: título + status + linha viva + barra. */
export function RunAtivaInfo({ run, titulo, className }: { run: RunInfo; titulo?: string; className?: string }) {
  return (
    <div className={cn('space-y-2 min-w-0', className)}>
      <div className="flex items-center gap-2 min-w-0">
        <StatusDot tone="ativo" pulse />
        <span className="text-sm font-semibold text-txt truncate flex-1">{run.titulo ?? titulo ?? run.bot}</span>
        <Etiqueta className={STATUS_BG[run.status] ?? 'bg-surface2 text-txt-dim'}>{run.status}</Etiqueta>
      </div>
      <LinhaViva run={run} />
      {run.progress && run.progress.total > 0 && (
        <BarraProgresso done={run.progress.done} total={run.progress.total} label={run.progress.label} />
      )}
    </div>
  )
}
