// Tela de UMA execução (o RunScreen do app): cabeçalho com status/conta/início/duração, barra de
// progresso, contagem da pausa, saldo no fim e o LOG ao vivo pelo WebSocket (com reconexão
// enquanto a run estiver ativa).
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { Activity, ArrowLeft, CircleUser, Clock, Flag, PlayCircle, RefreshCw, SearchX, Wifi, WifiOff } from 'lucide-react'
import { api, logsWsUrl, type Espera, type Progresso } from '@/lib/api'
import { erroMsg } from '@/lib/apiClient'
import { QK, useBots, useContas, useRuns } from '@/lib/queries'
import { arroba, cn, fmtDataHora, tempoRelativo } from '@/lib/utils'
import { Button, Card, EmptyState, PageBody, PageHeader, Skeleton } from '@/components/ui'
import { LogView } from '@/components/execucoes/LogView'
import { BarraProgresso, Contagem, DuracaoViva, ResultadoBadge, SaldoChips, StatusPill } from '@/components/execucoes/pecas'
import { PararRun } from '@/components/execucoes/RunAtiva'
import { contaDoLog, parseEspera, parseProgresso, saldoDoLog, ultimoProgresso } from '@/components/execucoes/logParse'
import { contaDosParams, ehAtiva, resultadoDe, tituloDaRun, useHistorico, type RunDetalhe } from '@/components/execucoes/runUtils'

function Info({ label, icon, children }: { label: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3 min-w-0">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-txt-faint">
        {icon}
        {label}
      </p>
      <div className="mt-1.5 text-sm font-semibold text-txt min-w-0 truncate tabular-nums">{children}</div>
    </div>
  )
}

export default function Run() {
  const { runId = '' } = useParams()
  const qc = useQueryClient()
  const { data: bots } = useBots()
  const { data: runs } = useRuns()
  const { data: contas } = useContas()
  const { data: hist } = useHistorico()
  const live = runs?.find((r) => r.id === runId)

  const [detalhe, setDetalhe] = useState<RunDetalhe | null>(null)
  const [naoAchou, setNaoAchou] = useState(false)
  const [erroCarga, setErroCarga] = useState<string | null>(null)
  const [linhas, setLinhas] = useState<string[]>([])
  const [conectando, setConectando] = useState(true)
  const [wsVivo, setWsVivo] = useState(false)
  const [progressoWs, setProgressoWs] = useState<Progresso | null>(null)
  // undefined = o WS ainda não disse nada sobre pausa (cai no /runs); null = sem pausa
  const [esperaWs, setEsperaWs] = useState<Espera | null | undefined>(undefined)
  const [parouAqui, setParouAqui] = useState(false)
  const [tentativa, setTentativa] = useState(0) // "tentar de novo" manual

  useEffect(() => {
    let alive = true
    let ws: WebSocket | null = null
    let retry: ReturnType<typeof setTimeout> | undefined
    let flushT: ReturnType<typeof setTimeout> | undefined
    let falhas = 0
    // linhas que chegam pelo WS vão num buffer e entram em lote (~80ms) — o replay do log inteiro
    // ao conectar não vira 600 renders
    const pend: string[] = []
    let zerar = false

    // troca de run: zera AGORA (senão mostraria o log da anterior até o WS abrir)
    setLinhas([])
    setProgressoWs(null)
    setEsperaWs(undefined)
    setConectando(true)
    setWsVivo(false)
    setDetalhe(null)
    setNaoAchou(false)
    setErroCarga(null)
    setParouAqui(false)

    const flush = () => {
      flushT = undefined
      if (!alive) return
      const novos = pend.splice(0)
      const z = zerar
      zerar = false
      if (!z && !novos.length) return
      setLinhas((prev) => (z ? novos : prev.concat(novos)))
    }
    const agendar = () => {
      if (flushT === undefined) flushT = setTimeout(flush, 80)
    }

    const conectar = async () => {
      if (!alive) return
      try { ws?.close() } catch { /* sem socket antigo */ }
      setConectando(true)
      let st: string | undefined
      try {
        const d = (await api.getRun(runId)) as RunDetalhe
        if (!alive) return
        st = d.status
        setDetalhe(d)
        setErroCarga(null)
        // semeia o log JÁ do getRun: run finalizada mostra o log na hora, sem depender do replay
        // do WS. Pra run rodando, o WS rezera e o server reenvia — sem duplicar.
        if (d.log?.length) {
          setLinhas((prev) => (prev.length ? prev : d.log))
          const p = ultimoProgresso(d.log)
          if (p) setProgressoWs((prev) => prev ?? p)
        }
      } catch (e) {
        if (!alive) return
        const status = (e as { response?: { status?: number } })?.response?.status
        if (status === 404) {
          setNaoAchou(true)
          setConectando(false)
          return
        }
        setErroCarga(erroMsg(e))
      }
      let url: string
      try {
        url = await logsWsUrl(runId)
      } catch {
        if (alive) setConectando(false)
        return
      }
      if (!alive) return
      const sock = new WebSocket(url)
      ws = sock
      // o server reenvia TODO o histórico ao conectar → a próxima leva SUBSTITUI as linhas
      sock.onopen = () => {
        if (!alive || ws !== sock) return
        zerar = true
        pend.length = 0
        falhas = 0
        setWsVivo(true)
      }
      sock.onmessage = (ev) => {
        if (!alive || ws !== sock) return
        setConectando(false)
        const txt = String(ev.data)
        if (txt.startsWith('[progress]')) {
          // barra, não vira linha de log; andou o progresso → não está mais em pausa
          const p = parseProgresso(txt)
          if (p) setProgressoWs(p)
          setEsperaWs(null)
          return
        }
        if (txt.startsWith('[espera-fim]')) {
          setEsperaWs(null)
          return
        }
        if (txt.startsWith('[espera]')) {
          const e2 = parseEspera(txt)
          if (e2) setEsperaWs(e2)
          return
        }
        pend.push(txt)
        agendar()
      }
      sock.onerror = () => {
        if (alive && ws === sock) setConectando(false)
      }
      sock.onclose = async () => {
        if (!alive || ws !== sock) return
        if (flushT !== undefined) { clearTimeout(flushT); flush() }
        setWsVivo(false)
        setConectando(false)
        try {
          const d2 = (await api.getRun(runId)) as RunDetalhe
          if (!alive) return
          setDetalhe((prev) => ({ ...d2, log: prev?.log ?? d2.log }))
          st = d2.status
        } catch { /* mantém o último status */ }
        if (!alive) return
        qc.invalidateQueries({ queryKey: QK.runs })
        if (st && ehAtiva({ status: st })) {
          // caiu com a run viva → reconecta (2s, 4s, 6s… até 15s)
          falhas++
          retry = setTimeout(conectar, Math.min(15000, 2000 * falhas))
        } else {
          // acabou: o saldo/motivo final moram no histórico
          qc.invalidateQueries({ queryKey: QK.historico() })
        }
      }
    }

    conectar()
    return () => {
      alive = false
      if (retry) clearTimeout(retry)
      if (flushT) clearTimeout(flushT)
      try { ws?.close() } catch { /* já fechado */ }
    }
  }, [runId, qc, tentativa])

  const info = live ?? detalhe
  const histRec = hist?.find((h) => h.id === runId)
  // '' = ainda não sei (carregando) — nada de botão Parar piscando pra run que já acabou
  const statusBase = live?.status ?? detalhe?.status ?? histRec?.status ?? ''
  const status = parouAqui && ehAtiva({ status: statusBase }) ? 'parado' : statusBase
  const rodando = !!status && ehAtiva({ status })
  const titulo = info ? tituloDaRun({ ...info, acao: histRec?.acao }, bots) : histRec ? tituloDaRun(histRec, bots) : 'Execução'
  const botNome = info?.bot ? (bots?.[info.bot]?.nome ?? info.bot) : null

  const progresso = wsVivo ? (progressoWs ?? live?.progress ?? null) : (live?.progress ?? progressoWs ?? detalhe?.progress ?? null)
  const espera = rodando ? (wsVivo && esperaWs !== undefined ? esperaWs : (live?.espera ?? null)) : null

  const saldo = useMemo(() => {
    const cheio = (s?: Record<string, unknown> | null) => !!s && Object.keys(s).length > 0
    if (cheio(histRec?.saldo)) return histRec!.saldo
    if (cheio(detalhe?.saldo)) return detalhe!.saldo!
    return saldoDoLog(linhas)
  }, [histRec, detalhe, linhas])

  const conta = useMemo(() => {
    const c = histRec?.conta ?? detalhe?.conta ?? contaDoLog(linhas)
    if (c) return arroba(c)
    return contaDosParams(info?.params, contas)
  }, [histRec, detalhe, linhas, info?.params, contas])

  const iniciou = info?.started_at ?? histRec?.started_at ?? null
  const terminou = info?.ended_at ?? histRec?.ended_at ?? null

  if (naoAchou) {
    return (
      <>
        <Voltar />
        <PageHeader title="Execução" />
        <PageBody>
          <Card>
            <EmptyState
              icon={<SearchX className="h-10 w-10" />}
              title="Não achei essa execução"
              subtitle="Ela não está mais na memória do servidor e não tem log salvo."
              action={
                <Link to="/execucoes">
                  <Button variant="subtle">Ver execuções</Button>
                </Link>
              }
            />
          </Card>
        </PageBody>
      </>
    )
  }

  const carregandoTopo = !info && !histRec && !erroCarga

  return (
    <>
      <Voltar />
      <PageHeader
        title={titulo}
        subtitle={[botNome && botNome !== titulo ? botNome : null, runId, histRec?.dry_run ? 'simulação' : null].filter(Boolean).join(' · ')}
        action={rodando ? <PararRun runId={runId} titulo={titulo} size="md" onParou={() => setParouAqui(true)} /> : undefined}
      />
      <PageBody className="space-y-4">
        {erroCarga && !info && (
          <Card className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-danger/30">
            <p className="text-sm text-danger">Não consegui carregar a execução: {erroCarga}</p>
            <Button variant="subtle" size="sm" onClick={() => setTentativa((n) => n + 1)}>
              <RefreshCw className="h-3.5 w-3.5" />
              Tentar de novo
            </Button>
          </Card>
        )}

        {/* faixa de informações */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-3"
        >
          {carregandoTopo ? (
            [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[74px] rounded-xl" />)
          ) : (
            <>
              <Info label="Status" icon={<Activity className="h-3.5 w-3.5" />}>
                <div className="flex flex-wrap items-center gap-1.5">
                  {status ? <StatusPill status={status} /> : <span className="text-txt-faint">—</span>}
                  {histRec?.bloqueio && <ResultadoBadge res="bloqueio" />}
                </div>
              </Info>
              <Info label="Conta" icon={<CircleUser className="h-3.5 w-3.5" />}>
                {conta ? <span className="text-primary-light">{conta}</span> : <span className="text-txt-faint">—</span>}
              </Info>
              <Info label="Início" icon={<PlayCircle className="h-3.5 w-3.5" />}>
                {fmtDataHora(iniciou)}
                <span className="ml-1.5 text-xs font-medium text-txt-faint">{iniciou ? tempoRelativo(iniciou) : ''}</span>
              </Info>
              <Info label={rodando ? 'Rodando há' : 'Duração'} icon={<Clock className="h-3.5 w-3.5" />}>
                {iniciou ? <DuracaoViva desde={iniciou} ate={rodando ? null : (terminou ?? iniciou)} /> : '—'}
              </Info>
            </>
          )}
        </motion.div>

        {/* progresso + pausa (ao vivo) */}
        {((progresso && progresso.total > 0) || espera) && (
          <Card className="px-5 py-4 space-y-3">
            {progresso && progresso.total > 0 && (
              <BarraProgresso done={progresso.done} total={progresso.total} label={progresso.label} />
            )}
            {espera && <Contagem espera={espera} />}
          </Card>
        )}

        {/* fim: o saldo (e o motivo que o agente mandou) */}
        {!rodando && (saldo || histRec?.motivo) && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
            <Card className="px-5 py-4">
              <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
                <div className="flex items-center gap-2 shrink-0">
                  <Flag className="h-4 w-4 text-primary-light" />
                  <span className="text-[13px] font-bold uppercase tracking-wide text-txt-dim">Saldo final</span>
                  {histRec && <ResultadoBadge res={resultadoDe(histRec)} />}
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <SaldoChips saldo={saldo} vazio={histRec?.motivo ? undefined : 'sem saldo'} />
                  {histRec?.motivo && <p className="text-sm text-txt-dim break-words">{histRec.motivo}</p>}
                </div>
              </div>
            </Card>
          </motion.div>
        )}

        {/* o log */}
        <Card className="p-4 md:p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-[13px] font-bold uppercase tracking-wide text-txt-dim">Log</h2>
            <span
              className={cn(
                'inline-flex items-center gap-1.5 text-[11px] font-semibold',
                rodando ? (wsVivo ? 'text-ok' : 'text-warn') : 'text-txt-faint',
              )}
              title={rodando ? (wsVivo ? 'Recebendo o log ao vivo' : 'Reconectando ao log') : 'Execução encerrada'}
            >
              {wsVivo ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
              {rodando
                ? wsVivo ? 'ao vivo' : conectando ? 'conectando…' : 'reconectando…'
                : conectando ? 'carregando…' : 'encerrado'}
            </span>
          </div>
          <LogView
            runId={runId}
            linhas={linhas}
            rodando={rodando}
            conectando={conectando}
            className="h-[62vh] min-h-[360px] lg:h-[calc(100vh-380px)] lg:min-h-[420px]"
          />
        </Card>
      </PageBody>
    </>
  )
}

function Voltar() {
  return (
    <div className="px-5 md:px-8 pt-5 -mb-3">
      <Link
        to="/execucoes"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-txt-dim hover:text-txt transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Execuções
      </Link>
    </div>
  )
}
