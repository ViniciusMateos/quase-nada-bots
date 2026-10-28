import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, RefreshCw, TriangleAlert } from 'lucide-react'
import { Button, EmptyState, PageBody, PageHeader, Section, Skeleton } from '@/components/ui'
import { ConfirmModal } from '@/components/Modal'
import { erroMsg } from '@/lib/apiClient'
import { cn } from '@/lib/utils'
import { ComoFunciona } from '@/components/cronograma/ComoFunciona'
import { Pilula } from '@/components/cronograma/estado'
import { LinhaDoTempo } from '@/components/cronograma/LinhaDoTempo'
import { PainelAutomatico } from '@/components/cronograma/PainelAutomatico'
import { ProximaTarefa } from '@/components/cronograma/ProximaTarefa'
import { TabelaTarefas } from '@/components/cronograma/TabelaTarefas'
import { resumir, useAgora, useAlternarCronograma, useCronograma, usePlano } from '@/components/cronograma/plano'
import { fmtDataPlano } from '@/components/cronograma/tempo'

// Cronograma = o plano do dia do AQUECIMENTO automático (equivale ao CronogramaScreen do app):
// o servidor sorteia os horários, roda sozinho na hora e o painel mostra a linha do tempo do dia.
export default function Cronograma() {
  const q = useCronograma()
  const cron = q.data
  const agora = useAgora(1000)
  const tarefas = usePlano(cron, agora)
  const resumo = useMemo(() => resumir(tarefas), [tarefas])
  const { alternar, salvando } = useAlternarCronograma()
  const [confirmarPausa, setConfirmarPausa] = useState(false)
  const [foco, setFoco] = useState<string | null>(null)
  // gira só no "atualizar" na mão (o polling de 20s acontece calado)
  const [atualizando, setAtualizando] = useState(false)
  const atualizar = () => {
    setAtualizando(true)
    q.refetch().finally(() => setAtualizando(false))
  }

  // ligar é direto (igual o app); pausar pede confirmação — o que passar pausado é pulado
  const pedirAlternar = (v: boolean) => (v ? alternar(true) : setConfirmarPausa(true))

  const depois = useMemo(() => {
    const i = tarefas.findIndex((t) => t.estado === 'proxima')
    return i >= 0 ? tarefas.slice(i + 1).find((t) => t.estado === 'futura') : undefined
  }, [tarefas])

  const subtitulo = cron
    ? `${fmtDataPlano(cron.data)} · aquecimento · 2x por conta`
    : 'O plano do dia do aquecimento automático'

  const acao = (
    <div className="flex items-center gap-2">
      {cron && (
        <Pilula tom={cron.ativo ? 'ok' : 'neutro'} className="h-6 px-2.5">
          {cron.ativo ? 'Ligado' : 'Pausado'}
        </Pilula>
      )}
      <Button variant="ghost" size="icon" title="Atualizar" onClick={atualizar} disabled={atualizando}>
        <RefreshCw className={cn('h-4 w-4', atualizando && 'animate-spin')} />
      </Button>
    </div>
  )

  return (
    <>
      <PageHeader title="Cronograma" subtitle={subtitulo} action={acao} />
      <PageBody className="space-y-4">
        {q.isLoading ? (
          <Carregando />
        ) : !cron ? (
          <Section>
            <EmptyState
              icon={<TriangleAlert className="h-10 w-10" />}
              title="Não deu pra carregar o cronograma"
              subtitle={q.error ? erroMsg(q.error) : 'O servidor não respondeu.'}
              action={<Button variant="subtle" onClick={() => q.refetch()} loading={q.isFetching}>Tentar de novo</Button>}
            />
          </Section>
        ) : (
          <>
            {q.isError && (
              <div className="flex items-center gap-2 rounded-xl border border-warn/30 bg-warn/[0.07] px-4 py-2.5 text-xs text-warn">
                <TriangleAlert className="h-4 w-4 shrink-0" />
                Não deu pra atualizar agora ({erroMsg(q.error)}). Mostrando o último plano carregado.
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <ProximaTarefa
                  ativo={cron.ativo}
                  resumo={resumo}
                  depois={depois}
                  onLigar={() => alternar(true)}
                  salvando={salvando}
                />
              </div>
              <PainelAutomatico ativo={cron.ativo} resumo={resumo} onAlternar={pedirAlternar} salvando={salvando} />
            </div>

            <Section
              title="Linha do tempo"
              subtitle="Hoje, no horário de Brasília. Passe o mouse num horário pra ver os detalhes; clique pra abrir a execução."
            >
              {tarefas.length ? (
                <LinhaDoTempo tarefas={tarefas} agora={agora} data={cron.data} foco={foco} onFoco={setFoco} />
              ) : (
                <EmptyState
                  icon={<CalendarClock className="h-10 w-10" />}
                  title="Nada agendado hoje"
                  subtitle="Nenhuma conta entra no aquecimento. Só entram as marcadas pro servidor e sem cadeado."
                  action={
                    <Link to="/contas" className="inline-flex items-center h-10 px-4 rounded-xl text-sm font-semibold bg-surface2 text-txt hover:bg-border transition-colors">
                      Ir pras contas
                    </Link>
                  }
                />
              )}
            </Section>

            {tarefas.length > 0 && (
              <Section
                title="Tarefas do dia"
                subtitle={`${resumo.total} ${resumo.total === 1 ? 'tarefa' : 'tarefas'} · ${resumo.contas} ${resumo.contas === 1 ? 'conta' : 'contas'}`}
              >
                <TabelaTarefas tarefas={tarefas} foco={foco} onFoco={setFoco} />
              </Section>
            )}

            <Section title="Como funciona">
              <ComoFunciona />
            </Section>
          </>
        )}
      </PageBody>

      <ConfirmModal
        open={confirmarPausa}
        onClose={() => setConfirmarPausa(false)}
        onConfirm={() => alternar(false)}
        title="Pausar o cronograma?"
        message="Nada roda sozinho até você ligar de novo. Os horários que passarem enquanto estiver pausado são pulados — ao ligar, volta a partir do próximo."
        confirmText="Pausar"
        danger
      />
    </>
  )
}

function Carregando() {
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl2 border border-border bg-surface p-6 space-y-3">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-14 w-56 mt-5" />
        </div>
        <div className="rounded-xl2 border border-border bg-surface p-5 space-y-3">
          <div className="flex items-start gap-3">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
            <Skeleton className="h-6 w-11 rounded-full" />
          </div>
          <div className="grid grid-cols-3 gap-3 pt-6">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}
          </div>
        </div>
      </div>
      <div className="rounded-xl2 border border-border bg-surface p-5 space-y-3">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-8 w-full" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 flex-1" />
          </div>
        ))}
      </div>
      <div className="rounded-xl2 border border-border bg-surface p-5 space-y-3">
        <Skeleton className="h-3 w-28" />
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    </>
  )
}
