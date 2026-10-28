// Cartão de uma execução ATIVA (o "Rodando agora" do app): nome do processo, status pulsando, a
// linha viva do log (ou a contagem da pausa) e a barra de progresso. Clica → tela da run.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Square } from 'lucide-react'
import { api, type Bot, type RunInfo } from '@/lib/api'
import { erroMsg } from '@/lib/apiClient'
import { QK, useContas } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui'
import { ConfirmModal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { BarraProgresso, Contagem, DuracaoViva, ProcessoIcone, StatusPill } from './pecas'
import { contaDosParams, tituloDaRun } from './runUtils'

/** Botão Parar com confirmação (ação destrutiva sempre confirma). */
export function PararRun({
  runId,
  titulo,
  size = 'sm',
  onParou,
  className,
}: {
  runId: string
  titulo: string
  size?: 'sm' | 'md'
  onParou?: () => void
  className?: string
}) {
  const [aberto, setAberto] = useState(false)
  const [parando, setParando] = useState(false)
  const qc = useQueryClient()
  const toast = useToast()
  async function parar() {
    setParando(true)
    try {
      await api.stopRun(runId)
      toast.ok('Mandei parar.')
      onParou?.()
    } catch (e) {
      toast.error(`Não consegui parar: ${erroMsg(e)}`)
    } finally {
      setParando(false)
      qc.invalidateQueries({ queryKey: QK.runs })
      qc.invalidateQueries({ queryKey: QK.historico() })
    }
  }
  return (
    <>
      <Button
        variant="danger"
        size={size}
        loading={parando}
        className={className}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setAberto(true)
        }}
      >
        <Square className="h-3.5 w-3.5 fill-current" />
        Parar
      </Button>
      <ConfirmModal
        open={aberto}
        onClose={() => setAberto(false)}
        onConfirm={parar}
        title="Parar execução?"
        message={`Vou mandar parar "${titulo}". O que já foi feito fica feito; o resto da fila não roda.`}
        confirmText="Parar"
        danger
      />
    </>
  )
}

export function RunAtivaCard({
  run,
  bots,
  comParar,
  destaque,
}: {
  run: RunInfo
  bots?: Record<string, Bot>
  comParar?: boolean
  destaque?: boolean
}) {
  const { data: contas } = useContas()
  const navigate = useNavigate()
  const titulo = tituloDaRun(run, bots)
  const conta = contaDosParams(run.params, contas)
  const p = run.progress
  const abrir = () => navigate(`/execucoes/${run.id}`)
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={abrir}
      onKeyDown={(e) => {
        if (e.key === 'Enter') abrir()
      }}
      className={cn(
        'group block cursor-pointer rounded-xl border bg-surface2/40 p-4 transition-all',
        'hover:-translate-y-px hover:bg-surface2/70 hover:shadow-card',
        destaque ? 'border-primary/30' : 'border-border',
      )}
    >
      <div className="flex items-start gap-3">
        <ProcessoIcone run={run} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <p className="font-semibold text-txt truncate">{titulo}</p>
            <StatusPill status={run.status} className="shrink-0" />
          </div>
          <p className="text-xs text-txt-faint mt-0.5 truncate tabular-nums">
            {conta ? <span className="text-primary-light font-semibold">{conta}</span> : null}
            {conta ? ' · ' : ''}
            {run.status === 'iniciando' ? 'na fila há ' : 'rodando há '}
            <DuracaoViva desde={run.started_at} />
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {comParar && (
            // segura o clique aqui: nem o botão nem o modal de confirmação abrem a run
            <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
              <PararRun runId={run.id} titulo={titulo} />
            </div>
          )}
          <ChevronRight className="h-4 w-4 text-txt-faint group-hover:text-txt transition-colors" />
        </div>
      </div>

      {/* a LINHA VIVA: em pausa mostra a contagem; senão o que o bot está logando agora */}
      <div className="mt-3 min-h-[18px]">
        {run.espera ? (
          <Contagem espera={run.espera} compacta />
        ) : (
          <p className="text-xs font-mono text-txt-dim truncate" title={run.status_log ?? undefined}>
            {run.status_log || (run.status === 'iniciando' ? 'na fila do emulador…' : 'começando…')}
          </p>
        )}
      </div>

      {p && p.total > 0 && (
        <div className="mt-3">
          <BarraProgresso done={p.done} total={p.total} label={p.label} compacta />
        </div>
      )}
    </div>
  )
}

/** Lista animada de runs ativas (entrada em stagger + layout quando muda). */
export function ListaRunsAtivas({
  runs,
  bots,
  comParar,
  className,
}: {
  runs: RunInfo[]
  bots?: Record<string, Bot>
  comParar?: boolean
  className?: string
}) {
  return (
    <div className={cn('grid gap-3', className)}>
      <AnimatePresence initial={true}>
        {runs.map((r, i) => (
          <motion.div
            key={r.id}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.22, delay: Math.min(i, 6) * 0.04 }}
          >
            <RunAtivaCard run={r} bots={bots} comParar={comParar} destaque />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
