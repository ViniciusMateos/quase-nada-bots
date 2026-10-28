import { motion } from 'framer-motion'
import { Card, StatusDot, Switch } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { Resumo } from './plano'

function Numero({ valor, label, tom = 'text-txt' }: { valor: string | number; label: string; tom?: string }) {
  return (
    <div className="min-w-0">
      <p className={cn('text-2xl font-extrabold tabular-nums leading-none', tom)}>{valor}</p>
      <p className="text-[11px] text-txt-dim mt-1.5 truncate">{label}</p>
    </div>
  )
}

/** O liga/desliga do "Rodar automaticamente" (mesmos textos do app) + o placar do dia. */
export function PainelAutomatico({ ativo, resumo, onAlternar, salvando }: {
  ativo: boolean
  resumo: Resumo
  onAlternar: (v: boolean) => void
  salvando: boolean
}) {
  const { total, feitas, puladas } = resumo
  const pFeitas = total ? (feitas / total) * 100 : 0
  const pPuladas = total ? (puladas / total) * 100 : 0
  return (
    <Card className="p-5 h-full flex flex-col">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="flex items-center gap-2 text-[15px] font-extrabold text-txt">
            <StatusDot tone={ativo ? 'ok' : 'neutro'} pulse={ativo} />
            Rodar automaticamente
          </p>
          <p className="text-xs text-txt-dim leading-relaxed mt-1.5">
            {ativo
              ? 'Roda o aquecimento humano sozinho em cada conta, 2x por dia, nos horários abaixo.'
              : 'Pausado — não roda nada. Ao ligar, volta a partir do próximo horário (o que passou é pulado).'}
          </p>
        </div>
        <Switch checked={ativo} onChange={onAlternar} disabled={salvando} label="Rodar automaticamente" />
      </div>

      <div className="mt-auto pt-5">
        <div className="grid grid-cols-3 gap-3 pt-4 border-t border-border">
          <Numero valor={`${feitas}/${total}`} label="rodaram hoje" tom={feitas ? 'text-ok' : 'text-txt'} />
          <Numero valor={puladas} label={puladas === 1 ? 'pulado' : 'pulados'} tom={puladas ? 'text-txt-dim' : 'text-txt'} />
          <Numero valor={resumo.contas} label={resumo.contas === 1 ? 'conta' : 'contas'} />
        </div>
        {/* progresso do dia: rodou (verde) + pulado (cinza) */}
        <div className="mt-4 h-1.5 rounded-full bg-surface2 overflow-hidden flex">
          <motion.div className="h-full bg-ok" initial={{ width: 0 }} animate={{ width: `${pFeitas}%` }} transition={{ duration: 0.6, ease: 'easeOut' }} />
          <motion.div className="h-full bg-txt-faint/60" initial={{ width: 0 }} animate={{ width: `${pPuladas}%` }} transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }} />
        </div>
      </div>
    </Card>
  )
}
