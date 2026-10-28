// Hooks de dados COMPARTILHADOS (react-query): toda página usa estes em vez de chamar api.* e
// fazer polling por conta própria — assim a sidebar, a visão geral e as telas batem no mesmo
// cache. Mutations invalidam pelas chaves de QK.
import { useQuery } from '@tanstack/react-query'
import { api, type Account, type Bot, type EmuladorStatus, type Grupo, type RunInfo } from '@/lib/api'
import { cmpTexto } from '@/lib/ordenar'

export const QK = {
  bots: ['bots'] as const,
  modos: (bot: string) => ['modos', bot] as const,
  chats: (bot: string) => ['chats', bot] as const,
  runs: ['runs'] as const,
  run: (id: string) => ['run', id] as const,
  historico: (bot?: string) => ['historico', bot ?? '*'] as const,
  contas: ['contas'] as const,
  grupos: ['grupos'] as const,
  emulador: ['emulador'] as const,
  cronograma: ['cronograma'] as const,
  gmails: ['gmails'] as const,
}

/** Bots do backend ({id: Bot}). */
export function useBots() {
  return useQuery({ queryKey: QK.bots, queryFn: api.listBots, staleTime: 60_000 })
}

/** Runs (ativas e recentes) — polling de 3s: é o "pulso" do painel. */
export function useRuns() {
  return useQuery<RunInfo[]>({ queryKey: QK.runs, queryFn: api.listRuns, refetchInterval: 3000 })
}

/** Só as ativas (iniciando/rodando). */
export function useRunsAtivas() {
  const q = useRuns()
  const ativas = (q.data ?? []).filter((r) => r.status === 'rodando' || r.status === 'iniciando')
  return { ...q, ativas }
}

/** Status do agente do emulador (online, contas logadas, sessões) — polling de 10s. */
export function useEmulador() {
  return useQuery<EmuladorStatus>({ queryKey: QK.emulador, queryFn: api.emuladorStatus, refetchInterval: 10_000 })
}

/** Contas do app, em ordem natural (segue2 antes de segue10). */
export function useContas() {
  return useQuery<Account[]>({
    queryKey: QK.contas,
    queryFn: async () => (await api.getAccounts()).slice().sort((a, b) => cmpTexto(a.label, b.label)),
  })
}

export function useGrupos() {
  return useQuery<Grupo[]>({ queryKey: QK.grupos, queryFn: api.getGrupos })
}

export type { Bot }
