import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowUpRight } from 'lucide-react'
import { cn, fmtDuracao, STATUS_BG } from '@/lib/utils'
import { cmpTexto } from '@/lib/ordenar'
import { ESTADO, ESTADOS_LEGENDA, EstadoBadge, EstadoDot } from './estado'
import { FAIXA_MANHA, FAIXA_TARDE, ESPERA_MAX_MIN, nomeBot, runAtiva, type TarefaVista } from './plano'
import { fmtFalta, fmtPassou, hhmm, instanteSP, minParaHhmm, segParaHhmm, type Instante } from './tempo'

// largura da coluna de nomes (rótulo da conta) — a camada de fundo (faixas, grade, "agora") começa
// depois dela, então as duas classes andam juntas
const ROT = 'w-28 sm:w-40'
const ROT_LEFT = 'left-28 sm:left-40'

type Barra = { ini: number; fim: number }   // minutos do dia

/** Duração REAL da run (início → fim, ou → agora se ainda está rodando), no dia do plano. */
function barraDaRun(t: TarefaVista, data: string, agora: Instante): Barra | null {
  const r = t.run
  if (!r?.started_at) return null
  const a = instanteSP(r.started_at * 1000)
  if (a.data !== data) return null
  const ini = a.seg / 60
  let fim = ini
  if (r.ended_at) {
    const b = instanteSP(r.ended_at * 1000)
    fim = b.data === data ? b.seg / 60 : 1440
  } else if (runAtiva(r)) {
    fim = agora.data === data ? agora.seg / 60 : 1440
  }
  return { ini, fim: Math.max(fim, ini) }
}

export function LinhaDoTempo({ tarefas, agora, data, foco, onFoco }: {
  tarefas: TarefaVista[]
  agora: Instante
  data: string
  foco: string | null
  onFoco: (k: string | null) => void
}) {
  const navigate = useNavigate()
  const hoje = data === agora.data
  const agoraMin = hoje ? agora.seg / 60 : null

  const barras = new Map<string, Barra>()
  for (const t of tarefas) {
    const b = barraDaRun(t, data, agora)
    if (b) barras.set(t.key, b)
  }

  // janela do eixo: as faixas do sorteio + as tarefas + o agora + as runs, com 1h de folga
  const pontos = [FAIXA_MANHA[0], FAIXA_TARDE[1], ...tarefas.map((t) => t.minuto)]
  if (agoraMin != null) pontos.push(agoraMin)
  for (const b of barras.values()) pontos.push(b.ini, b.fim)
  const lo = Math.max(0, Math.floor(Math.min(...pontos) / 60) * 60 - 60)
  const hi = Math.min(1440, Math.ceil(Math.max(...pontos) / 60) * 60 + 60)
  const pct = (m: number) => ((Math.min(Math.max(m, lo), hi) - lo) / (hi - lo)) * 100

  const horas: number[] = []
  for (let m = lo; m <= hi; m += 60) horas.push(m)
  const passoRotulo = (hi - lo) / 60 > 14 ? 2 : 1

  // uma linha por conta, em ordem natural (segue2 antes de segue10)
  const linhas = useMemo(() => {
    const por = new Map<string, TarefaVista[]>()
    for (const t of tarefas) {
      const k = t.conta || '—'
      if (!por.has(k)) por.set(k, [])
      por.get(k)!.push(t)
    }
    return [...por.entries()].sort((a, b) => cmpTexto(a[0], b[0]))
  }, [tarefas])

  // detalhe embaixo: a que está em foco (hover); senão a mais relevante agora
  const destaque =
    tarefas.find((t) => t.key === foco) ??
    tarefas.find((t) => t.estado === 'rodando') ??
    tarefas.find((t) => t.estado === 'esperando' || t.estado === 'comecando') ??
    tarefas.find((t) => t.estado === 'proxima') ??
    tarefas.find((t) => t.estado === 'pausada' && t.falta > 0) ??
    tarefas[tarefas.length - 1]

  const faixas = [
    { nome: 'manhã', de: FAIXA_MANHA[0], ate: FAIXA_MANHA[1], cls: 'bg-amarelo/[0.035]' },
    { nome: 'tarde', de: FAIXA_TARDE[0], ate: FAIXA_TARDE[1], cls: 'bg-roxo/[0.07]' },
  ]

  let ordem = 0   // stagger da entrada dos marcadores (por horário dentro de cada linha)

  return (
    <div>
      <div className="overflow-x-auto -mx-5 px-5">
        <div className="min-w-[680px]">
          {/* topo: "agora" + rótulos das horas */}
          <div className="flex">
            <div className={cn(ROT, 'shrink-0')} />
            <div className="relative flex-1 h-12">
              {horas.map((m, i) =>
                (m - lo) / 60 % passoRotulo === 0 ? (
                  <span
                    key={m}
                    className={cn(
                      'absolute bottom-1.5 text-[11px] font-medium text-txt-faint tabular-nums',
                      i === 0 ? '' : i === horas.length - 1 ? '-translate-x-full' : '-translate-x-1/2',
                    )}
                    style={{ left: `${pct(m)}%` }}
                  >
                    {String(Math.floor(m / 60)).padStart(2, '0')}h
                  </span>
                ) : null,
              )}
              {agoraMin != null && (
                <motion.div
                  className="absolute top-0 bottom-0 w-0 z-10"
                  initial={false}
                  animate={{ left: `${pct(agoraMin)}%` }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                >
                  <div className="absolute top-0 bottom-0 left-0 -translate-x-1/2 flex flex-col items-center">
                    <span className="h-5 px-1.5 rounded-md bg-primary text-white text-[10px] font-bold tabular-nums flex items-center whitespace-nowrap shadow-glow">
                      agora {segParaHhmm(agora.seg)}
                    </span>
                    <span className="flex-1 w-px bg-primary" />
                  </div>
                </motion.div>
              )}
            </div>
          </div>

          {/* corpo: uma linha por conta */}
          <div className="relative border-y border-border">
            {/* fundo: faixas do sorteio, grade das horas e a linha do agora */}
            <div className={cn('absolute inset-y-0 right-0 pointer-events-none', ROT_LEFT)}>
              {faixas.map((f) => (
                <div key={f.nome} className={cn('absolute inset-y-0', f.cls)} style={{ left: `${pct(f.de)}%`, width: `${pct(f.ate) - pct(f.de)}%` }} />
              ))}
              {horas.map((m) => (
                <div key={m} className="absolute inset-y-0 w-px bg-border/70" style={{ left: `${pct(m)}%` }} />
              ))}
              {agoraMin != null && (
                <motion.div
                  className="absolute inset-y-0 w-px bg-primary z-10"
                  initial={false}
                  animate={{ left: `${pct(agoraMin)}%` }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                />
              )}
            </div>

            {linhas.map(([conta, ts], li) => {
              const feitas = ts.filter((t) => t.estado === 'feita' || t.estado === 'rodando').length
              return (
                <motion.div
                  key={conta}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(li, 10) * 0.04, duration: 0.25 }}
                  className={cn('relative flex h-14', li > 0 && 'border-t border-border/60')}
                >
                  <div className={cn(ROT, 'shrink-0 flex items-center gap-2 pr-3 min-w-0')}>
                    <Link to="/contas" className="text-sm font-semibold text-txt truncate hover:text-primary-light transition-colors" title={`@${conta}`}>
                      @{conta}
                    </Link>
                    <span className="text-[11px] text-txt-faint tabular-nums shrink-0">{feitas}/{ts.length}</span>
                  </div>
                  <div className="relative flex-1">
                    {ts.map((t) => {
                      const b = barras.get(t.key)
                      return b ? (
                        <motion.div
                          key={`b-${t.key}`}
                          className={cn('absolute top-1/2 mt-3 h-1 rounded-full origin-left', ESTADO[t.estado].barra)}
                          style={{ left: `${pct(b.ini)}%`, width: `${Math.max(0.4, pct(b.fim) - pct(b.ini))}%` }}
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: 1 }}
                          transition={{ duration: 0.5, ease: 'easeOut', delay: 0.2 }}
                        />
                      ) : null
                    })}
                    {ts.map((t) => {
                      const p = pct(t.minuto)
                      const aDireita = p > 86   // perto da borda: rótulo à esquerda do ponto
                      const emFoco = foco === t.key
                      const apagada = t.estado === 'pulada' || t.estado === 'pausada'
                      const i = ordem++
                      return (
                        <div
                          key={t.key}
                          className={cn('absolute top-1/2 -translate-y-1/2 z-20', aDireita && '-translate-x-full')}
                          style={{ left: `${p}%` }}
                        >
                          <motion.button
                            type="button"
                            initial={{ opacity: 0, scale: 0.6 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.1 + Math.min(i, 16) * 0.035, type: 'spring', stiffness: 420, damping: 26 }}
                            onMouseEnter={() => onFoco(t.key)}
                            onMouseLeave={() => onFoco(null)}
                            onFocus={() => onFoco(t.key)}
                            onBlur={() => onFoco(null)}
                            onClick={() => t.run && navigate(`/execucoes/${t.run.id}`)}
                            title={`${hhmm(t.hora, t.min)} · ${nomeBot(t.bot)} · @${t.conta} · ${ESTADO[t.estado].label}`}
                            className={cn(
                              'flex items-center gap-1.5 h-7 px-1 rounded-full transition-colors',
                              aDireita ? 'flex-row-reverse -mr-2.5' : '-ml-2.5',
                              t.run ? 'cursor-pointer' : 'cursor-default',
                              emFoco && 'bg-surface2/90',
                            )}
                          >
                            <EstadoDot estado={t.estado} className={cn('transition-transform', emFoco && 'scale-125')} />
                            <span
                              className={cn(
                                'text-[11px] font-semibold tabular-nums',
                                aDireita ? 'pl-1' : 'pr-1',
                                apagada ? 'text-txt-faint' : t.estado === 'futura' ? 'text-txt-dim' : 'text-txt',
                                t.estado === 'pulada' && 'line-through decoration-txt-faint/60',
                              )}
                            >
                              {hhmm(t.hora, t.min)}
                            </span>
                          </motion.button>
                        </div>
                      )
                    })}
                  </div>
                </motion.div>
              )
            })}
          </div>

          {/* rodapé: as faixas do sorteio */}
          <div className="flex h-7">
            <div className={cn(ROT, 'shrink-0 flex items-center text-[10px] font-semibold uppercase tracking-wide text-txt-faint')}>
              faixas
            </div>
            <div className="relative flex-1">
              {faixas.map((f) => (
                <span
                  key={f.nome}
                  className="absolute top-1.5 -translate-x-1/2 text-[10px] font-semibold uppercase tracking-wide text-txt-faint whitespace-nowrap"
                  style={{ left: `${(pct(f.de) + pct(f.ate)) / 2}%` }}
                >
                  {f.nome} · {minParaHhmm(f.de)}–{minParaHhmm(f.ate)}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* detalhe da tarefa em foco */}
      {destaque && <Detalhe t={destaque} emFoco={destaque.key === foco} />}

      {/* legenda */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-4">
        {ESTADOS_LEGENDA.map((e) => (
          <span key={e} className="inline-flex items-center gap-1.5 text-[11px] text-txt-dim">
            <EstadoDot estado={e} pequeno />
            {ESTADO[e].label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 text-[11px] text-txt-dim">
          <span className="inline-block h-1 w-5 rounded-full bg-ok/45" />
          duração da run
        </span>
      </div>
    </div>
  )
}

function Detalhe({ t, emFoco }: { t: TarefaVista; emFoco: boolean }) {
  const r = t.run
  let quando: string
  if (t.estado === 'esperando') quando = `pula às ${minParaHhmm(t.minuto + ESPERA_MAX_MIN)} se não liberar a vaga`
  else if (t.estado === 'comecando') quando = 'o servidor confere o plano a cada minuto'
  else if (t.falta > 0) quando = fmtFalta(t.falta)
  else quando = fmtPassou(-t.falta)
  const dur = r?.started_at ? (r.ended_at ?? Date.now() / 1000) - r.started_at : null

  return (
    <motion.div
      key={t.key}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className={cn(
        'mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-4 py-3 transition-colors',
        emFoco ? 'border-primary/40 bg-primary/[0.06]' : 'border-border bg-surface2/40',
      )}
    >
      <span className="text-lg font-extrabold tabular-nums text-txt">{hhmm(t.hora, t.min)}</span>
      <EstadoBadge estado={t.estado} />
      <span className="text-sm text-txt min-w-0">
        <span className="font-semibold">{nomeBot(t.bot)}</span>
        <span className="text-txt-dim"> na </span>
        <span className="font-semibold">@{t.conta}</span>
        {t.modo && <span className="text-txt-dim"> · modo {t.modo}</span>}
      </span>
      <span className="text-xs text-txt-faint">{quando}</span>
      <div className="flex-1" />
      {r && (
        <Link
          to={`/execucoes/${r.id}`}
          className="inline-flex items-center gap-1.5 h-7 pl-2 pr-2.5 rounded-lg text-xs font-semibold text-txt-dim hover:text-txt hover:bg-surface2 transition-colors"
        >
          <span className={cn('h-5 px-1.5 rounded-full text-[10px] font-bold flex items-center', STATUS_BG[r.status] ?? 'bg-surface2 text-txt-dim')}>
            {r.status}
          </span>
          {dur != null && <span className="tabular-nums">{fmtDuracao(dur)}</span>}
          ver execução
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </motion.div>
  )
}
