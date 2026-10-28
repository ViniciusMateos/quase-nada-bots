import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowUpRight, Users } from 'lucide-react'
import { Button, Section, Skeleton } from '@/components/ui'
import { Pilula } from '@/components/cronograma/estado'
import { useContas } from '@/lib/queries'
import { resumir, useAgora, useCronograma, usePlano } from '@/components/cronograma/plano'
import { fmtFalta, hhmm } from '@/components/cronograma/tempo'
import { InfoLinha } from './pecas'

/** O cartão "Instagram" dos Ajustes do app (atalho pras contas) + o estado do cronograma. */
export function InstagramCard() {
  const navigate = useNavigate()
  const contas = useContas()
  const cron = useCronograma()
  const agora = useAgora(30_000)   // aqui basta o minuto
  const tarefas = usePlano(cron.data, agora)
  const resumo = useMemo(() => resumir(tarefas), [tarefas])
  const nContas = contas.data?.length ?? 0
  const prox = resumo.proxima

  return (
    <Section title="Instagram" subtitle="Contas e o aquecimento automático" className="h-full">
      <p className="text-xs text-txt-dim leading-relaxed mb-3">
        Adicione e gerencie as contas. Ao verificar, o agente loga sozinho as que faltam.
      </p>

      <InfoLinha label="Contas">
        {contas.isPending ? <Skeleton className="h-4 w-16" /> : (
          <Link to="/contas" className="text-xs font-semibold hover:text-primary-light transition-colors tabular-nums">
            {contas.isError ? 'não deu pra carregar' : `${nContas} ${nContas === 1 ? 'conta' : 'contas'}`}
          </Link>
        )}
      </InfoLinha>
      <InfoLinha label="Cronograma">
        {cron.isPending ? <Skeleton className="h-4 w-36" /> : cron.data ? (
          <Link to="/cronograma" className="inline-flex items-center gap-2 min-w-0 group">
            <Pilula tom={cron.data.ativo ? 'ok' : 'neutro'}>
              {cron.data.ativo ? 'ligado' : 'pausado'}
            </Pilula>
            <span className="text-xs text-txt-dim truncate group-hover:text-txt transition-colors">
              {!cron.data.ativo
                ? 'nada roda sozinho'
                : prox
                  ? <>próxima às <b className="text-txt tabular-nums">{hhmm(prox.hora, prox.min)}</b> na @{prox.conta} ({fmtFalta(prox.falta)})</>
                  : resumo.total ? 'nada mais hoje' : 'nenhuma conta no automático'}
            </span>
            <ArrowUpRight className="h-3.5 w-3.5 text-txt-faint shrink-0" />
          </Link>
        ) : (
          <span className="text-xs text-txt-faint">não deu pra carregar</span>
        )}
      </InfoLinha>

      <div className="flex flex-wrap gap-2 mt-4">
        <Button onClick={() => navigate('/contas')}>
          <Users className="h-4 w-4" /> Contas do Instagram
        </Button>
        <Button variant="subtle" onClick={() => navigate('/cronograma')}>Abrir cronograma</Button>
      </div>
    </Section>
  )
}
