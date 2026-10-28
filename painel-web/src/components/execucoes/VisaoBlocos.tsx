// Blocos da Visão geral: atalhos pros bots do emulador e as últimas execuções do histórico.
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronRight, History as IconeHistorico } from 'lucide-react'
import type { Bot, RunHistorico, RunInfo } from '@/lib/api'
import { ehProcessoDeConta, nomeDoProcesso } from '@/lib/processo'
import { arroba, tempoRelativo } from '@/lib/utils'
import { Section, Skeleton } from '@/components/ui'
import { Ponto, ProcessoIcone, ResultadoBadge, SaldoChips } from './pecas'
import { NOMES_ACAO, chaveRun, fmtDur, resultadoDe } from './runUtils'

// Bots que rodam NO EMULADOR (device real) — mesma lista da aba Emulador do app. Fallback cobre
// backend que não devolva o bot em /bots. Criar/Remover conta têm tela própria.
const BOTS_EMULADOR: { id: string; nomeFallback: string; descFallback: string; rota?: string }[] = [
  { id: 'auto-follow', nomeFallback: 'Auto Follow', descFallback: 'Segue os curtidores dos posts compartilhados num chat.' },
  { id: 'dm-followers', nomeFallback: 'DM Followers', descFallback: 'Manda DM de obrigado pros novos seguidores de cada conta.' },
  { id: 'story-brecho', nomeFallback: 'Story Repost', descFallback: 'Posta as peças disponíveis no story do brechó pelo app.' },
  {
    id: 'criar-conta', nomeFallback: 'Criar Conta', rota: '/contas/criar',
    descFallback: 'Começa a conta nova no emulador até o código do e-mail; o resto você termina.',
  },
  {
    id: 'remover-conta', nomeFallback: 'Remover Contas', rota: '/contas/remover',
    descFallback: 'Tira contas do app do Instagram no emulador pra liberar vaga.',
  },
]

export function AtalhosBots({ bots, ativas }: { bots?: Record<string, Bot>; ativas: RunInfo[] }) {
  return (
    <Section
      title="Bots"
      action={
        <Link to="/bots" className="text-xs font-semibold text-txt-dim hover:text-txt transition-colors">
          ver todos
        </Link>
      }
      bodyClassName="px-2 pb-2"
    >
      <div>
        {BOTS_EMULADOR.map((b, i) => {
          const real = bots?.[b.id]
          const nome = real?.nome ?? b.nomeFallback
          const desc = real?.descricao ?? b.descFallback
          // rodando? (login/verificar usam o auto-follow como veículo — não contam como o bot)
          const rodando = ativas.some((r) => r.bot === b.id && !ehProcessoDeConta(r))
          return (
            <motion.div
              key={b.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: i * 0.04 }}
            >
              <Link
                to={b.rota ?? `/bots/${b.id}`}
                className="group flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-surface2/70 transition-colors"
              >
                <ProcessoIcone run={{ bot: b.id }} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-semibold text-txt">
                    <span className="truncate">{nome}</span>
                    {rodando && (
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-primary-light shrink-0">
                        <Ponto tone="ativo" pulse />
                        rodando
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-txt-dim line-clamp-2">{desc}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-txt-faint group-hover:text-txt group-hover:translate-x-0.5 transition-all shrink-0" />
              </Link>
            </motion.div>
          )
        })}
      </div>
    </Section>
  )
}

export function UltimasRuns({
  regs,
  carregando,
  bots,
  qtd = 7,
}: {
  regs?: RunHistorico[]
  carregando: boolean
  bots?: Record<string, Bot>
  qtd?: number
}) {
  const ultimas = [...(regs ?? [])].sort((a, b) => (b.ended_at ?? 0) - (a.ended_at ?? 0)).slice(0, qtd)
  const nomeDe = (k: string) => NOMES_ACAO[k] ?? bots?.[k]?.nome ?? k
  return (
    <Section
      title="Últimas execuções"
      action={
        <Link to="/historico" className="text-xs font-semibold text-txt-dim hover:text-txt transition-colors">
          ver histórico
        </Link>
      }
      bodyClassName="px-2 pb-2"
    >
      {carregando ? (
        <div className="space-y-2 px-3 pb-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </div>
      ) : !ultimas.length ? (
        <div className="flex flex-col items-center text-center py-8">
          <IconeHistorico className="h-8 w-8 text-txt-faint mb-2" />
          <p className="text-sm text-txt-dim">Nada no histórico ainda.</p>
        </div>
      ) : (
        <div>
          {ultimas.map((r, i) => {
            const titulo = nomeDoProcesso(r.acao ?? null, r.titulo) ?? nomeDe(chaveRun(r))
            const dur = fmtDur(r.duracao_s)
            const conteudo = (
              <>
                <ProcessoIcone run={r} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-txt truncate">
                    {titulo}
                    {r.dry_run && <span className="ml-2 text-[11px] font-semibold text-warn">simulação</span>}
                  </p>
                  <p className="text-xs text-txt-dim truncate tabular-nums">
                    {r.conta && <span className="text-primary-light font-semibold">{arroba(r.conta)} · </span>}
                    {tempoRelativo(r.ended_at)}
                    {dur ? ` · ${dur}` : ''}
                  </p>
                </div>
                <div className="hidden sm:block max-w-[45%] min-w-0">
                  {r.acao ? (
                    <span className="text-xs text-txt-dim line-clamp-1">{r.motivo || NOMES_ACAO[chaveRun(r)] || r.acao}</span>
                  ) : (
                    <SaldoChips saldo={r.saldo} className="justify-end" />
                  )}
                </div>
                <ResultadoBadge res={resultadoDe(r)} />
              </>
            )
            return (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: i * 0.035 }}
              >
                {r.backfill ? (
                  <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">{conteudo}</div>
                ) : (
                  <Link to={`/execucoes/${r.id}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-surface2/70 transition-colors">
                    {conteudo}
                  </Link>
                )}
              </motion.div>
            )
          })}
        </div>
      )}
    </Section>
  )
}

/** Compacto "nada rodando" (com atalho pros bots). */
export function NadaRodando() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-border px-4 py-4">
      <span className="h-2.5 w-2.5 rounded-full bg-txt-faint/60" />
      <p className="text-sm text-txt-dim flex-1">Nada rodando agora.</p>
      <Link to="/bots" className="text-xs font-semibold text-primary-light hover:text-primary">
        abrir bots
      </Link>
    </div>
  )
}
