// Dados e regras do cronograma no painel: a query do plano do dia, o relógio que ticka, o estado de
// cada tarefa (feita / pulada / próxima…) e o liga/desliga. As regras espelham o backend
// (backend/cronograma.py) — se mudarem lá, mudar aqui.
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type Cronograma, type CronTarefa, type RunInfo } from '@/lib/api'
import { erroMsg } from '@/lib/apiClient'
import { QK, useRuns } from '@/lib/queries'
import { cmpTexto } from '@/lib/ordenar'
import { useToast } from '@/components/Toast'
import { instanteSP, type Instante } from './tempo'

// Faixas do sorteio (cronograma.py _MANHA/_TARDE, em minutos do dia): 1x de manhã + 1x de tarde
// por conta. Teto às 17h de propósito: a noite fica livre pro auto-follow/DM manual.
export const FAIXA_MANHA: [number, number] = [10 * 60, 13 * 60 + 30]
export const FAIXA_TARDE: [number, number] = [13 * 60 + 30, 17 * 60]
// tem bot rodando na hora → o cronograma espera a vaga até 2h; passou disso, pula (_tick)
export const ESPERA_MAX_MIN = 120

const NOME_BOT: Record<string, string> = {
  'auto-follow': 'Auto Follow', 'dm-followers': 'DM Followers', 'human-warmup': 'Aquecimento Humano',
}
export const nomeBot = (b: string) => NOME_BOT[b] || b

export type Estado =
  | 'rodando'    // a run que o cronograma disparou está no ar agora
  | 'feita'      // enviado (rodou automático)
  | 'pulada'     // passou da hora sem rodar (pausado, ou 2h na fila) — não roda atrasado
  | 'esperando'  // passou da hora, tem bot rodando → espera a vaga (até 2h)
  | 'comecando'  // passou da hora, nada rodando → o servidor pega no próximo tick (≤ 1 min)
  | 'proxima'    // a próxima que vai rodar
  | 'futura'     // mais pra frente
  | 'pausada'    // cronograma desligado

export type TarefaVista = CronTarefa & {
  key: string
  minuto: number            // minuto do dia (hora de Brasília)
  estado: Estado
  falta: number             // segundos até o horário (negativo = já passou)
  run: RunInfo | null       // a run que o cronograma disparou pra ela (se ainda está em /runs)
}

export const runAtiva = (r?: RunInfo | null) => !!r && (r.status === 'rodando' || r.status === 'iniciando')

/** O plano do dia (GET /cronograma). Polling leve: o servidor marca as tarefas a cada minuto. */
export function useCronograma() {
  return useQuery<Cronograma>({ queryKey: QK.cronograma, queryFn: api.getCronograma, refetchInterval: 20_000 })
}

/** Relógio de Brasília que ticka (padrão 1s) — pra contagem regressiva e a linha do "agora". */
export function useAgora(intervalo = 1000): Instante {
  const [agora, setAgora] = useState(() => instanteSP())
  useEffect(() => {
    const id = setInterval(() => setAgora(instanteSP()), intervalo)
    return () => clearInterval(id)
  }, [intervalo])
  return agora
}

const minutoDe = (t: Pick<CronTarefa, 'hora' | 'min'>) => t.hora * 60 + t.min

function difDias(a: string, b: string): number {
  const [ya, ma, da] = a.split('-').map(Number)
  const [yb, mb, db] = b.split('-').map(Number)
  if (!ya || !yb) return 0
  return Math.round((Date.UTC(ya, ma - 1, da) - Date.UTC(yb, mb - 1, db)) / 86_400_000)
}

/**
 * Casa cada tarefa com a run que o cronograma disparou pra ela: bot igual, `params.cronograma`,
 * mesma conta, começou no dia do plano entre o horário da tarefa e o fim da espera (2h) — e antes
 * da próxima tarefa da MESMA conta (senão a run da tarde cairia na tarefa da manhã pulada).
 */
function casarRuns(tarefas: CronTarefa[], data: string, runs: RunInfo[]): Map<CronTarefa, RunInfo> {
  const out = new Map<CronTarefa, RunInfo>()
  const doCron = runs
    .filter((r) => r.started_at && (r.params as { cronograma?: unknown } | null)?.cronograma === true)
    .map((r) => ({ r, conta: (r.params as { conta_id?: unknown }).conta_id, i: instanteSP(r.started_at * 1000) }))
    .filter((x) => x.i.data === data)
  if (!doCron.length) return out
  for (const t of tarefas) {
    if (!t.conta_id) continue
    const ini = minutoDe(t)
    let fim = ini + ESPERA_MAX_MIN + 5
    for (const o of tarefas) {
      const m = minutoDe(o)
      if (o.conta_id === t.conta_id && m > ini && m < fim) fim = m
    }
    let melhor: RunInfo | null = null
    for (const x of doCron) {
      if (x.r.bot !== t.bot || x.conta !== t.conta_id) continue
      if (x.i.seg < ini * 60 - 60 || x.i.seg >= fim * 60) continue
      if (!melhor || x.r.started_at < melhor.started_at) melhor = x.r
    }
    if (melhor) out.set(t, melhor)
  }
  return out
}

/** Tarefas do dia em ordem de horário, já com o estado de cada uma no instante `agora`. */
export function usePlano(cron: Cronograma | undefined, agora: Instante): TarefaVista[] {
  const { data: runs } = useRuns()
  const temBotRodando = (runs ?? []).some(runAtiva)
  const ordenadas = useMemo(
    () => (cron?.tarefas ?? []).slice().sort((a, b) => minutoDe(a) - minutoDe(b) || cmpTexto(a.conta, b.conta)),
    [cron],
  )
  const runsPorTarefa = useMemo(
    () => (cron ? casarRuns(ordenadas, cron.data, runs ?? []) : new Map<CronTarefa, RunInfo>()),
    [cron, ordenadas, runs],
  )
  return useMemo(() => {
    if (!cron) return []
    // plano de outro dia (ex.: virou a meia-noite e o refetch ainda não veio) → horário relativo
    const offset = difDias(cron.data, agora.data) * 86_400
    let achouProxima = false
    return ordenadas.map((t, i) => {
      const minuto = minutoDe(t)
      const falta = offset + minuto * 60 - agora.seg
      const run = runsPorTarefa.get(t) ?? null
      let estado: Estado
      if (t.pulado) estado = 'pulada'
      else if (runAtiva(run)) estado = 'rodando'
      else if (t.enviado) estado = 'feita'
      else if (!cron.ativo) estado = 'pausada'
      else if (falta <= 0) estado = temBotRodando ? 'esperando' : 'comecando'
      else if (!achouProxima) { estado = 'proxima'; achouProxima = true }
      else estado = 'futura'
      return { ...t, key: `${t.conta_id ?? t.conta}-${minuto}-${i}`, minuto, estado, falta, run }
    })
  }, [cron, ordenadas, runsPorTarefa, agora, temBotRodando])
}

export type Resumo = {
  total: number; feitas: number; puladas: number; restantes: number; contas: number
  proxima?: TarefaVista; rodando?: TarefaVista; esperando?: TarefaVista
  /** com o cronograma pausado: o que rodaria primeiro se ligasse agora */
  proximaSeLigar?: TarefaVista
}

export function resumir(tarefas: TarefaVista[]): Resumo {
  const r: Resumo = { total: tarefas.length, feitas: 0, puladas: 0, restantes: 0, contas: 0 }
  r.contas = new Set(tarefas.map((t) => t.conta_id ?? t.conta)).size
  for (const t of tarefas) {
    if (t.estado === 'feita' || t.estado === 'rodando') r.feitas++
    else if (t.estado === 'pulada') r.puladas++
    else r.restantes++
    if (t.estado === 'proxima') r.proxima = t
    if (t.estado === 'rodando' && !r.rodando) r.rodando = t
    if ((t.estado === 'esperando' || t.estado === 'comecando') && !r.esperando) r.esperando = t
    if (t.estado === 'pausada' && t.falta > 0 && !r.proximaSeLigar) r.proximaSeLigar = t
  }
  return r
}

/** Liga/desliga o rodar automático (PUT /cronograma), otimista + toast. */
export function useAlternarCronograma() {
  const qc = useQueryClient()
  const toast = useToast()
  const m = useMutation({
    mutationFn: (ativo: boolean) => api.setCronograma(ativo),
    onMutate: async (ativo: boolean) => {
      await qc.cancelQueries({ queryKey: QK.cronograma })
      const antes = qc.getQueryData<Cronograma>(QK.cronograma)
      if (antes) qc.setQueryData<Cronograma>(QK.cronograma, { ...antes, ativo })
      return { antes }
    },
    onError: (e, _ativo, ctx) => {
      if (ctx?.antes) qc.setQueryData(QK.cronograma, ctx.antes)
      toast.error(`Não deu pra salvar: ${erroMsg(e)}`)
    },
    onSuccess: (_r, ativo) => {
      toast.ok(ativo ? 'Cronograma ligado. Volta a partir do próximo horário.' : 'Cronograma pausado. Nada roda sozinho.')
    },
    // ao ligar, o servidor marca como pulado o que já passou → busca o plano de novo
    onSettled: () => qc.invalidateQueries({ queryKey: QK.cronograma }),
  })
  return { alternar: (ativo: boolean) => m.mutate(ativo), salvando: m.isPending }
}
