// Contas do Instagram — versão painel do ContasIgScreen do app. Uma linha por @username, juntando a
// credencial salva NESTE navegador, a conta do backend e o estado no emulador. Seções: Principal (só
// a do brechó), Auxiliares (emulador das segue) e Fora do emulador.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { Info, Plus, RefreshCw, RotateCw, Search, SearchX, ShieldCheck, Tags, TriangleAlert, Users, X } from 'lucide-react'
import { Button, Card, EmptyState, Input, PageBody, PageHeader, Skeleton, Tabs } from '@/components/ui'
import { ConfirmModal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { api } from '@/lib/api'
import { erroMsg } from '@/lib/apiClient'
import {
  lerCredenciais,
  promoverPendentes,
  removerCredencial,
  salvarCredencial,
  type Credencial,
} from '@/lib/credenciais'
import { cmpTexto } from '@/lib/ordenar'
import { QK, useContas, useEmulador, useGrupos } from '@/lib/queries'
import { CONTA_BRECHO, ehUsername, sincronizarEmulador } from '@/lib/syncEmulador'
import { cn } from '@/lib/utils'
import { montarEntries, SECOES, type Entry, type Secao } from '@/components/contas/modelo'
import { Faixa, Select, useDialogo } from '@/components/contas/pecas'
import { ListaContas, type BlocoSecao, type EdicaoGrupo } from '@/components/contas/ListaContas'
import { PainelAtalhos, PainelGrupos } from '@/components/contas/PainelGrupos'
import {
  ModalAviso,
  ModalCodigo,
  ModalConta,
  ModalNomeGrupo,
  type DadosAviso,
  type DadosCodigo,
  type DadosConta,
  type DadosNomeGrupo,
  type ItemAviso,
} from '@/components/contas/ModaisContas'

const SEM_GRUPO = '__sem_grupo'

type Confirmacao =
  | { tipo: 'apagar'; e: Entry }
  | { tipo: 'reconectar'; e: Entry }
  | { tipo: 'apagarGrupo'; nome: string }

export default function Contas() {
  const qc = useQueryClient()
  const nav = useNavigate()
  const toast = useToast()
  const contasQ = useContas()
  const gruposQ = useGrupos()
  const emulQ = useEmulador()

  const [creds, setCreds] = useState<Credencial[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [sincronizando, setSincronizando] = useState(false)
  const [salvandoConta, setSalvandoConta] = useState(false)
  const [enviandoCod, setEnviandoCod] = useState(false)
  const [salvandoNome, setSalvandoNome] = useState(false)
  const [salvandoGrupo, setSalvandoGrupo] = useState(false)
  const [editGrupo, setEditGrupo] = useState<EdicaoGrupo | null>(null)

  // filtros
  const [busca, setBusca] = useState('')
  const [grupoFiltro, setGrupoFiltro] = useState('')
  const [secao, setSecao] = useState<'todas' | Secao>('todas')

  const contaDlg = useDialogo<DadosConta>()
  const codDlg = useDialogo<DadosCodigo>()
  const nomeDlg = useDialogo<DadosNomeGrupo>()
  const avisoDlg = useDialogo<DadosAviso>()
  const confDlg = useDialogo<Confirmacao>()

  const grupos = useMemo(() => gruposQ.data ?? [], [gruposQ.data])
  const emul = emulQ.data
  const logadasEmul = useMemo(() => emul?.contas_logadas ?? [], [emul])

  const recarregarCreds = useCallback(async () => {
    setCreds(await lerCredenciais().catch(() => [] as Credencial[]))
  }, [])

  const recarregar = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: QK.contas }),
      qc.invalidateQueries({ queryKey: QK.grupos }),
      qc.invalidateQueries({ queryKey: QK.emulador }),
      recarregarCreds(),
    ])
  }, [qc, recarregarCreds])

  // ao abrir a tela: dados frescos (o app recarrega a cada foco)
  useEffect(() => {
    recarregarCreds()
    qc.invalidateQueries({ queryKey: QK.contas })
    qc.invalidateQueries({ queryKey: QK.grupos })
  }, [qc, recarregarCreds])

  // senha de conta criada pelo Criar Conta só vira credencial quando a conta já está no app
  useEffect(() => {
    if (!contasQ.data) return
    promoverPendentes(contasQ.data.map((c) => c.label || ''))
      .then((n) => {
        if (n) recarregarCreds()
      })
      .catch(() => {})
  }, [contasQ.data, recarregarCreds])

  // conta salva só no navegador (credencial sem conta no backend) e conta logada no emulador que o
  // app não conhece → entram como PENDENTE (só o @, a senha NÃO vai). Idempotente; 1x por abertura.
  const sincronizouPend = useRef(false)
  useEffect(() => {
    if (sincronizouPend.current || !contasQ.data || !contasQ.isFetchedAfterMount || !emulQ.isFetched) return
    sincronizouPend.current = true
    const cs = contasQ.data
    const logadas = emulQ.data?.contas_logadas ?? []
    ;(async () => {
      const cr = await lerCredenciais().catch(() => [] as Credencial[])
      const temBackend = new Set(cs.map((c) => (c.label || '').toLowerCase()))
      const faltando = cr.filter((c) => !temBackend.has(c.usuario.toLowerCase())).map((c) => c.usuario)
      const doCred = new Set(cr.map((c) => c.usuario.toLowerCase()))
      for (const u of logadas) {
        if (!ehUsername(u)) continue
        const l = u.toLowerCase()
        if (!temBackend.has(l) && !doCred.has(l) && !faltando.some((f) => f.toLowerCase() === l)) faltando.push(u)
      }
      if (faltando.length) {
        await Promise.all(faltando.map((u) => api.adicionarContaPendente(u, ['emulador']).catch(() => {})))
        qc.invalidateQueries({ queryKey: QK.contas })
      }
    })()
  }, [contasQ.data, contasQ.isFetchedAfterMount, emulQ.isFetched, emulQ.data, qc])

  const entries = useMemo(
    () => montarEntries(creds, contasQ.data ?? [], logadasEmul, emul?.sessoes ?? {}),
    [creds, contasQ.data, logadasEmul, emul],
  )

  // ───── filtros ─────
  const gruposOrd = useMemo(() => [...grupos].sort((a, b) => cmpTexto(a.nome, b.nome)), [grupos])
  const grupoEf =
    grupoFiltro && grupoFiltro !== SEM_GRUPO && !grupos.some((g) => g.nome === grupoFiltro) ? '' : grupoFiltro
  const q = busca.trim().toLowerCase().replace(/^@/, '')
  const base = entries.filter(
    (e) =>
      (!q || e.usuario.toLowerCase().includes(q)) &&
      (grupoEf === '' || (grupoEf === SEM_GRUPO ? !e.grupos?.length : !!e.grupos?.includes(grupoEf))),
  )
  const contagem: Record<'todas' | Secao, number> = {
    todas: base.length,
    principal: base.filter((e) => e.secao === 'principal').length,
    auxiliares: base.filter((e) => e.secao === 'auxiliares').length,
    fora: base.filter((e) => e.secao === 'fora').length,
  }
  const visiveis = secao === 'todas' ? base : base.filter((e) => e.secao === secao)
  const blocos: BlocoSecao[] = SECOES.map((s) => ({ secao: s.id, itens: visiveis.filter((e) => e.secao === s.id) })).filter(
    (b) => b.itens.length,
  )
  const temFiltro = !!q || grupoEf !== '' || secao !== 'todas'
  function limparFiltros() {
    setBusca('')
    setGrupoFiltro('')
    setSecao('todas')
  }

  const nLogadas = entries.filter((e) => e.emulLogada).length
  const verificando = !!emul?.verificando_sessoes
  const emulOffline = emulQ.isError || (!!emul && !emul.online)

  // ───── ações de conta ─────
  // senha salva no navegador pra mandar junto no login (sem ela o server usa a dele)
  function senhaSalva(usuario: string): Record<string, string> | undefined {
    const c = creds.find((x) => x.usuario.toLowerCase() === usuario.toLowerCase())
    return c?.senha ? { [usuario]: c.senha } : undefined
  }

  async function reconectar(e: Entry) {
    setBusy(e.usuario)
    try {
      const r = await api.reconectarEmulador([e.usuario], senhaSalva(e.usuario))
      qc.invalidateQueries({ queryKey: QK.runs })
      const rid = r?.run_ids?.[0]
      // abre o log do login no device; se o IG pedir código, usa a chave da conta
      if (rid) nav(`/execucoes/${rid}`)
      else toast.info('Reconectando. Acompanhe em Execuções; se pedir código, use a chave da conta.')
    } catch {
      toast.error('Não consegui iniciar o reconectar.')
    } finally {
      setBusy(null)
    }
  }

  async function apagar(e: Entry) {
    setBusy(e.usuario)
    try {
      await removerCredencial(e.usuario)
      if (e.id) await api.removerConta(e.id)
      await recarregar()
      toast.ok(`@${e.usuario} apagada.`)
    } catch {
      toast.error('Não consegui apagar.')
    } finally {
      setBusy(null)
    }
  }

  async function salvarConta() {
    const d = contaDlg.dados
    if (!d) return
    const u = d.usuario.trim().replace(/^@/, '')
    if (!u) return contaDlg.atualizar({ erro: 'Põe o usuário da conta.' })
    if (!d.senha) return contaDlg.atualizar({ erro: 'Põe a senha (fica só neste navegador).' })
    setSalvandoConta(true)
    try {
      await salvarCredencial({ usuario: u, senha: d.senha })
      await api.adicionarContaPendente(u).catch(() => {}) // já entra na lista (sem logar ainda)
      // não está logada → já manda o agente logar (fila), com a senha recém-salva. A do brechó
      // sempre loga (no emulador próprio dela; se já estiver logada, ele só confere e desliga)
      const logada = logadasEmul.some((x) => x.toLowerCase() === u.toLowerCase())
      const existente = entries.find((x) => x.usuario.toLowerCase() === u.toLowerCase())
      let runLogin: string | null | undefined
      let logando = false
      if (existente?.propria || u.toLowerCase() === CONTA_BRECHO || !logada) {
        const r = await api.reconectarEmulador([u], { [u]: d.senha }).catch(() => null)
        logando = !!r
        runLogin = r?.run_ids?.[0]
      }
      contaDlg.fechar()
      await recarregar()
      if (logando) {
        qc.invalidateQueries({ queryKey: QK.runs })
        avisoDlg.abrir({
          titulo: 'Logando',
          itens: [{ rotulo: 'Mandei o agente logar', contas: [u], tom: 'neutro' }],
          rodape: `@${u} ainda não estava logada. Se o Instagram pedir código, use a chave da conta na lista.`,
          runId: runLogin,
          verExecucoes: true,
        })
      } else {
        toast.ok(d.editando ? 'Senha atualizada.' : 'Conta salva.')
      }
    } catch {
      contaDlg.atualizar({ erro: 'Não consegui salvar a credencial.' })
    } finally {
      setSalvandoConta(false)
    }
  }

  async function enviarCodigo() {
    const d = codDlg.dados
    if (!d) return
    const cod = d.codigo.trim()
    if (!cod) return codDlg.atualizar({ erro: 'Digite o código que o Instagram pediu.' })
    setEnviandoCod(true)
    try {
      await api.enviarCodigo(d.user, cod)
      codDlg.fechar()
      toast.ok(`Mandei o código da @${d.user}. O login continua sozinho.`)
    } catch {
      codDlg.atualizar({ erro: 'Não consegui enviar o código.' })
    } finally {
      setEnviandoCod(false)
    }
  }

  // VERIFICAR E SINCRONIZAR (mesma rotina da tela inicial): conta logada que o app não tem entra no
  // app; conta que não está logada vai pra fila de login (senha do navegador; o brechó no emulador
  // dele); e a verificação das sessões entra na fila depois dos logins.
  async function sincronizarEVerificar() {
    if (sincronizando) return
    setSincronizando(true)
    try {
      const r = await sincronizarEmulador()
      const v = await api.verificarSessoes().catch(() => null)
      await recarregar()
      qc.invalidateQueries({ queryKey: QK.runs })
      const itens: ItemAviso[] = []
      if (r.adicionadas.length) itens.push({ rotulo: 'Entraram no app', contas: r.adicionadas, tom: 'ok' })
      if (r.logando.length) itens.push({ rotulo: 'Logando', contas: r.logando, tom: 'neutro' })
      if (r.semSenha.length)
        itens.push({ rotulo: 'Sem senha salva (edite a conta e ponha a senha)', contas: r.semSenha, tom: 'warn' })
      if (r.senhaIncorreta.length)
        itens.push({
          rotulo: 'Senha incorreta (o Instagram recusou; edite a conta e corrija)',
          contas: r.senhaIncorreta,
          tom: 'danger',
        })
      if (!itens.length) itens.push({ rotulo: 'Nada pra adicionar nem logar: tudo sincronizado.', tom: 'ok' })
      avisoDlg.abrir({
        titulo: 'Sincronizado',
        itens,
        rodape: 'A verificação das sessões entrou na fila — acompanhe em Execuções.',
        runId: v?.run_id,
        verExecucoes: true,
      })
    } catch {
      toast.error('Não consegui sincronizar.')
    } finally {
      setSincronizando(false)
    }
  }

  // ───── grupos ─────
  function abrirGrupo(nome: string) {
    if (editGrupo?.nome === nome) return setEditGrupo(null)
    const g = grupos.find((x) => x.nome === nome)
    setEditGrupo({ nome, sel: new Set(g?.contas ?? []) })
  }

  function toggleNoGrupo(id: string) {
    setEditGrupo((eg) => {
      if (!eg) return eg
      const n = new Set(eg.sel)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return { ...eg, sel: n }
    })
  }

  function marcarVisiveis() {
    setEditGrupo((eg) => {
      if (!eg) return eg
      const n = new Set(eg.sel)
      for (const e of visiveis) if (e.id) n.add(e.id)
      return { ...eg, sel: n }
    })
  }

  async function salvarMembros() {
    if (!editGrupo) return
    setSalvandoGrupo(true)
    try {
      await api.editarGrupo(editGrupo.nome, { contas: [...editGrupo.sel] })
      setEditGrupo(null)
      await recarregar()
      toast.ok('Grupo salvo.')
    } catch {
      toast.error('Não consegui salvar o grupo.')
    } finally {
      setSalvandoGrupo(false)
    }
  }

  async function salvarNomeGrupo() {
    const d = nomeDlg.dados
    if (!d) return
    const nome = d.nome.trim()
    if (!nome) return nomeDlg.atualizar({ erro: 'Dá um nome pro grupo (ex: Vitrine).' })
    setSalvandoNome(true)
    try {
      if (d.original) await api.editarGrupo(d.original, { nome })
      else await api.criarGrupo(nome)
      nomeDlg.fechar()
      await recarregar()
      if (!d.original) {
        setEditGrupo({ nome, sel: new Set() }) // grupo novo → já abre pra escolher as contas
        toast.ok('Grupo criado. Marque as contas dele na lista.')
      } else {
        setEditGrupo((eg) => (eg && eg.nome === d.original ? { ...eg, nome } : eg))
        setGrupoFiltro((f) => (f === d.original ? nome : f))
        toast.ok('Grupo renomeado.')
      }
    } catch (err) {
      nomeDlg.atualizar({ erro: `Não consegui salvar o grupo (${erroMsg(err)}).` })
    } finally {
      setSalvandoNome(false)
    }
  }

  async function apagarGrupo(nome: string) {
    try {
      await api.removerGrupo(nome)
      setEditGrupo((eg) => (eg?.nome === nome ? null : eg))
      setGrupoFiltro((f) => (f === nome ? '' : f))
      await recarregar()
      toast.ok('Grupo apagado.')
    } catch {
      toast.error('Não consegui apagar o grupo.')
    }
  }

  // ───── confirmação (uma só, muda o texto) ─────
  const conf = confDlg.dados
  const confTxt = !conf
    ? { title: '', message: '', confirmText: 'Confirmar', danger: false }
    : conf.tipo === 'apagar'
      ? {
          title: 'Apagar conta',
          message: `Apagar "@${conf.e.usuario}"? Some a credencial salva e a sessão.`,
          confirmText: 'Apagar',
          danger: true,
        }
      : conf.tipo === 'reconectar'
        ? {
            title: 'Reconectar',
            message: conf.e.propria
              ? `Logar @${conf.e.usuario} no emulador próprio dela? (ele liga, loga e desliga)`
              : `Logar @${conf.e.usuario} de novo no app do Instagram?`,
            confirmText: 'Reconectar',
            danger: false,
          }
        : {
            title: 'Apagar grupo',
            message: `Apagar o grupo "${conf.nome}"? As contas continuam, só saem dele.`,
            confirmText: 'Apagar',
            danger: true,
          }
  function confirmar() {
    if (!conf) return
    if (conf.tipo === 'apagar') apagar(conf.e)
    else if (conf.tipo === 'reconectar') reconectar(conf.e)
    else apagarGrupo(conf.nome)
  }

  // ───── render ─────
  const carregando = contasQ.isLoading
  const erro = contasQ.isError && !contasQ.data

  return (
    <>
      <PageHeader
        title="Contas"
        subtitle={
          carregando
            ? 'Carregando…'
            : `${entries.length} conta${entries.length === 1 ? '' : 's'} · ${nLogadas} logada${nLogadas === 1 ? '' : 's'} no emulador`
        }
        action={
          <div className="flex items-center gap-2">
            {/* recarregar = o "puxar pra atualizar" do app */}
            <Button
              variant="ghost"
              size="icon"
              title="Recarregar lista"
              aria-label="Recarregar lista"
              onClick={() => recarregar()}
              disabled={contasQ.isFetching}
            >
              <RotateCw className={cn('h-4 w-4', contasQ.isFetching && !carregando && 'animate-spin')} />
            </Button>
            <Button
              variant="subtle"
              onClick={sincronizarEVerificar}
              disabled={sincronizando}
              title="Verificar e sincronizar"
            >
              <RefreshCw className={cn('h-4 w-4', sincronizando && 'animate-spin')} />
              <span className="hidden sm:inline">{sincronizando ? 'Sincronizando…' : 'Verificar e sincronizar'}</span>
            </Button>
            <Button onClick={() => contaDlg.abrir({ editando: false, usuario: '', senha: '' })} title="Adicionar conta">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Adicionar conta</span>
            </Button>
          </div>
        }
      />
      <PageBody className="space-y-5">
        <p className="flex items-start gap-2 text-sm text-txt-dim leading-relaxed max-w-4xl">
          <Info className="h-4 w-4 mt-0.5 shrink-0 text-txt-faint" />
          <span>
            Salve suas contas (@ + senha) — o agente loga elas no app do Instagram sozinho. A senha fica{' '}
            <strong className="text-txt font-semibold">só neste navegador</strong> e vai junto só na hora de logar. Toda
            conta sincroniza: o verificar loga as que faltam (a do brechó no emulador próprio dela).
          </span>
        </p>

        <AnimatePresence initial={false}>
          {emulOffline && (
            <Faixa key="off" tom="warn" icon={TriangleAlert}>
              <strong className="text-warn font-semibold">Emulador offline</strong> — o agente do PC não respondeu. O
              estado das contas pode estar desatualizado.
            </Faixa>
          )}
          {verificando && (
            <Faixa key="ver" tom="info" icon={ShieldCheck}>
              <strong className="text-primary-light font-semibold">Verificando as sessões</strong> no emulador — o
              estado das contas atualiza sozinho.
            </Faixa>
          )}
        </AnimatePresence>

        <div className="grid gap-5 items-start 2xl:grid-cols-[minmax(0,1fr)_320px]">
          <aside className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-1 2xl:order-2 2xl:sticky 2xl:top-4 min-w-0">
            <PainelGrupos
              grupos={grupos}
              carregando={gruposQ.isLoading}
              editando={editGrupo?.nome ?? null}
              onAbrir={abrirGrupo}
              onNovo={() => nomeDlg.abrir({ original: null, nome: '' })}
              onRenomear={(n) => nomeDlg.abrir({ original: n, nome: n })}
              onApagar={(n) => confDlg.abrir({ tipo: 'apagarGrupo', nome: n })}
            />
            <PainelAtalhos />
          </aside>

          <div className="min-w-0 2xl:order-1">
            <Card className="overflow-hidden">
              {/* barra de filtros */}
              <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
                <div className="relative flex-1 min-w-0 lg:max-w-xs">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-txt-faint" />
                  <Input
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar @conta"
                    className="pl-9 pr-9 text-sm"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  {busca && (
                    <button
                      type="button"
                      onClick={() => setBusca('')}
                      aria-label="Limpar busca"
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 flex items-center justify-center rounded-md text-txt-faint hover:text-txt hover:bg-border/60"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <Select
                  value={grupoEf}
                  onChange={(e) => setGrupoFiltro(e.target.value)}
                  className="lg:w-56 text-sm"
                  aria-label="Filtrar por grupo"
                >
                  <option value="">Todos os grupos</option>
                  <option value={SEM_GRUPO}>Sem grupo</option>
                  {gruposOrd.map((g) => (
                    <option key={g.nome} value={g.nome}>
                      {g.nome} ({g.contas.length})
                    </option>
                  ))}
                </Select>
                <div className="overflow-x-auto -mx-1 px-1 lg:ml-auto shrink-0">
                  <Tabs
                    value={secao}
                    onChange={setSecao}
                    options={(['todas', ...SECOES.map((s) => s.id)] as ('todas' | Secao)[]).map((id) => ({
                      value: id,
                      label: (
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                          {id === 'todas' ? 'Todas' : id === 'fora' ? 'Fora' : SECOES.find((s) => s.id === id)!.titulo}
                          <span className="tabular-nums opacity-70">{contagem[id]}</span>
                        </span>
                      ),
                    }))}
                  />
                </div>
              </div>

              {carregando ? (
                <div className="border-t border-border p-4 space-y-2.5">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="h-8 w-8 rounded-lg" />
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-6 w-24 rounded-full ml-auto lg:ml-8" />
                      <Skeleton className="h-8 w-48 hidden lg:block ml-auto" />
                    </div>
                  ))}
                </div>
              ) : erro ? (
                <div className="border-t border-border">
                  <EmptyState
                    icon={<TriangleAlert className="h-10 w-10" />}
                    title="Não consegui carregar as contas"
                    subtitle={erroMsg(contasQ.error)}
                    action={
                      <Button variant="subtle" onClick={() => contasQ.refetch()}>
                        <RefreshCw className="h-4 w-4" />
                        Tentar de novo
                      </Button>
                    }
                  />
                </div>
              ) : entries.length === 0 ? (
                <div className="border-t border-border">
                  <EmptyState
                    icon={<Users className="h-10 w-10" />}
                    title="Nenhuma conta ainda"
                    subtitle="Adicione uma aí em cima (o @ e a senha) ou crie uma conta nova."
                    action={
                      <Button onClick={() => contaDlg.abrir({ editando: false, usuario: '', senha: '' })}>
                        <Plus className="h-4 w-4" />
                        Adicionar conta
                      </Button>
                    }
                  />
                </div>
              ) : blocos.length === 0 ? (
                <div className="border-t border-border">
                  <EmptyState
                    icon={<SearchX className="h-10 w-10" />}
                    title="Nada com esse filtro"
                    subtitle="Nenhuma conta bate com a busca, o grupo ou a seção escolhida."
                    action={
                      <Button variant="subtle" onClick={limparFiltros}>
                        Limpar filtros
                      </Button>
                    }
                  />
                </div>
              ) : (
                <ListaContas
                  blocos={blocos}
                  editGrupo={editGrupo}
                  onMarcar={toggleNoGrupo}
                  busy={busy}
                  verificando={verificando}
                  onReconectar={(e) => !busy && confDlg.abrir({ tipo: 'reconectar', e })}
                  onCodigo={(e) => codDlg.abrir({ user: e.usuario, codigo: '' })}
                  onEditar={(e) => contaDlg.abrir({ editando: true, usuario: e.usuario, senha: e.senha || '' })}
                  onApagar={(e) => confDlg.abrir({ tipo: 'apagar', e })}
                />
              )}

              {!carregando && !erro && entries.length > 0 && (
                <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-border text-xs text-txt-faint">
                  <span className="tabular-nums">
                    {visiveis.length === entries.length
                      ? `${entries.length} conta${entries.length === 1 ? '' : 's'}`
                      : `${visiveis.length} de ${entries.length} contas`}
                  </span>
                  {temFiltro && (
                    <button type="button" onClick={limparFiltros} className="font-semibold text-txt-dim hover:text-txt">
                      Limpar filtros
                    </button>
                  )}
                </div>
              )}
            </Card>

            {/* barra do modo "marcar contas do grupo" — gruda no rodapé enquanto rola a lista */}
            <AnimatePresence>
              {editGrupo && (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 16 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  className="sticky bottom-4 z-20 mt-4"
                >
                  <div className="mx-auto max-w-3xl flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl2 border border-primary/40 bg-surface/95 backdrop-blur px-4 py-3 shadow-glow">
                    <Tags className="h-4 w-4 text-primary-light shrink-0" />
                    <p className="flex-1 min-w-[180px] text-sm text-txt-dim">
                      Marque as contas do grupo <strong className="text-txt">{editGrupo.nome}</strong>{' '}
                      <span className="tabular-nums">
                        ({editGrupo.sel.size} marcada{editGrupo.sel.size !== 1 ? 's' : ''})
                      </span>
                    </p>
                    <div className="flex items-center gap-1.5 ml-auto">
                      <Button variant="ghost" size="sm" onClick={marcarVisiveis} title="Marca todas as contas que estão aparecendo">
                        Marcar visíveis
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditGrupo((eg) => (eg ? { ...eg, sel: new Set() } : eg))}
                      >
                        Limpar
                      </Button>
                      <Button variant="subtle" size="sm" onClick={() => setEditGrupo(null)}>
                        Cancelar
                      </Button>
                      <Button size="sm" loading={salvandoGrupo} onClick={salvarMembros}>
                        Salvar grupo
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </PageBody>

      <ModalConta
        aberto={contaDlg.aberto}
        dados={contaDlg.dados}
        salvando={salvandoConta}
        onMudar={contaDlg.atualizar}
        onFechar={contaDlg.fechar}
        onSalvar={salvarConta}
      />
      <ModalCodigo
        aberto={codDlg.aberto}
        dados={codDlg.dados}
        enviando={enviandoCod}
        onMudar={codDlg.atualizar}
        onFechar={codDlg.fechar}
        onEnviar={enviarCodigo}
      />
      <ModalNomeGrupo
        aberto={nomeDlg.aberto}
        dados={nomeDlg.dados}
        salvando={salvandoNome}
        onMudar={nomeDlg.atualizar}
        onFechar={nomeDlg.fechar}
        onSalvar={salvarNomeGrupo}
      />
      <ModalAviso aberto={avisoDlg.aberto} dados={avisoDlg.dados} onFechar={avisoDlg.fechar} />
      <ConfirmModal
        open={confDlg.aberto}
        onClose={confDlg.fechar}
        onConfirm={confirmar}
        title={confTxt.title}
        message={confTxt.message}
        confirmText={confTxt.confirmText}
        danger={confTxt.danger}
      />
    </>
  )
}
