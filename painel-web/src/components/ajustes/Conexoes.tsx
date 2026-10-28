import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowUpRight, Copy, RefreshCw } from 'lucide-react'
import { Button, Section, Skeleton, Spinner, StatusDot } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { api } from '@/lib/api'
import { erroMsg } from '@/lib/apiClient'
import { env } from '@/lib/env'
import { QK, useEmulador } from '@/lib/queries'
import { cn, tempoRelativo } from '@/lib/utils'
import { InfoLinha } from './pecas'

/**
 * O backend em uso e se ele responde. O teste é SÓ LEITURA (GET /bots, o mesmo que a tela de Bots
 * usa): mede o tempo de resposta e aproveita o resultado pro cache compartilhado dos bots.
 */
export function ServidorCard() {
  const qc = useQueryClient()
  const toast = useToast()
  const ping = useQuery({
    queryKey: ['ajustes', 'ping'],
    queryFn: async () => {
      const t0 = performance.now()
      const bots = await api.listBots()
      const ms = Math.round(performance.now() - t0)
      qc.setQueryData(QK.bots, bots)
      return { ms, bots: Object.keys(bots ?? {}).length }
    },
    refetchInterval: 30_000,
    staleTime: 0,
    retry: 0,
  })

  const doEnv = !!import.meta.env.EXPO_PUBLIC_API_URL
  const temToken = !!env.apiToken
  const conferido = Math.max(ping.dataUpdatedAt, ping.errorUpdatedAt)
  const lento = (ping.data?.ms ?? 0) > 1500

  function copiar() {
    navigator.clipboard?.writeText(env.apiBaseUrl)
      .then(() => toast.ok('Endereço copiado'))
      .catch(() => toast.error('Não deu pra copiar'))
  }

  return (
    <Section
      title="Servidor"
      subtitle="O backend dos bots que o painel usa (o mesmo do app)"
      action={
        <Button variant="ghost" size="sm" onClick={() => ping.refetch()} disabled={ping.isFetching}>
          <RefreshCw className={cn('h-3.5 w-3.5', ping.isFetching && 'animate-spin')} />
          Testar de novo
        </Button>
      }
      className="h-full"
    >
      {/* status grande */}
      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface2/40 px-4 py-3 mb-3">
        {ping.isPending ? (
          <>
            <Spinner className="h-5 w-5" />
            <div>
              <p className="text-sm font-bold text-txt">Testando…</p>
              <p className="text-xs text-txt-dim">perguntando a lista de bots pro servidor</p>
            </div>
          </>
        ) : ping.isError ? (
          <>
            <StatusDot tone="danger" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-danger">Sem resposta</p>
              <p className="text-xs text-txt-dim truncate">{erroMsg(ping.error)}</p>
            </div>
          </>
        ) : (
          <>
            <StatusDot tone={lento ? 'warn' : 'ok'} pulse />
            <div className="min-w-0">
              <p className={cn('text-sm font-bold', lento ? 'text-warn' : 'text-ok')}>{lento ? 'Respondendo, mas lento' : 'Respondendo'}</p>
              <p className="text-xs text-txt-dim">
                {ping.data.bots} {ping.data.bots === 1 ? 'bot' : 'bots'} · conferido {tempoRelativo(Math.floor(conferido / 1000))}
              </p>
            </div>
            <div className="flex-1" />
            <span className="text-lg font-extrabold tabular-nums text-txt">
              {ping.data.ms}<span className="text-xs font-semibold text-txt-dim ml-0.5">ms</span>
            </span>
          </>
        )}
      </div>

      <InfoLinha label="Endereço">
        <span className="font-mono text-xs truncate" title={env.apiBaseUrl}>{env.apiBaseUrl}</span>
        <button
          type="button"
          onClick={copiar}
          title="Copiar endereço"
          className="h-7 w-7 shrink-0 rounded-lg flex items-center justify-center text-txt-faint hover:text-txt hover:bg-surface2 transition-colors"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      </InfoLinha>
      <InfoLinha label="Configurado em">
        <span className="text-xs text-txt-dim">{doEnv ? 'frontend/.env.local (o mesmo do app)' : 'padrão do painel (sem .env.local)'}</span>
      </InfoLinha>
      <InfoLinha label="Token">
        <StatusDot tone={temToken ? 'ok' : 'warn'} />
        <span className={cn('text-xs font-semibold', temToken ? 'text-txt' : 'text-warn')}>
          {temToken ? 'configurado' : 'faltando — o servidor vai recusar'}
        </span>
      </InfoLinha>
    </Section>
  )
}

/** O agente do emulador (o PC que roda os bots no MuMu): está no ar? — só leitura. */
export function AgenteCard() {
  const { data, isError, isPending, error } = useEmulador()
  const online = !!data?.online && !isError
  const n = data?.contas_logadas?.length ?? 0

  return (
    <Section
      title="Agente do emulador"
      subtitle="O programa do PC que toca no Instagram do emulador"
      action={
        <Link to="/visao-geral" className="inline-flex items-center gap-1 h-8 px-3 rounded-lg text-xs font-semibold text-txt-dim hover:text-txt hover:bg-surface2 transition-colors">
          Visão geral <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      }
      className="h-full"
    >
      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface2/40 px-4 py-3 mb-3">
        {isPending ? (
          <>
            <Skeleton className="h-2.5 w-2.5 rounded-full" />
            <div className="space-y-1.5 flex-1">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3 w-44" />
            </div>
          </>
        ) : (
          <>
            <StatusDot tone={online ? 'ok' : 'danger'} pulse={online} />
            <div className="min-w-0">
              <p className={cn('text-sm font-bold', online ? 'text-ok' : 'text-danger')}>
                {online ? 'Online' : isError ? 'Indisponível' : 'Offline'}
              </p>
              <p className="text-xs text-txt-dim truncate">
                {online
                  ? `${n} ${n === 1 ? 'conta logada' : 'contas logadas'}`
                  : isError ? erroMsg(error) : 'o agente do PC não respondeu'}
              </p>
            </div>
          </>
        )}
      </div>

      <InfoLinha label="Aparelho">
        <span className="font-mono text-xs">{data?.device || '—'}</span>
      </InfoLinha>
      <InfoLinha label="Último sinal">
        <span className="text-xs tabular-nums">{tempoRelativo(data?.ultimo_ping)}</span>
      </InfoLinha>
      <InfoLinha label="Conta aberta agora">
        <span className="text-xs font-semibold truncate">{data?.conta_ativa ? `@${data.conta_ativa}` : '—'}</span>
        {data?.sessao && (
          <span className={cn('text-[11px] font-semibold', data.sessao === 'viva' ? 'text-ok' : 'text-txt-faint')}>
            {data.sessao === 'viva' ? 'sessão viva' : 'não deu pra ler'}
          </span>
        )}
      </InfoLinha>
    </Section>
  )
}
