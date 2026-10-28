// Remover Contas DO EMULADOR — versão painel do RemoverContasScreen do app. O agente do PC entra
// em cada conta escolhida e termina a sessão no app do IG, uma por vez — libera vaga no teto de ~10
// contas por aparelho. A conta NÃO é apagada do Instagram nem do app: só sai do emulador.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { LoaderCircle, RefreshCw, Smartphone, TriangleAlert, UserMinus } from 'lucide-react'
import { Button, EmptyState, PageBody, Section, Skeleton } from '@/components/ui'
import { ConfirmModal } from '@/components/Modal'
import { api } from '@/lib/api'
import { erroMsg } from '@/lib/apiClient'
import { cmpTexto } from '@/lib/ordenar'
import { QK, useEmulador } from '@/lib/queries'
import { ehUsername } from '@/lib/syncEmulador'
import { cn } from '@/lib/utils'
import { CabecalhoMigalha, Caixa, Faixa, Selo } from '@/components/contas/pecas'
import type { SessaoEmul, Tom } from '@/components/contas/modelo'

function seloSessao(s?: SessaoEmul): { texto: string; tom: Tom } {
  if (s === 'ok') return { texto: 'sessão ok', tom: 'ok' }
  if (s === 'bloqueada') return { texto: 'bloqueada', tom: 'danger' }
  if (s === 'senha_incorreta') return { texto: 'senha incorreta', tom: 'danger' }
  return { texto: 'logada', tom: 'ok' }
}

export default function RemoverContas() {
  const qc = useQueryClient()
  const nav = useNavigate()
  const emulQ = useEmulador()
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())
  const [confirmar, setConfirmar] = useState(false)
  const [disparando, setDisparando] = useState(false)
  const [msg, setMsg] = useState('')

  // lista fresca ao abrir (o app lê o status na hora)
  useEffect(() => {
    qc.invalidateQueries({ queryKey: QK.emulador })
  }, [qc])

  const logadas = useMemo(
    () => (emulQ.data?.contas_logadas ?? []).filter(ehUsername).sort(cmpTexto),
    [emulQ.data],
  )
  const sessoes = emulQ.data?.sessoes ?? {}
  const escolhidas = logadas.filter((u) => marcadas.has(u))
  const todas = logadas.length > 0 && escolhidas.length === logadas.length

  function alternar(u: string) {
    setMarcadas((s) => {
      const n = new Set(s)
      if (n.has(u)) n.delete(u)
      else n.add(u)
      return n
    })
  }

  async function remover() {
    setDisparando(true)
    setMsg('')
    try {
      const run = await api.startRun('remover-conta', { contas: escolhidas })
      qc.invalidateQueries({ queryKey: QK.runs })
      nav(`/execucoes/${run.id}`)
    } catch (e) {
      setMsg(erroMsg(e) || 'erro ao disparar')
    }
    setDisparando(false)
  }

  const carregando = emulQ.isLoading
  const erro = emulQ.isError && !emulQ.data
  const offline = !!emulQ.data && !emulQ.data.online

  return (
    <>
      <CabecalhoMigalha
        trilha={[{ label: 'Contas', to: '/contas' }, { label: 'Remover' }]}
        title="Remover contas"
        subtitle="Tira contas do emulador pra abrir vaga no limite de ~10 por aparelho."
      />
      <PageBody>
        <div className="grid gap-5 items-start xl:grid-cols-[minmax(0,1fr)_360px]">
          {/* ── como funciona ── */}
          <Section title="Como funciona" className="xl:order-2">
            <div className="flex gap-3">
              <div className="h-9 w-9 rounded-lg bg-surface2 border border-border flex items-center justify-center shrink-0 text-txt-dim">
                <Smartphone className="h-4 w-4" />
              </div>
              <p className="text-sm text-txt-dim leading-relaxed">
                O bot entra em cada conta marcada e termina a sessão no app do Instagram do emulador, uma por vez.
                Serve pra abrir vaga no limite de ~10 contas por aparelho. A conta{' '}
                <strong className="text-txt font-semibold">não é apagada</strong>: continua no Instagram e aqui no
                painel, só deixa de ser usada no emulador.
              </p>
            </div>
          </Section>

          {/* ── lista ── */}
          <Section
            className="xl:order-1"
            title={
              <span className="tabular-nums">
                Logadas no emulador ({logadas.length})
              </span>
            }
            subtitle={escolhidas.length ? `${escolhidas.length} marcada${escolhidas.length === 1 ? '' : 's'}` : 'Marque as contas que vão sair.'}
            action={
              <>
                {logadas.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setMarcadas(todas ? new Set() : new Set(logadas))}
                  >
                    {todas ? 'Desmarcar todas' : 'Marcar todas'}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  title="Recarregar"
                  aria-label="Recarregar"
                  onClick={() => emulQ.refetch()}
                  disabled={emulQ.isFetching}
                >
                  <RefreshCw className={cn('h-4 w-4', emulQ.isFetching && 'animate-spin')} />
                </Button>
              </>
            }
          >
            <AnimatePresence initial={false}>
              {offline && (
                <Faixa key="off" tom="warn" icon={TriangleAlert} className="mb-4">
                  <strong className="text-warn font-semibold">PC do emulador offline</strong> — a lista pode estar
                  desatualizada.
                </Faixa>
              )}
            </AnimatePresence>

            {carregando ? (
              <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-14 rounded-xl" />
                ))}
              </div>
            ) : erro ? (
              <EmptyState
                icon={<TriangleAlert className="h-10 w-10" />}
                title="Não consegui ler as contas do emulador."
                subtitle={erroMsg(emulQ.error)}
                action={
                  <Button variant="subtle" onClick={() => emulQ.refetch()}>
                    <RefreshCw className="h-4 w-4" />
                    Tentar de novo
                  </Button>
                }
              />
            ) : logadas.length === 0 ? (
              <EmptyState
                icon={<Smartphone className="h-10 w-10" />}
                title="Nenhuma conta logada"
                subtitle="Nenhuma conta logada (ou o PC do emulador está offline)."
              />
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
                {logadas.map((u, i) => {
                  const on = marcadas.has(u)
                  const st = seloSessao(sessoes[u])
                  return (
                    <motion.button
                      key={u}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => alternar(u)}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.22, delay: Math.min(i, 12) * 0.03 }}
                      whileHover={{ y: -1 }}
                      className={cn(
                        'flex items-center gap-3 h-14 px-3.5 rounded-xl border text-left transition-colors',
                        on ? 'border-danger/50 bg-danger/[0.08]' : 'border-border bg-surface2/40 hover:bg-surface2',
                      )}
                    >
                      <Caixa marcado={on} tom="danger" />
                      <span className="flex-1 min-w-0 truncate text-sm font-semibold text-txt">@{u}</span>
                      <Selo texto={st.texto} tom={st.tom} />
                    </motion.button>
                  )
                })}
              </div>
            )}

            <AnimatePresence>
              {!!msg && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-4 text-sm text-danger"
                >
                  {msg}
                </motion.p>
              )}
            </AnimatePresence>

            <div className="mt-5 pt-5 border-t border-border flex flex-col-reverse sm:flex-row sm:items-center gap-3">
              <p className="text-xs text-txt-faint flex-1 leading-relaxed">
                Roda uma conta por vez; dá pra acompanhar o log na execução.
              </p>
              <Button
                variant="danger"
                size="lg"
                className="sm:min-w-[220px]"
                onClick={() => setConfirmar(true)}
                disabled={!escolhidas.length || disparando}
              >
                {disparando ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UserMinus className="h-4 w-4" />}
                {disparando
                  ? 'Disparando…'
                  : escolhidas.length
                    ? `Tirar ${escolhidas.length} do emulador`
                    : 'Marque as contas'}
              </Button>
            </div>
          </Section>
        </div>
      </PageBody>

      <ConfirmModal
        open={confirmar}
        onClose={() => setConfirmar(false)}
        onConfirm={remover}
        title="Tirar do emulador"
        message={`Terminar a sessão de ${escolhidas.map((x) => '@' + x).join(', ')} no emulador? A conta continua existindo no Instagram e salva no app.`}
        confirmText="Tirar"
        danger
      />
    </>
  )
}
