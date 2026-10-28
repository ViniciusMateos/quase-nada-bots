import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowUpRight, ChevronRight } from 'lucide-react'
import { cn, fmtDuracao, STATUS_BG } from '@/lib/utils'
import { ESTADO, EstadoBadge } from './estado'
import { ESPERA_MAX_MIN, nomeBot, type TarefaVista } from './plano'
import { fmtFalta, fmtPassou, hhmm, minParaHhmm, segParaHhmm, instanteSP } from './tempo'

/** "Quando": quanto falta, há quanto passou, ou o que está acontecendo. */
function quando(t: TarefaVista): string {
  const r = t.run
  if (t.estado === 'rodando' && r?.started_at) return `começou ${fmtPassou(Date.now() / 1000 - r.started_at)}`
  if (t.estado === 'esperando') return `pula às ${minParaHhmm(t.minuto + ESPERA_MAX_MIN)} se não liberar`
  if (t.estado === 'comecando') return 'já já (confere a cada minuto)'
  if (t.estado === 'feita' && r?.started_at) {
    const ini = segParaHhmm(instanteSP(r.started_at * 1000).seg)
    return r.ended_at ? `às ${ini} · ${fmtDuracao(r.ended_at - r.started_at)}` : `às ${ini}`
  }
  if (t.falta > 0) return fmtFalta(t.falta)
  return fmtPassou(-t.falta)
}

function RunLink({ t }: { t: TarefaVista }) {
  const r = t.run
  if (!r) return <span className="text-txt-faint">—</span>
  return (
    <Link
      to={`/execucoes/${r.id}`}
      className="inline-flex items-center gap-1.5 h-7 px-2 -mx-2 rounded-lg text-xs font-semibold text-txt-dim hover:text-txt hover:bg-surface2 transition-colors"
    >
      <span className={cn('h-5 px-1.5 rounded-full text-[10px] font-bold flex items-center', STATUS_BG[r.status] ?? 'bg-surface2 text-txt-dim')}>
        {r.status}
      </span>
      abrir
      <ArrowUpRight className="h-3.5 w-3.5" />
    </Link>
  )
}

export function TabelaTarefas({ tarefas, foco, onFoco }: {
  tarefas: TarefaVista[]
  foco: string | null
  onFoco: (k: string | null) => void
}) {
  const apagada = (t: TarefaVista) => t.estado === 'pausada' || t.estado === 'pulada'
  return (
    <>
      {/* desktop: tabela */}
      <div className="hidden md:block -mx-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-txt-faint border-b border-border">
              <th className="font-semibold pl-5 pr-3 py-2.5 w-20">Hora</th>
              <th className="font-semibold px-3 py-2.5">Conta</th>
              <th className="font-semibold px-3 py-2.5">Bot</th>
              <th className="font-semibold px-3 py-2.5">Modo</th>
              <th className="font-semibold px-3 py-2.5">Estado</th>
              <th className="font-semibold px-3 py-2.5">Quando</th>
              <th className="font-semibold pl-3 pr-5 py-2.5 w-36">Execução</th>
            </tr>
          </thead>
          <tbody>
            {tarefas.map((t, i) => (
              <motion.tr
                key={t.key}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 12) * 0.03, duration: 0.22 }}
                onMouseEnter={() => onFoco(t.key)}
                onMouseLeave={() => onFoco(null)}
                className={cn(
                  'border-b border-border/60 last:border-b-0 transition-colors',
                  foco === t.key ? 'bg-surface2/70' : t.estado === 'proxima' ? 'bg-primary/[0.04]' : 'hover:bg-surface2/40',
                )}
              >
                <td className="pl-5 pr-3 py-3">
                  <span className={cn('font-extrabold tabular-nums', apagada(t) ? 'text-txt-faint' : 'text-txt', t.estado === 'pulada' && 'line-through decoration-txt-faint/60')}>
                    {hhmm(t.hora, t.min)}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <Link to="/contas" className={cn('font-semibold hover:text-primary-light transition-colors', apagada(t) ? 'text-txt-dim' : 'text-txt')}>
                    @{t.conta}
                  </Link>
                </td>
                <td className="px-3 py-3 text-txt-dim">{nomeBot(t.bot)}</td>
                <td className="px-3 py-3 text-txt-dim">{t.modo || '—'}</td>
                <td className="px-3 py-3"><EstadoBadge estado={t.estado} /></td>
                <td className="px-3 py-3 text-xs text-txt-dim tabular-nums whitespace-nowrap">{quando(t)}</td>
                <td className="pl-3 pr-5 py-3"><RunLink t={t} /></td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* celular: lista */}
      <ul className="md:hidden -mx-5 divide-y divide-border/60 border-t border-border">
        {tarefas.map((t, i) => {
          const Icon = ESTADO[t.estado].icon
          const conteudo = (
            <>
              <div className={cn('w-12 shrink-0 flex flex-col items-center gap-1', apagada(t) && 'opacity-60')}>
                <span className="text-[15px] font-extrabold tabular-nums text-txt">{hhmm(t.hora, t.min)}</span>
                <Icon className={cn('h-3.5 w-3.5', t.estado === 'feita' ? 'text-ok' : t.estado === 'rodando' || t.estado === 'proxima' ? 'text-primary-light' : 'text-txt-faint')} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-txt truncate">{nomeBot(t.bot)} · @{t.conta}</p>
                <p className="text-xs text-txt-dim mt-0.5 truncate">{ESTADO[t.estado].label} · {quando(t)}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-txt-faint shrink-0" />
            </>
          )
          return (
            <motion.li
              key={t.key}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 12) * 0.03, duration: 0.22 }}
            >
              {/* igual o app: tocar na tarefa leva pras contas (ou pra execução, se tiver) */}
              <Link
                to={t.run ? `/execucoes/${t.run.id}` : '/contas'}
                className={cn('flex items-center gap-3 px-5 py-3 hover:bg-surface2/40 transition-colors', t.estado === 'proxima' && 'bg-primary/[0.04]')}
              >
                {conteudo}
              </Link>
            </motion.li>
          )
        })}
      </ul>
    </>
  )
}
