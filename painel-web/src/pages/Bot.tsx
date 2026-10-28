// /bots/:botId — a tela de rodar um bot (BotScreen do app): modo (com menu editar/duplicar/excluir),
// chat, contas do lote NA ORDEM marcada, campos extras e o Rodar, com as mesmas regras/avisos.
// Coluna principal = configuração; coluna lateral = resumo da run + rodar (empilha no celular).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import type { Variants } from 'framer-motion'
import {
  ArrowLeftRight, AtSign, Bot as BotIcon, Copy, GitBranch, MessageCircle, Pencil, Play, Plus,
  Radio, RefreshCw, Settings2, Store, Trash2, Users,
} from 'lucide-react'
import { api, locaisDe } from '@/lib/api'
import type { Account, RunInfo } from '@/lib/api'
import { erroMsg } from '@/lib/apiClient'
import { cmpTexto } from '@/lib/ordenar'
import { QK, useBots, useContas, useEmulador, useGrupos, useRuns } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { Button, Card, EmptyState, Input, PageBody, PageHeader, Section, Skeleton, StatusDot, Switch } from '@/components/ui'
import { ConfirmModal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import {
  botDoCatalogo, completarOrdem, CONTA_BRECHO, contasDaRun, contasVitrine, cruza, emuladoresDe,
  nomeCopia, ordemPadrao, recursosDoBot, rotaModo, runsAtivasDoBot, statusHttp,
} from '@/components/bots/catalogo'
import type { Emu } from '@/components/bots/catalogo'
import { Migalha } from '@/components/bots/Migalha'
import { useAviso } from '@/components/bots/Aviso'
import { MenuContexto, useMenuContexto } from '@/components/bots/MenuContexto'
import { Etiqueta, Pilula } from '@/components/bots/Pilula'
import { OrdemLote, SeletorContas } from '@/components/bots/SeletorContas'
import type { ItemConta } from '@/components/bots/SeletorContas'
import { SeletorContaAtiva } from '@/components/bots/SeletorContaAtiva'
import { RunAtivaInfo } from '@/components/bots/RunViva'
import { UltimasRuns } from '@/components/bots/UltimasRuns'

const lista: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } }
const item: Variants = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' } } }

/** Link de ação pequeno (o "atualizar", "limpar", "todas" do app). */
function LinkAcao({ onClick, children, disabled, icon }: { onClick: () => void; children: ReactNode; disabled?: boolean; icon?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 text-xs font-bold text-primary-light hover:text-primary disabled:text-txt-faint disabled:pointer-events-none transition-colors"
    >
      {icon}{children}
    </button>
  )
}

function Dica({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-xs leading-relaxed text-txt-faint', className)}>{children}</p>
}

// trocar de bot (/bots/a → /bots/b) reaproveita o componente: a key zera a seleção de um pro outro
export default function Bot() {
  const { botId = '' } = useParams()
  return <TelaBot key={botId} botId={botId} />
}

function TelaBot({ botId }: { botId: string }) {
  const nav = useNavigate()
  const location = useLocation()
  const qc = useQueryClient()
  const toast = useToast()
  const { aviso, avisoEl } = useAviso()

  const bots = useBots()
  const info = bots.data?.[botId]
  const cat = botDoCatalogo(botId)
  const nome = info?.nome ?? cat?.nomeFallback ?? botId
  const desc = info?.descricao ?? cat?.descFallback ?? ''
  const Icone = cat?.icone ?? BotIcon
  const { temChats, temPostInicial, temLote, ehVitrine, ehStoryBrecho } = recursosDoBot(botId, info?.tem_chats)

  const modosQ = useQuery({ queryKey: QK.modos(botId), queryFn: () => api.getModos(botId), enabled: !!botId })
  const modos = useMemo(() => Object.keys(modosQ.data ?? {}).sort(cmpTexto), [modosQ.data])
  const chatsQ = useQuery({ queryKey: QK.chats(botId), queryFn: () => api.getChats(botId), enabled: !!botId && temChats })
  const chats = useMemo(() => chatsQ.data ?? [], [chatsQ.data])
  const histQ = useQuery({ queryKey: QK.historico(botId), queryFn: () => api.getHistorico(botId), enabled: !!botId })
  const runsQ = useRuns()
  const emuQ = useEmulador()
  const contasQ = useContas()
  const gruposQ = useGrupos()

  // TODAS as runs ativas deste bot (o Story pode ter duas: brechó + segue, cada uma no seu emulador)
  const runsAtivas = useMemo(() => runsAtivasDoBot(runsQ.data, botId), [runsQ.data, botId])
  const runAtiva = runsAtivas[0] ?? null

  // ── modo ── nada pré-selecionado (a pessoa escolhe); volta do editor já com o modo salvo marcado
  const [modo, setModo] = useState<string | null>(() => (location.state as { modo?: string } | null)?.modo ?? null)
  const [menuModo, setMenuModo] = useState<{ x: number; y: number; nome: string } | null>(null)
  const [apagarModo, setApagarModo] = useState<string | null>(null)
  const alvoApagar = useRef<string | null>(null)   // mantém o nome durante a animação de saída
  if (apagarModo) alvoApagar.current = apagarModo
  useEffect(() => {
    if (modosQ.data && modo && !(modo in modosQ.data)) setModo(null)   // apagado/renomeado em outro lugar
  }, [modosQ.data, modo])

  // ── chat ──
  const [chat, setChat] = useState<string | null>(null)
  useEffect(() => {
    if (!chatsQ.data) return
    const c = chatsQ.data
    setChat((atual) => (atual && c.some((x) => x.nome === atual) ? atual : c[0]?.nome ?? null))
  }, [chatsQ.data])

  const [postInicial, setPostInicial] = useState('')   // like-repost: fronteira opcional (1ª vez)
  const [iniciando, setIniciando] = useState(false)

  // ── pool do EMULADOR: contas logadas no device (username), na ORDEM de marcação ──
  const [vitrine, setVitrine] = useState<string[] | null>(null)
  const [ordem, setOrdem] = useState<string[]>([])
  const [grupoVitrine, setGrupoVitrine] = useState<string | null>(null)
  const [atualizandoVitrine, setAtualizandoVitrine] = useState(false)
  const runsRef = useRef(runsQ.data)
  runsRef.current = runsQ.data

  // padrão: tudo marcado, da menor pra maior. Story já rodando num emulador → marca só as do OUTRO
  const padraoInicial = useCallback((us: string[], runs: RunInfo[] | undefined) => {
    let padrao = ordemPadrao(us, ehStoryBrecho)
    if (ehStoryBrecho) {
      const ocup = new Set<Emu>()
      runsAtivasDoBot(runs, botId).forEach((r) => emuladoresDe(contasDaRun(r)).forEach((e) => ocup.add(e)))
      const livres = padrao.filter((u) => !ocup.has(u === CONTA_BRECHO ? 'brecho' : 'principal'))
      if (ocup.size && livres.length) padrao = livres
    }
    return padrao
  }, [ehStoryBrecho, botId])

  const prontoVitrine = ehVitrine && emuQ.isFetched && contasQ.isFetched && runsQ.isFetched
  const vitrineViva = useMemo(
    () => (emuQ.isError ? [] : contasVitrine(emuQ.data, contasQ.data)),
    [emuQ.isError, emuQ.data, contasQ.data],
  )
  // as contas podem demorar a aparecer (o agente navega pro seletor): enquanto a lista está VAZIA
  // segue o polling; quando popula, para de mexer (não reseta a seleção). "atualizar" força.
  useEffect(() => {
    if (!prontoVitrine) return
    if (vitrine && vitrine.length) return
    if (vitrine && vitrine.join('|') === vitrineViva.join('|')) return
    setVitrine(vitrineViva)
    setOrdem(padraoInicial(vitrineViva, runsRef.current))
  }, [prontoVitrine, vitrineViva, vitrine, padraoInicial])

  async function atualizarVitrine() {
    setAtualizandoVitrine(true)
    try {
      const [e, c, r] = await Promise.all([emuQ.refetch(), contasQ.refetch(), runsQ.refetch()])
      const us = e.isError ? [] : contasVitrine(e.data, c.data)
      setVitrine(us)
      setOrdem(padraoInicial(us, r.data))
      setGrupoVitrine(null)
    } finally { setAtualizandoVitrine(false) }
  }

  // grupos no emulador: escolher um grupo marca SÓ as contas dele (dá pra ajustar conta a conta)
  const idPorLabel = useMemo(
    () => new Map((contasQ.data ?? []).map((a) => [(a.label || '').toLowerCase(), a.id])),
    [contasQ.data],
  )
  const gruposVitrine = useMemo(() => {
    const pool = [...(vitrine ?? []), ...(ehStoryBrecho ? [CONTA_BRECHO] : [])]
    return (gruposQ.data ?? [])
      .map((g) => ({
        nome: g.nome,
        contas: pool.filter((u) => { const id = idPorLabel.get(u.toLowerCase()); return !!id && g.contas.includes(id) }),
      }))
      .filter((g) => g.contas.length > 0)
  }, [gruposQ.data, vitrine, ehStoryBrecho, idPorLabel])

  function escolherGrupoVitrine(g: string | null) {
    setGrupoVitrine(g)
    if (!g) { setOrdem(ordemPadrao(vitrine ?? [], ehStoryBrecho)); return }
    setOrdem([...(gruposVitrine.find((x) => x.nome === g)?.contas ?? [])])
  }

  // ── bots do SERVIDOR: conta ativa (run normal) ou lote por cookie ──
  const contaAtiva = useMemo(() => contasQ.data?.find((c) => c.ativa) ?? null, [contasQ.data])
  const [abrirSeletor, setAbrirSeletor] = useState(false)
  const [lote, setLote] = useState(false)
  const [contasLote, setContasLote] = useState<Account[] | null>(null)   // null = ainda não checou
  const [selLote, setSelLote] = useState<string[]>([])                   // ids, na ordem marcada
  const [verContas, setVerContas] = useState(false)
  const [grupoLote, setGrupoLote] = useState<string | null>(null)
  const gruposLote = gruposQ.data ?? []

  // só as contas do SERVIDOR; sessão viva é best-effort (checagem fresca) — sem ela a lista não zera
  async function carregarContasLote() {
    setVerContas(true)
    try {
      const base = (await api.getAccounts()).filter((a) => a.id && locaisDe(a).includes('servidor'))
      const sess: Record<string, boolean> = {}
      try {
        for (const a of await api.validarContas(true)) if (a.id) sess[a.id] = !!a.sessao_ok
      } catch { /* checagem falhou — mantém a lista */ }
      const listaContas = base
        .map((a) => ({ ...a, sessao_ok: a.id in sess ? sess[a.id] : undefined }))
        .sort((a, b) => cmpTexto(a.label, b.label))
      setContasLote(listaContas)
      const gs = (await gruposQ.refetch()).data ?? []
      const g = grupoLote ? gs.find((x) => x.nome === grupoLote) : null
      setSelLote(listaContas.filter((a) => a.sessao_ok === true && (!g || g.contas.includes(a.id))).map((a) => a.id))
    } catch { setContasLote([]) } finally { setVerContas(false) }
  }

  function toggleLote(v: boolean) {
    setLote(v)
    if (v && contasLote === null) carregarContasLote()
  }

  function escolherGrupoLote(g: string | null) {
    setGrupoLote(g)
    const grupo = g ? gruposLote.find((x) => x.nome === g) : null
    setSelLote((contasLote ?? []).filter((a) => a.sessao_ok === true && (!grupo || grupo.contas.includes(a.id))).map((a) => a.id))
  }

  // ── o que impede de rodar: nos outros bots, qualquer run ativa; no Story, só uma run no MESMO
  // emulador da seleção (brechó e segue rodam juntos) ──
  const emusSel = emuladoresDe(ordem)
  const bloqueio: RunInfo | null = ehStoryBrecho
    ? (runsAtivas.find((r) => cruza(emuladoresDe(contasDaRun(r)), emusSel)) ?? null)
    : runAtiva
  const rodandoAoLado = ehStoryBrecho && !bloqueio ? runsAtivas : []
  const precisaChat = temChats && chatsQ.isFetched && chats.length === 0

  function paramsRun(): Record<string, unknown> {
    const p: Record<string, unknown> = { dry_run: false, modo }
    if (temChats && chat) p.chat = chat
    if (temPostInicial && postInicial.trim()) p.start_from = postInicial.trim()
    return p
  }

  function rodar() {
    if (bloqueio) return
    if (!modo) {   // precisa de um modo selecionado
      aviso('Escolha um modo', modos.length ? 'Clique num modo antes de rodar.' : 'Crie um modo pra poder rodar.')
      return
    }
    if (ehVitrine) {   // emulador: roda por username, uma de cada vez, NA ORDEM da seleção
      const us = [...ordem]
      if (!us.length) { aviso('Escolha as contas', 'Marque ao menos uma conta pra rodar.'); return }
      iniciarLote(us)
      return
    }
    if (lote) {
      const ids = [...selLote]
      if (!ids.length) { aviso('Escolha as contas', 'Marque ao menos uma conta pro lote.'); return }
      iniciarLote(ids)
      return
    }
    iniciarRun()
  }

  async function iniciarLote(ids: string[]) {
    setIniciando(true)
    try {
      const r = await api.runLote(botId, paramsRun(), ids)
      qc.invalidateQueries({ queryKey: QK.runs })
      if (r.run_id) {
        nav(`/execucoes/${r.run_id}`)   // a tela ao vivo da 1ª conta; as próximas seguem em sequência
      } else {
        aviso('Lote iniciado', `Rodando em ${r.total} conta${r.total !== 1 ? 's' : ''}, uma atrás da outra. Acompanha em Execuções.`)
      }
    } catch (e) {
      const st = statusHttp(e)
      if (st === 409) {
        aviso('Já está rodando', ehStoryBrecho
          ? 'Já tem story rodando nesse emulador. Espera terminar, ou rode as contas do outro emulador (brechó / segue).'
          : 'Esse bot já tem execução em andamento. Espera terminar.')
      } else if (st === 400) {
        aviso('Sem contas ativas', 'Nenhuma das contas escolhidas tem sessão viva. Atualiza a lista.')
      } else {
        aviso('Ops', `Não consegui iniciar o lote (${erroMsg(e)}).`)
      }
      qc.invalidateQueries({ queryKey: QK.runs })
    } finally { setIniciando(false) }
  }

  async function iniciarRun() {
    setIniciando(true)
    try {
      const run = await api.startRun(botId, paramsRun())
      qc.invalidateQueries({ queryKey: QK.runs })
      nav(`/execucoes/${run.id}`)
    } catch (e) {
      setIniciando(false)
      qc.invalidateQueries({ queryKey: QK.runs })   // pode já ter começado a rodar
      if (statusHttp(e) === 409) aviso('Já está rodando', 'Esse bot já tem uma execução em andamento. Abre ela pra acompanhar.')
      else toast.error(`Não consegui iniciar: ${erroMsg(e)}`)
    }
  }

  // ── modos: editar / duplicar / excluir ──
  function editarModo(m: string) {
    setMenuModo(null)
    nav(rotaModo(botId, m), { state: { editar: true } })
  }

  async function duplicarModo(nomeBase: string) {
    setMenuModo(null)
    try {
      const todos = await api.getModos(botId)
      const base = todos[nomeBase]
      if (!base) { aviso('Ops', 'Não achei esse modo pra duplicar.'); return }
      const novo = nomeCopia(nomeBase, todos)
      todos[novo] = JSON.parse(JSON.stringify(base))   // cópia profunda do config
      await api.putModos(botId, todos)
      qc.setQueryData(QK.modos(botId), todos)
      setModo(novo)
      toast.ok(`Duplicado como "${novo}".`)
      nav(rotaModo(botId, novo), { state: { editar: true } })   // abre a cópia pra ajustar
    } catch {
      aviso('Ops', 'Não consegui duplicar o modo.')
    }
  }

  async function excluirModo(nomeAlvo: string) {
    try {
      const todos = await api.getModos(botId)
      delete todos[nomeAlvo]
      await api.putModos(botId, todos)
      qc.setQueryData(QK.modos(botId), todos)
      if (modo === nomeAlvo) setModo(null)
      toast.ok(`Modo "${nomeAlvo}" apagado.`)
    } catch { aviso('Ops', 'Não consegui apagar.') }
  }

  const abrirMenuModo = useCallback((x: number, y: number, nomeModo: string) => setMenuModo({ x, y, nome: nomeModo }), [])
  const fecharMenuModo = useCallback(() => setMenuModo(null), [])

  // bots com tela própria não usam a tela de rodar
  if (cat?.rota) return <Navigate to={cat.rota} replace />

  if (bots.isSuccess && !info && !cat) {
    return (
      <>
        <Migalha itens={[{ label: 'Bots', to: '/bots' }, { label: botId }]} />
        <PageHeader title="Bot não encontrado" />
        <PageBody>
          <Card>
            <EmptyState
              icon={<BotIcon className="h-9 w-9" />}
              title={`Não existe bot "${botId}".`}
              subtitle="Pode ter saído do backend. Volta pra lista e escolhe outro."
              action={<Link to="/bots"><Button variant="subtle">Ver os bots</Button></Link>}
            />
          </Card>
        </PageBody>
      </>
    )
  }

  // ── pedaços da tela ──
  const nSelVitrine = ordem.filter((u) => (vitrine ?? []).includes(u)).length
  const carregandoVitrine = ehVitrine && (vitrine === null || atualizandoVitrine)
  const rotuloLote = (id: string) => contasLote?.find((a) => a.id === id)?.label ?? id
  const itensLote: ItemConta[] = (contasLote ?? [])
    .filter((c) => {   // com grupo escolhido, lista só as contas dele
      const g = grupoLote ? gruposLote.find((x) => x.nome === grupoLote) : null
      return !g || g.contas.includes(c.id)
    })
    .map((c) => ({
      key: c.id,
      label: c.label,
      bloqueada: c.sessao_ok !== true,   // só quem tem sessão viva entra no lote
      tag: (
        <span className="flex items-center gap-1.5">
          {c.ativa && <Etiqueta className="bg-ok/15 text-ok">ativa</Etiqueta>}
          {c.sessao_ok === false && <Etiqueta className="bg-danger/15 text-danger">sessão caiu</Etiqueta>}
          {c.sessao_ok === undefined && <Etiqueta className="bg-surface2 text-txt-faint">sem sessão</Etiqueta>}
        </span>
      ),
    }))

  const tituloBotao = ehVitrine
    ? `Rodar em ${ordem.length} conta${ordem.length !== 1 ? 's' : ''}`
    : lote ? `Rodar lote (${selLote.length})` : (contaAtiva ? `Rodar com @${contaAtiva.label}` : 'Rodar')

  return (
    <>
      <Migalha itens={[{ label: 'Bots', to: '/bots' }, { label: nome }]} />
      <PageHeader
        title={nome}
        subtitle={desc}
        action={runsAtivas.length ? (
          <Link
            to={`/execucoes/${runsAtivas[0].id}`}
            className="flex items-center gap-2 h-9 px-3.5 rounded-full bg-primary/15 border border-primary/30 text-primary-light text-xs font-bold hover:bg-primary/20 transition-colors"
          >
            <StatusDot tone="ativo" pulse />
            {runsAtivas.length > 1 ? `${runsAtivas.length} rodando` : 'Rodando agora'}
          </Link>
        ) : info?.target ? (
          <Etiqueta className="bg-surface2 text-txt-dim border border-border h-7 px-3">{info.target === 'emulador' ? 'roda no emulador' : 'roda no servidor'}</Etiqueta>
        ) : undefined}
      />
      <PageBody>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
          {/* ───────── configuração ───────── */}
          <motion.div variants={lista} initial="hidden" animate="show" className="space-y-5 min-w-0">
            {/* MODO */}
            <motion.div variants={item}>
              <Section
                title="Modo"
                subtitle="Os limites e o ritmo da run."
                action={<Button size="sm" variant="ghost" onClick={() => nav(rotaModo(botId, null))}><Plus className="h-4 w-4" />Novo modo</Button>}
              >
                {modosQ.isLoading ? (
                  <div className="flex flex-wrap gap-2">{['w-20', 'w-28', 'w-16'].map((w) => <Skeleton key={w} className={cn('h-9 rounded-full', w)} />)}</div>
                ) : modosQ.isError ? (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-txt-dim">Não consegui puxar os modos.</p>
                    <Button size="sm" variant="subtle" onClick={() => modosQ.refetch()}><RefreshCw className="h-3.5 w-3.5" />Tentar de novo</Button>
                  </div>
                ) : modos.length > 0 ? (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {modos.map((m) => (
                        <PilulaModo key={m} nome={m} sel={modo === m} onSelect={() => setModo(m)} onMenu={abrirMenuModo} />
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-4">
                      {modo && <LinkAcao onClick={() => editarModo(modo)} icon={<Pencil className="h-3.5 w-3.5" />}>Editar "{modo}"</LinkAcao>}
                      {modo && <LinkAcao onClick={() => duplicarModo(modo)} icon={<Copy className="h-3.5 w-3.5" />}>Duplicar</LinkAcao>}
                      <span className="text-[11px] text-txt-faint">Botão direito (ou segurar) num modo: editar, duplicar, excluir.</span>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <Dica>Nenhum modo ainda — crie um (começa tudo zerado, você liga só o que quiser).</Dica>
                    <Button size="sm" onClick={() => nav(rotaModo(botId, null))}><Plus className="h-4 w-4" />Criar modo</Button>
                  </div>
                )}
              </Section>
            </motion.div>

            {/* CHAT */}
            {temChats && (
              <motion.div variants={item}>
                <Section
                  title="Chat"
                  subtitle="O grupo (ou a @pessoa) que o bot varre."
                  action={<Button size="sm" variant="ghost" onClick={() => nav(`/bots/${botId}/chats`)}><Settings2 className="h-4 w-4" />Gerenciar chats</Button>}
                >
                  {chatsQ.isLoading ? (
                    <div className="flex flex-wrap gap-2">{['w-24', 'w-32'].map((w) => <Skeleton key={w} className={cn('h-9 rounded-full', w)} />)}</div>
                  ) : chats.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {chats.map((c) => (
                        <Pilula key={`${c.nome}|${c.thread_id}`} grupo="chat-sel" sel={chat === c.nome} onClick={() => setChat(c.nome)}>
                          {c.nome.startsWith('@') ? <AtSign className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
                          {c.nome}
                        </Pilula>
                      ))}
                    </div>
                  ) : (
                    <Dica>Nenhum chat configurado ainda. Adicione o grupo (ou a @pessoa) que o bot vai varrer antes de rodar.</Dica>
                  )}
                </Section>
              </motion.div>
            )}

            {/* CONTAS DO EMULADOR */}
            {ehVitrine && (
              <motion.div variants={item}>
                <Section
                  title="Contas"
                  subtitle="Roda uma de cada vez (o app troca de conta sozinho)."
                  action={
                    <LinkAcao onClick={atualizarVitrine} disabled={atualizandoVitrine}
                      icon={<RefreshCw className={cn('h-3.5 w-3.5', atualizandoVitrine && 'animate-spin')} />}>
                      atualizar
                    </LinkAcao>
                  }
                >
                  {gruposVitrine.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      <Pilula grupo="grupo-vitrine" sel={grupoVitrine === null} onClick={() => escolherGrupoVitrine(null)} tamanho="sm">todas</Pilula>
                      {gruposVitrine.map((g) => (
                        <Pilula key={g.nome} grupo="grupo-vitrine" sel={grupoVitrine === g.nome} onClick={() => escolherGrupoVitrine(g.nome)} tamanho="sm">
                          {g.nome}<span className="opacity-70 tabular-nums">· {g.contas.length}</span>
                        </Pilula>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-txt-dim tabular-nums">
                      {carregandoVitrine ? 'carregando…' : `${nSelVitrine}/${(vitrine ?? []).length} selecionadas`}
                    </span>
                    <div className="flex items-center gap-4">
                      <LinkAcao onClick={() => setOrdem([])}>limpar</LinkAcao>
                      <LinkAcao onClick={() => setOrdem((atual) => completarOrdem(atual, ordemPadrao(vitrine ?? [], ehStoryBrecho)))}>todas</LinkAcao>
                    </div>
                  </div>
                  <Dica className="mb-3">O número é a vez de cada conta — segue a ordem em que você marca.</Dica>
                  {vitrine === null ? (
                    <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-11 rounded-xl" />)}</div>
                  ) : vitrine.length === 0 && !atualizandoVitrine ? (
                    <div className="rounded-xl border border-dashed border-border px-4 py-5 text-center">
                      <p className="text-sm text-txt-dim">Nenhuma conta logada ainda.</p>
                      <Dica className="mt-1">
                        Adicione em <Link to="/contas" className="text-primary-light font-semibold hover:underline">Contas</Link> e clique em "verificar" — o agente loga sozinho.
                      </Dica>
                    </div>
                  ) : (
                    <SeletorContas itens={vitrine.map((u) => ({ key: u, label: u }))} ordem={ordem} onChange={setOrdem} />
                  )}
                </Section>
              </motion.div>
            )}

            {/* CONTA DO BRECHÓ (Story) */}
            {ehStoryBrecho && (
              <motion.div variants={item}>
                <Section title="Conta do brechó" subtitle="Roda no emulador próprio dela (liga só na hora).">
                  <Dica className="mb-3">Entra na mesma ordem das outras; sem nenhuma outra marcada, roda sozinha.</Dica>
                  <SeletorContas itens={[{ key: CONTA_BRECHO, label: CONTA_BRECHO, tag: <Store className="h-4 w-4 text-txt-faint" /> }]} ordem={ordem} onChange={setOrdem} colunas="max-w-md" />
                </Section>
              </motion.div>
            )}

            {/* CONTA ATIVA (bots do servidor) */}
            {!ehVitrine && (
              <motion.div variants={item}>
                <Section
                  title="Conta"
                  action={<LinkAcao onClick={() => setAbrirSeletor(true)} icon={<ArrowLeftRight className="h-3.5 w-3.5" />}>trocar</LinkAcao>}
                >
                  {contasQ.isLoading ? <Skeleton className="h-6 w-40" /> : contaAtiva ? (
                    <p className="text-lg font-extrabold text-txt truncate">@{contaAtiva.label}</p>
                  ) : (
                    <p className="text-sm italic text-txt-faint">nenhuma conta ativa</p>
                  )}
                </Section>
              </motion.div>
            )}

            {/* LOTE (bots do servidor) */}
            {temLote && (
              <motion.div variants={item}>
                <Section
                  title="Rodar em lote"
                  subtitle="Roda em várias contas, uma atrás da outra. As com sessão caída ficam sinalizadas (o worker pula elas)."
                  action={<Switch checked={lote} onChange={toggleLote} label="Rodar em lote" />}
                >
                  {lote ? (
                    <div>
                      {gruposLote.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-4">
                          {[null, ...gruposLote.map((g) => g.nome)].map((g) => (
                            <Pilula key={g ?? '__todas'} grupo="grupo-lote" sel={grupoLote === g} onClick={() => escolherGrupoLote(g)} tamanho="sm">
                              {g ?? 'todas'}
                              {g && <span className="opacity-70 tabular-nums">· {gruposLote.find((x) => x.nome === g)?.contas.length ?? 0}</span>}
                            </Pilula>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <span className="text-[11px] font-bold uppercase tracking-wide text-txt-dim tabular-nums">
                          {verContas ? 'verificando sessões…' : `${selLote.length}/${(contasLote ?? []).length} selecionadas`}
                        </span>
                        <LinkAcao onClick={carregarContasLote} disabled={verContas}
                          icon={<RefreshCw className={cn('h-3.5 w-3.5', verContas && 'animate-spin')} />}>
                          atualizar
                        </LinkAcao>
                      </div>
                      {contasLote === null ? (
                        <div className="grid gap-2 sm:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-11 rounded-xl" />)}</div>
                      ) : (
                        <SeletorContas itens={itensLote} ordem={selLote} onChange={setSelLote} />
                      )}
                      {contasLote !== null && contasLote.length === 0 && !verContas && (
                        <Dica className="mt-3">Nenhuma conta cadastrada. Conecta uma em Contas primeiro.</Dica>
                      )}
                      {contasLote !== null && contasLote.length > 0 && !verContas && !contasLote.some((a) => a.sessao_ok === true) && (
                        <Dica className="mt-3">Nenhuma conta com sessão viva agora — reconecta em Contas ou clica em atualizar.</Dica>
                      )}
                    </div>
                  ) : (
                    <Dica>Desligado: roda só na conta ativa.</Dica>
                  )}
                </Section>
              </motion.div>
            )}

            {/* POST INICIAL (like-repost) */}
            {temPostInicial && (
              <motion.div variants={item}>
                <Section title="Post inicial (opcional)">
                  <Input
                    value={postInicial}
                    onChange={(e) => setPostInicial(e.target.value)}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="link do post ou código (ex: DABC123xyz)"
                  />
                  <Dica className="mt-2">
                    Só na 1ª vez, pra marcar de onde começar (ex: o 1º post do drop). Em branco, ele pega os posts mais
                    recentes do modo. Depois disso ele continua sozinho, do último que parou pra frente.
                  </Dica>
                </Section>
              </motion.div>
            )}

            {/* STORY: brechó e segue juntos */}
            {ehStoryBrecho && (
              <motion.div variants={item}>
                <Card className="p-5 bg-gradient-to-br from-roxo/10 via-surface to-surface">
                  <div className="flex items-center gap-2 mb-2">
                    <GitBranch className="h-4 w-4 text-primary-light" />
                    <h3 className="text-sm font-bold text-txt">Brechó e segue ao mesmo tempo</h3>
                  </div>
                  <Dica>O brechó roda num emulador só dele, então dá pra rodar ele com um modo e as outras contas com outro, juntos:</Dica>
                  <ol className="mt-2 space-y-1.5 text-xs leading-relaxed text-txt">
                    <li><span className="font-bold text-primary-light mr-1.5">1.</span>Marque só a conta do brechó, escolha o modo e clique em Rodar.</li>
                    <li><span className="font-bold text-primary-light mr-1.5">2.</span>Volte aqui: as outras contas já vêm marcadas. Escolha o outro modo e rode também.</li>
                  </ol>
                  <Dica className="mt-2">Marcando o brechó junto com as outras numa run só, roda tudo em sequência e com o mesmo modo.</Dica>
                </Card>
              </motion.div>
            )}

            {/* ÚLTIMAS RUNS */}
            <motion.div variants={item}>
              <Section
                title="Últimas runs"
                subtitle="As 10 mais recentes deste bot."
                action={<Link to="/historico" className="text-xs font-bold text-primary-light hover:text-primary">ver histórico</Link>}
              >
                <UltimasRuns historico={histQ.data} carregando={histQ.isLoading} erro={histQ.isError} onTentar={() => histQ.refetch()} />
              </Section>
            </motion.div>
          </motion.div>

          {/* ───────── resumo + rodar ───────── */}
          <motion.aside
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.1 }}
            className="lg:sticky lg:top-6 space-y-4"
          >
            <Card className="overflow-hidden">
              <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-border">
                <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center shrink-0', runsAtivas.length ? 'bg-primary text-white shadow-glow' : 'bg-primary/10 text-primary-light')}>
                  <Icone className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-txt-faint">Resumo da run</p>
                  <p className="font-bold text-txt truncate">{nome}</p>
                </div>
              </div>

              {runsAtivas.length > 0 && (
                <div className="px-5 py-4 border-b border-border bg-primary/5 space-y-3">
                  {runsAtivas.map((r) => (
                    <Link key={r.id} to={`/execucoes/${r.id}`} className="block rounded-lg -mx-2 px-2 py-1.5 hover:bg-surface2/60 transition-colors">
                      <RunAtivaInfo run={r} titulo={nome} />
                      {ehStoryBrecho && (
                        <p className="text-[11px] text-txt-faint mt-1">
                          emulador {emuladoresDe(contasDaRun(r)).has('brecho') ? 'do brechó' : 'das segue'}
                        </p>
                      )}
                    </Link>
                  ))}
                </div>
              )}

              <dl className="px-5 py-4 space-y-3 text-sm">
                <LinhaResumo rotulo="Modo">
                  {modo ? <span className="font-semibold text-txt">{modo}</span> : <span className="text-warn">escolha um modo</span>}
                </LinhaResumo>
                {temChats && (
                  <LinhaResumo rotulo="Chat">
                    {chat ? <span className="font-semibold text-txt truncate">{chat}</span> : <span className="text-warn">nenhum</span>}
                  </LinhaResumo>
                )}
                {!ehVitrine && !lote && (
                  <LinhaResumo rotulo="Conta">
                    {contaAtiva ? <span className="font-semibold text-txt truncate">@{contaAtiva.label}</span> : <span className="text-txt-faint">nenhuma ativa</span>}
                  </LinhaResumo>
                )}
                {temPostInicial && postInicial.trim() && (
                  <LinhaResumo rotulo="Post inicial"><span className="font-mono text-xs text-txt truncate">{postInicial.trim()}</span></LinhaResumo>
                )}
                {(ehVitrine || lote) && (
                  <div>
                    <dt className="flex items-center justify-between text-xs text-txt-dim mb-2">
                      <span>Ordem do lote</span>
                      <span className="tabular-nums">{(ehVitrine ? ordem : selLote).length} conta{(ehVitrine ? ordem : selLote).length === 1 ? '' : 's'}</span>
                    </dt>
                    <dd className="max-h-[38vh] overflow-y-auto pr-1 -mr-1">
                      {ehVitrine
                        ? <OrdemLote ordem={ordem} onChange={setOrdem} />
                        : <OrdemLote ordem={selLote} onChange={setSelLote} rotulo={rotuloLote} />}
                    </dd>
                  </div>
                )}
              </dl>

              <div className="px-5 pb-5 space-y-2.5">
                {precisaChat ? (
                  <Button className="w-full" size="lg" onClick={() => nav(`/bots/${botId}/chats`)}>
                    <MessageCircle className="h-4 w-4" />Configurar um chat primeiro
                  </Button>
                ) : bloqueio ? (
                  <>
                    <Button className="w-full" size="lg" disabled>
                      {ehStoryBrecho ? 'Já está rodando nesse emulador' : 'Já está rodando'}
                    </Button>
                    <Button className="w-full" variant="subtle" onClick={() => nav(`/execucoes/${bloqueio.id}`)}>Ver execução</Button>
                  </>
                ) : (
                  <>
                    {rodandoAoLado.map((r) => (
                      <Link key={r.id} to={`/execucoes/${r.id}`} className="flex items-center gap-2 text-xs text-txt-dim hover:text-txt transition-colors">
                        <Radio className="h-3.5 w-3.5 text-ok shrink-0" />
                        <span className="flex-1 truncate">
                          Rodando no emulador {emuladoresDe(contasDaRun(r)).has('brecho') ? 'do brechó' : 'das segue'} — pode rodar junto
                        </span>
                        <span className="font-bold text-primary-light">ver</span>
                      </Link>
                    ))}
                    <Button className="w-full" size="lg" onClick={rodar} loading={iniciando}>
                      <Play className="h-4 w-4 fill-current" />{tituloBotao}
                    </Button>
                  </>
                )}
              </div>
            </Card>
          </motion.aside>
        </div>
      </PageBody>

      <MenuContexto
        pos={menuModo ? { x: menuModo.x, y: menuModo.y } : null}
        onClose={fecharMenuModo}
        itens={menuModo ? [
          { label: 'Editar', icon: Pencil, onClick: () => editarModo(menuModo.nome) },
          { label: 'Duplicar', icon: Copy, onClick: () => duplicarModo(menuModo.nome) },
          { label: 'Excluir', icon: Trash2, danger: true, onClick: () => { setApagarModo(menuModo.nome); setMenuModo(null) } },
        ] : []}
      />
      <ConfirmModal
        open={!!apagarModo}
        onClose={() => setApagarModo(null)}
        onConfirm={() => { if (apagarModo) excluirModo(apagarModo) }}
        title="Apagar modo"
        message={`Apagar o modo "${alvoApagar.current ?? ''}"? Não dá pra desfazer.`}
        confirmText="Apagar"
        danger
      />
      <SeletorContaAtiva open={abrirSeletor} onClose={() => setAbrirSeletor(false)} />
      {avisoEl}
    </>
  )
}

function LinhaResumo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 min-w-0">
      <dt className="text-xs text-txt-dim shrink-0">{rotulo}</dt>
      <dd className="min-w-0 flex justify-end text-right">{children}</dd>
    </div>
  )
}

/** Pílula de modo: clique escolhe; botão direito / segurar abre o menu (editar, duplicar, excluir). */
function PilulaModo({ nome, sel, onSelect, onMenu }: {
  nome: string; sel: boolean; onSelect: () => void; onMenu: (x: number, y: number, nome: string) => void
}) {
  const { handlers, foiLongo } = useMenuContexto((x, y) => onMenu(x, y, nome))
  return (
    <Pilula grupo="modo-sel" sel={sel} onClick={() => { if (!foiLongo()) onSelect() }} {...handlers}>
      {nome}
    </Pilula>
  )
}
