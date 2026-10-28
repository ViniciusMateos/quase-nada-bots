// /bots/:botId/chats — chats que o bot varre (ChatsScreen do app): adicionar por thread_id ou pelo
// nome do grupo / @usuário, e remover (com confirmação).
import { useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { AtSign, Hash, Inbox, Plus, RefreshCw, Trash2, Users, CircleUser } from 'lucide-react'
import { api } from '@/lib/api'
import type { Chat } from '@/lib/api'
import { erroMsg } from '@/lib/apiClient'
import { QK, useBots } from '@/lib/queries'
import { Button, EmptyState, Input, PageBody, PageHeader, Section, Skeleton, Tabs } from '@/components/ui'
import { ConfirmModal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { botDoCatalogo } from '@/components/bots/catalogo'
import { Migalha } from '@/components/bots/Migalha'
import { useAviso } from '@/components/bots/Aviso'

type Modo = 'thread' | 'nome'

export default function Chats() {
  const { botId = '' } = useParams()
  const qc = useQueryClient()
  const toast = useToast()
  const { aviso, avisoEl } = useAviso()
  const bots = useBots()
  const nomeBot = bots.data?.[botId]?.nome ?? botDoCatalogo(botId)?.nomeFallback ?? botId

  const chatsQ = useQuery({ queryKey: QK.chats(botId), queryFn: () => api.getChats(botId), enabled: !!botId })
  const chats = chatsQ.data ?? []
  const [modo, setModo] = useState<Modo>('thread')
  const [valor, setValor] = useState('')
  const [adicionando, setAdicionando] = useState(false)
  const [remover, setRemover] = useState<Chat | null>(null)
  const alvoRemover = useRef<Chat | null>(null)   // mantém o nome durante a animação de saída
  if (remover) alvoRemover.current = remover
  const ehThread = modo === 'thread'

  async function adicionar() {
    const v = valor.trim()
    if (!v) { aviso('Faltou', ehThread ? 'Cole o thread_id.' : 'Digite o nome do grupo.'); return }
    setAdicionando(true)
    try {
      // thread → identifica pelo id (rótulo = id até o bot resolver o nome)
      // nome   → identifica pelo nome (thread_id vazio; o bot acha o grupo no inbox)
      await api.addChat(botId, v, ehThread ? v : '')
      setValor('')
      await qc.invalidateQueries({ queryKey: QK.chats(botId) })
      toast.ok('Chat salvo.')
    } catch {
      aviso('Ops', 'Não consegui salvar o chat.')
    } finally { setAdicionando(false) }
  }

  async function confirmarRemocao(c: Chat) {
    try {
      await api.delChat(botId, c.nome)
      await qc.invalidateQueries({ queryKey: QK.chats(botId) })
      toast.ok(`"${c.nome}" removido.`)
    } catch (e) {
      toast.error(`Não consegui remover: ${erroMsg(e)}`)
    }
  }

  return (
    <>
      <Migalha itens={[{ label: 'Bots', to: '/bots' }, { label: nomeBot, to: `/bots/${botId}` }, { label: 'Chats' }]} />
      <PageHeader title="Chats" subtitle={`Os grupos (ou @pessoas) que o ${nomeBot} varre.`} />
      <PageBody>
        <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)] items-start">
          {/* novo chat */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="lg:sticky lg:top-6">
            <Section title="Novo chat">
              <Tabs<Modo>
                value={modo}
                onChange={setModo}
                className="w-full mb-3 [&>button]:flex-1"
                options={[
                  { value: 'thread', label: <span className="inline-flex items-center gap-1.5"><Hash className="h-3.5 w-3.5" />thread_id</span> },
                  { value: 'nome', label: <span className="inline-flex items-center gap-1.5"><AtSign className="h-3.5 w-3.5" />nome / @user</span> },
                ]}
              />
              <form
                onSubmit={(e) => { e.preventDefault(); adicionar() }}
                className="space-y-3"
              >
                <Input
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  placeholder={ehThread ? 'thread_id (só números)' : 'nome do grupo ou @usuário'}
                  inputMode={ehThread ? 'numeric' : 'text'}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className={ehThread ? 'font-mono' : undefined}
                />
                <Button type="submit" className="w-full" loading={adicionando}>
                  <Plus className="h-4 w-4" />Adicionar chat
                </Button>
              </form>

              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={modo}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="mt-4 rounded-xl bg-surface2 border border-border p-4 space-y-1.5"
                >
                  {ehThread ? (
                    <>
                      <p className="text-sm font-bold text-txt">Onde acho o thread_id?</p>
                      <p className="text-xs leading-relaxed text-txt-dim">Abra a DM/grupo no instagram.com e copie o número da URL:</p>
                      <p className="font-mono text-xs text-txt break-all">instagram.com/direct/t/<span className="text-primary-light">{'<ESSE_NÚMERO>'}</span>/</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-bold text-txt">Pelo nome ou @</p>
                      <p className="text-xs leading-relaxed text-txt-dim">
                        Nome exato do grupo, ou o @usuário de uma pessoa. Na hora de rodar, o bot acha na sua caixa de DMs
                        e resolve o thread_id sozinho.
                      </p>
                    </>
                  )}
                </motion.div>
              </AnimatePresence>
            </Section>
          </motion.div>

          {/* chats salvos */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.05 }} className="min-w-0">
            <Section
              title="Chats salvos"
              subtitle={chatsQ.isSuccess ? `${chats.length} chat${chats.length === 1 ? '' : 's'}` : undefined}
            >
              {chatsQ.isLoading ? (
                <div className="space-y-3">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="h-9 w-9 rounded-full" />
                      <div className="flex-1 space-y-2"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-3 w-1/3" /></div>
                    </div>
                  ))}
                </div>
              ) : chatsQ.isError ? (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-txt-dim">Não consegui puxar os chats.</p>
                  <Button size="sm" variant="subtle" onClick={() => chatsQ.refetch()}><RefreshCw className="h-3.5 w-3.5" />Tentar de novo</Button>
                </div>
              ) : chats.length === 0 ? (
                <EmptyState icon={<Inbox className="h-9 w-9" />} title="Nenhum chat salvo ainda." subtitle="Adicione o grupo (ou a @pessoa) que o bot vai varrer." />
              ) : (
                <ul className="-mx-5 -mb-3 divide-y divide-border border-t border-border">
                  <AnimatePresence initial={false}>
                    {chats.map((c, i) => (
                      <motion.li
                        key={`${c.nome}|${c.thread_id}`}
                        layout
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 10) * 0.03 } }}
                        exit={{ opacity: 0, x: 12 }}
                        className="group flex items-center gap-3.5 px-5 py-3 hover:bg-surface2/50 transition-colors"
                      >
                        <span className="h-9 w-9 rounded-full bg-surface2 flex items-center justify-center text-txt-dim shrink-0">
                          {c.nome.startsWith('@') ? <CircleUser className="h-5 w-5" /> : <Users className="h-4 w-4" />}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-txt truncate">{c.nome}</p>
                          <p className={c.thread_id ? 'font-mono text-xs text-txt-dim truncate' : 'text-xs text-txt-faint truncate'}>
                            {c.thread_id ? c.thread_id : 'busca pelo nome no inbox'}
                          </p>
                        </div>
                        <Button size="icon" variant="ghost" title="Remover chat" onClick={() => setRemover(c)} className="hover:!text-danger hover:!bg-danger/10">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </Section>
          </motion.div>
        </div>
      </PageBody>

      <ConfirmModal
        open={!!remover}
        onClose={() => setRemover(null)}
        onConfirm={() => { if (remover) confirmarRemocao(remover) }}
        title="Remover chat"
        message={`Remover "${alvoRemover.current?.nome ?? ''}"?`}
        confirmText="Remover"
        danger
      />
      {avisoEl}
    </>
  )
}
