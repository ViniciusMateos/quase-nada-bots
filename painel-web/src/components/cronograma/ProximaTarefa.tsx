import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUpRight, CalendarX2, CircleCheck, Clock, Hourglass, Pause, Play, Timer, type LucideIcon } from 'lucide-react'
import { Button, Card } from '@/components/ui'
import { cn } from '@/lib/utils'
import { EstadoBadge } from './estado'
import { ESPERA_MAX_MIN, nomeBot, type Resumo, type TarefaVista } from './plano'
import { fmtFalta, fmtPassou, fmtRelogio, hhmm, minParaHhmm } from './tempo'

function Rotulo({ icon: Icon, children, tom = 'text-txt-dim' }: { icon: LucideIcon; children: ReactNode; tom?: string }) {
  return (
    <p className={cn('flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider', tom)}>
      <Icon className="h-3.5 w-3.5" strokeWidth={2.4} />
      {children}
    </p>
  )
}

function Titulo({ t }: { t: TarefaVista }) {
  return (
    <h2 className="text-xl md:text-2xl font-extrabold tracking-tight text-txt mt-2">
      {nomeBot(t.bot)} <span className="text-txt-dim font-bold">na</span> @{t.conta}
    </h2>
  )
}

/** Número grande (contagem). Troca com um fade curto quando muda de caso, não a cada segundo. */
function Relogio({ valor, legenda, tom = 'text-txt' }: { valor: string; legenda: string; tom?: string }) {
  return (
    <div className="mt-5">
      <p className={cn('text-5xl md:text-6xl font-extrabold tabular-nums tracking-tight leading-none', tom)}>{valor}</p>
      <p className="text-xs text-txt-dim mt-2">{legenda}</p>
    </div>
  )
}

/**
 * O destaque do topo: a próxima tarefa com contagem regressiva — ou o que está acontecendo agora
 * (rodando / esperando vaga / começando), pausado, nada agendado ou "tudo certo por hoje".
 */
export function ProximaTarefa({ ativo, resumo, depois, onLigar, salvando }: {
  ativo: boolean
  resumo: Resumo
  depois?: TarefaVista          // a que vem logo depois da próxima
  onLigar: () => void
  salvando: boolean
}) {
  const navigate = useNavigate()
  const { proxima, rodando, esperando, proximaSeLigar } = resumo

  let caso: string
  let corpo: ReactNode

  if (!ativo) {
    caso = 'pausado'
    corpo = (
      <>
        <Rotulo icon={Pause}>Pausado</Rotulo>
        <h2 className="text-xl md:text-2xl font-extrabold tracking-tight text-txt mt-2">O cronograma está pausado</h2>
        <p className="text-sm text-txt-dim mt-1.5 max-w-xl leading-relaxed">
          Pausado — não roda nada. Ao ligar, volta a partir do próximo horário (o que passou é pulado).
        </p>
        {proximaSeLigar && (
          <p className="text-sm text-txt-dim mt-3">
            Se ligar agora, o próximo é às{' '}
            <span className="font-bold text-txt tabular-nums">{hhmm(proximaSeLigar.hora, proximaSeLigar.min)}</span> na{' '}
            <span className="font-semibold text-txt">@{proximaSeLigar.conta}</span>{' '}
            <span className="text-txt-faint">({fmtFalta(proximaSeLigar.falta)})</span>.
          </p>
        )}
        <Button className="mt-5" onClick={onLigar} loading={salvando}>
          <Play className="h-4 w-4" /> Ligar o cronograma
        </Button>
      </>
    )
  } else if (resumo.total === 0) {
    caso = 'vazio'
    corpo = (
      <>
        <Rotulo icon={CalendarX2}>Nada agendado</Rotulo>
        <h2 className="text-xl md:text-2xl font-extrabold tracking-tight text-txt mt-2">Nenhuma conta no automático</h2>
        <p className="text-sm text-txt-dim mt-1.5 max-w-xl leading-relaxed">
          Nenhuma conta cadastrada pro aquecimento. Entram aqui as contas marcadas pro servidor e sem cadeado —
          adicione ou ajuste uma conta pra agendar.
        </p>
        <Button variant="subtle" className="mt-5" onClick={() => navigate('/contas')}>Ir pras contas</Button>
      </>
    )
  } else if (proxima) {
    caso = 'proxima'
    corpo = (
      <>
        <div className="flex items-start justify-between gap-3">
          <Rotulo icon={Clock} tom="text-primary-light">Próxima tarefa</Rotulo>
          <EstadoBadge estado="proxima" />
        </div>
        <Titulo t={proxima} />
        <p className="text-sm text-txt-dim mt-1">
          às <span className="font-bold text-txt tabular-nums">{hhmm(proxima.hora, proxima.min)}</span>
          {proxima.modo && <> · modo {proxima.modo}</>} · roda sozinho, sem push
        </p>
        <Relogio valor={fmtRelogio(proxima.falta)} legenda={`faltam pra começar · ${fmtFalta(proxima.falta)}`} />
        {depois && (
          <p className="text-xs text-txt-faint mt-4">
            Depois: <span className="tabular-nums text-txt-dim font-semibold">{hhmm(depois.hora, depois.min)}</span> na @{depois.conta}
          </p>
        )}
      </>
    )
  } else if (rodando) {
    caso = 'rodando'
    const desde = rodando.run?.started_at ? Date.now() / 1000 - rodando.run.started_at : -rodando.falta
    corpo = (
      <>
        <div className="flex items-start justify-between gap-3">
          <Rotulo icon={Play} tom="text-primary-light">Rodando agora</Rotulo>
          <EstadoBadge estado="rodando" />
        </div>
        <Titulo t={rodando} />
        <p className="text-sm text-txt-dim mt-1">
          marcado pras <span className="font-bold text-txt tabular-nums">{hhmm(rodando.hora, rodando.min)}</span> · último horário de hoje
        </p>
        <Relogio valor={fmtRelogio(desde)} legenda="rodando há" tom="text-primary-light" />
      </>
    )
  } else if (esperando) {
    const espera = esperando.estado === 'esperando'
    caso = esperando.estado
    corpo = (
      <>
        <div className="flex items-start justify-between gap-3">
          <Rotulo icon={espera ? Hourglass : Timer} tom="text-warn">{espera ? 'Esperando vaga' : 'Começando'}</Rotulo>
          <EstadoBadge estado={esperando.estado} />
        </div>
        <Titulo t={esperando} />
        <p className="text-sm text-txt-dim mt-1.5 max-w-xl leading-relaxed">
          {espera
            ? <>Era hora às <b className="text-txt tabular-nums">{hhmm(esperando.hora, esperando.min)}</b>, mas tem bot rodando — é um por vez. O servidor tenta de novo a cada minuto; se não liberar até as <b className="text-txt tabular-nums">{minParaHhmm(esperando.minuto + ESPERA_MAX_MIN)}</b>, pula.</>
            : <>Passou da hora (<b className="text-txt tabular-nums">{hhmm(esperando.hora, esperando.min)}</b>). O servidor confere o plano a cada minuto — já já começa.</>}
        </p>
        <Relogio valor={fmtRelogio(-esperando.falta)} legenda={espera ? 'esperando há' : 'passou da hora há'} tom="text-warn" />
      </>
    )
  } else {
    caso = 'fim'
    corpo = (
      <>
        <Rotulo icon={CircleCheck} tom="text-ok">Tudo certo por hoje</Rotulo>
        <h2 className="text-xl md:text-2xl font-extrabold tracking-tight text-txt mt-2">Os horários de hoje já passaram</h2>
        <p className="text-sm text-txt-dim mt-1.5 max-w-xl leading-relaxed">
          {resumo.feitas} {resumo.feitas === 1 ? 'rodou' : 'rodaram'} automático
          {resumo.puladas ? `, ${resumo.puladas} ${resumo.puladas === 1 ? 'pulado' : 'pulados'}` : ''}. Amanhã o servidor sorteia
          horários novos (entre 10h e 17h).
        </p>
      </>
    )
  }

  // aviso secundário: tem coisa acontecendo AGORA além da próxima
  const aviso = caso === 'proxima' ? (rodando ?? esperando) : undefined

  return (
    <Card className="relative overflow-hidden h-full">
      {/* brilho da marca no canto (bem sutil) */}
      <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-marca opacity-[0.10] blur-3xl" />
      <div className="relative p-5 md:p-6 flex flex-col h-full">
        <AnimatePresence mode="wait">
          <motion.div
            key={caso}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
          >
            {corpo}
          </motion.div>
        </AnimatePresence>

        {aviso && (
          <div className="mt-auto pt-5">
            <Link
              to={aviso.run ? `/execucoes/${aviso.run.id}` : '/execucoes'}
              className={cn(
                'flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm transition-colors',
                aviso.estado === 'rodando' ? 'border-primary/30 bg-primary/[0.07] hover:bg-primary/[0.12]' : 'border-warn/30 bg-warn/[0.07] hover:bg-warn/[0.12]',
              )}
            >
              <EstadoBadge estado={aviso.estado} />
              <span className="text-txt-dim min-w-0 truncate">
                <span className="font-semibold text-txt">@{aviso.conta}</span>
                {aviso.estado === 'rodando' && aviso.run?.started_at
                  ? ` · começou ${fmtPassou(Date.now() / 1000 - aviso.run.started_at)}`
                  : ` · era às ${hhmm(aviso.hora, aviso.min)}`}
              </span>
              <span className="flex-1" />
              {aviso.run && <ArrowUpRight className="h-4 w-4 text-txt-dim shrink-0" />}
            </Link>
          </div>
        )}
      </div>
    </Card>
  )
}
