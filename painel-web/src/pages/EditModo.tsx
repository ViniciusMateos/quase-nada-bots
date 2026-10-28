// /bots/:botId/modos/:modo — editor de modo (EditModoScreen do app). :modo = "novo" cria um modo
// (tudo começa desligado). Salvar = lê os modos, troca o editado e grava todos (api.putModos).
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import type { Variants } from 'framer-motion'
import { RefreshCw, Save, SlidersHorizontal, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import { QK, useBots } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { Button, Card, EmptyState, Input, PageBody, PageHeader, Section, Skeleton } from '@/components/ui'
import { ConfirmModal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { botDoCatalogo } from '@/components/bots/catalogo'
import { Migalha } from '@/components/bots/Migalha'
import { useAviso } from '@/components/bots/Aviso'
import { CampoModo } from '@/components/bots/CampoModo'
import {
  CAMPOS_NOVO, CATS, ESQUEMA_NOVO, ehString, metaDe, OCULTOS, OCULTOS_DEFAULT, sugGeral, temValor, zerado,
} from '@/components/bots/camposModo'
import type { Tipo, Valor } from '@/components/bots/camposModo'

type Modos = Record<string, Record<string, unknown>>

const lista: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } }
const item: Variants = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' } } }

export default function EditModo() {
  const { botId = '', modo: modoParam = '' } = useParams()
  return <TelaEditModo key={`${botId}/${modoParam}`} botId={botId} modoParam={modoParam} />
}

function TelaEditModo({ botId, modoParam }: { botId: string; modoParam: string }) {
  const location = useLocation()
  const nav = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const { aviso, avisoEl } = useAviso()
  const bots = useBots()
  const nomeBot = bots.data?.[botId]?.nome ?? botDoCatalogo(botId)?.nomeFallback ?? botId
  // "novo" = criar; o state.editar desambigua um modo que se chame "novo" de verdade
  const criar = modoParam === 'novo' && !(location.state as { editar?: boolean } | null)?.editar
  const modoNome = criar ? '' : modoParam

  const [todos, setTodos] = useState<Modos>({})
  const [modo, setModo] = useState<Record<string, Valor>>({})
  const [ligados, setLigados] = useState<Set<string>>(new Set())   // interruptores ON (separado do valor!)
  const [nome, setNome] = useState(modoNome)
  // campo de texto que o editor não sabe editar: guardado à parte e devolvido intacto ao salvar
  const [passthrough, setPassthrough] = useState<Record<string, unknown>>({})
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'erro'>('carregando')
  const [tentativa, setTentativa] = useState(0)
  const [salvando, setSalvando] = useState(false)
  const [confirmarApagar, setConfirmarApagar] = useState(false)

  useEffect(() => {
    let vivo = true
    setEstado('carregando')
    api.getModos(botId)
      .then((m) => {
        if (!vivo) return
        qc.setQueryData(QK.modos(botId), m)
        setTodos(m)
        const existente = m[modoNome] as Record<string, Valor> | undefined
        // modo ainda não salvo (o "padrão" virtual) usa o template completo
        const usarTemplate = criar || !existente
        // esquema novo (emulador): sempre os campos atuais do bot, mesmo editando um modo antigo
        const campos = usarTemplate || ESQUEMA_NOVO.has(botId)
          ? (CAMPOS_NOVO[botId] ?? Object.keys(Object.values(m)[0] ?? {}))
          : Object.keys(existente)
        const base: Record<string, Valor> = {}
        const on = new Set<string>()
        const passa: Record<string, unknown> = {}
        campos.filter((k) => !OCULTOS.has(k)).forEach((k) => {
          const orig = criar ? undefined : existente?.[k]
          const meta = metaDe(k, orig, botId)
          if (!usarTemplate && typeof orig === 'string' && !ehString(meta.tipo)) { passa[k] = orig; return }
          const v = usarTemplate || orig === undefined
            ? (meta.tipo === 'lista' ? [] : ehString(meta.tipo) ? ((meta.sug as string) ?? '') : zerado(meta.tipo))
            : orig
          base[k] = v
          if (!ehString(meta.tipo) && temValor(meta.tipo, v)) on.add(k)   // já vem ligado se tinha valor
        })
        setModo(base)
        setLigados(on)
        setPassthrough(passa)
        setNome(modoNome)
        setEstado('ok')
      })
      .catch(() => { if (vivo) setEstado('erro') })
    return () => { vivo = false }
  }, [botId, modoNome, criar, tentativa, qc])

  const setCampo = (k: string, v: Valor) => setModo((prev) => ({ ...prev, [k]: v }))

  function alternar(k: string, tipo: Tipo, on: boolean) {
    if (tipo === 'bool') { setCampo(k, on); return }
    setLigados((prev) => { const n = new Set(prev); if (on) n.add(k); else n.delete(k); return n })
    if (on && !temValor(tipo, modo[k])) setCampo(k, metaDe(k, modo[k], botId).sug ?? (tipo === 'range' ? [1, 1] : 1))
  }

  // modo final: ligado usa o valor; desligado vira 0 / [0,0]
  function montarFinal(): Record<string, Valor> {
    const out: Record<string, Valor> = { ...OCULTOS_DEFAULT[botId], ...(passthrough as Record<string, Valor>) }
    Object.keys(modo).forEach((k) => {
      const tipo = metaDe(k, modo[k], botId).tipo
      if (tipo === 'bool') out[k] = Boolean(modo[k])
      else if (tipo === 'lista') out[k] = ((modo[k] as string[]) ?? []).map((t) => String(t).trim()).filter(Boolean)
      else if (tipo === 'text') {
        const s = String(modo[k] ?? '').trim()
        out[k] = k === 'alvo' ? s.replace(/^@+/, '') : s   // só a conta-alvo tira o "@"
      }
      else if (tipo === 'opcao') out[k] = String(modo[k] || (sugGeral(k) as string) || '')
      else out[k] = ligados.has(k) ? modo[k] : zerado(tipo)
    })
    return out
  }

  async function gravar(nomeFinal: string) {
    setSalvando(true)
    try {
      const atuais = await api.getModos(botId)   // lê os modos de agora, troca o editado, grava todos
      if (atuais[nomeFinal] && nomeFinal !== modoNome) { aviso('Já existe', `Já tem um modo "${nomeFinal}".`); return }
      const proximos: Modos = { ...atuais }
      if (!criar && nomeFinal !== modoNome) delete proximos[modoNome]   // renomeou
      proximos[nomeFinal] = montarFinal()
      await api.putModos(botId, proximos)
      qc.setQueryData(QK.modos(botId), proximos)
      toast.ok(`Modo "${nomeFinal}" salvo.`)
      nav(`/bots/${botId}`, { state: { modo: nomeFinal } })
    } catch {
      aviso('Ops', 'Não consegui salvar.')
    } finally { setSalvando(false) }
  }

  function salvar() {
    const n = nome.trim()
    if (!n) { aviso('Falta o nome', 'Dê um nome pro modo (ex: turbo, seguro).'); return }
    // colisão: nome já usado por OUTRO modo (criar, ou renomear pra cima de um existente)
    if (todos[n] && n !== modoNome) { aviso('Já existe', `Já tem um modo "${n}".`); return }
    gravar(n)
  }

  async function apagar() {
    try {
      const resto: Modos = { ...(await api.getModos(botId)) }
      delete resto[modoNome]
      await api.putModos(botId, resto)
      qc.setQueryData(QK.modos(botId), resto)
      toast.ok(`Modo "${modoNome}" apagado.`)
      nav(`/bots/${botId}`)
    } catch { aviso('Ops', 'Não consegui apagar.') }
  }

  const porCat = useMemo(() => CATS.map((c) => {
    const campos = Object.keys(modo).filter((k) => metaDe(k, modo[k], botId).cat === c.key)
    const ativos = campos.filter((k) => {
      const meta = metaDe(k, modo[k], botId)
      if (meta.tipo === 'bool') return Boolean(modo[k])
      if (ehString(meta.tipo)) return temValor(meta.tipo, modo[k])
      return ligados.has(k)
    }).length
    return { ...c, campos, ativos }
  }).filter((c) => c.campos.length > 0), [modo, ligados, botId])

  const migalha = (
    <Migalha itens={[
      { label: 'Bots', to: '/bots' },
      { label: nomeBot, to: `/bots/${botId}` },
      { label: criar ? 'Novo modo' : modoNome },
    ]} />
  )

  if (estado === 'carregando') {
    return (
      <>
        {migalha}
        <PageHeader title={criar ? 'Novo modo' : 'Editar modo'} />
        <PageBody>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] items-start">
            <div className="space-y-5">
              <Skeleton className="h-32 rounded-xl2" />
              <Skeleton className="h-64 rounded-xl2" />
              <Skeleton className="h-48 rounded-xl2" />
            </div>
            <Skeleton className="h-64 rounded-xl2" />
          </div>
        </PageBody>
      </>
    )
  }

  if (estado === 'erro') {
    return (
      <>
        {migalha}
        <PageHeader title={criar ? 'Novo modo' : 'Editar modo'} />
        <PageBody>
          <Card>
            <EmptyState
              icon={<SlidersHorizontal className="h-9 w-9" />}
              title="Não consegui puxar os modos."
              subtitle="Sem eles não dá pra salvar sem atropelar os outros modos. Tenta de novo."
              action={<Button variant="subtle" onClick={() => setTentativa((t) => t + 1)}><RefreshCw className="h-4 w-4" />Tentar de novo</Button>}
            />
          </Card>
        </PageBody>
      </>
    )
  }

  const totalLigados = porCat.reduce((n, c) => n + c.ativos, 0)
  const totalCampos = porCat.reduce((n, c) => n + c.campos.length, 0)

  return (
    <>
      {migalha}
      <PageHeader
        title={criar ? 'Novo modo' : 'Editar modo'}
        subtitle={criar ? `${nomeBot} · tudo começa desligado; ligue só o que quiser e ponha o valor.` : `"${modoNome}" · ${nomeBot}`}
      />
      <PageBody>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] items-start">
          <motion.div variants={lista} initial="hidden" animate="show" className="space-y-5 min-w-0">
            <motion.div variants={item}>
              <Section title="Nome do modo">
                <Input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') salvar() }}
                  placeholder="ex: turbo, seguro"
                  autoCapitalize="none"
                  autoFocus={criar}
                  className="max-w-md"
                />
                <p className="text-xs text-txt-faint mt-2">
                  {criar ? 'Tudo começa desligado. Ligue só o que quiser e ponha o valor.' : 'Dá pra renomear aqui — é só mudar o nome e salvar.'}
                </p>
              </Section>
            </motion.div>

            {porCat.length === 0 ? (
              <motion.div variants={item}>
                <Card>
                  <EmptyState icon={<SlidersHorizontal className="h-8 w-8" />} title="Esse bot não tem campos pra configurar." />
                </Card>
              </motion.div>
            ) : porCat.map((c) => (
              <motion.div key={c.key} variants={item} id={`cat-${c.key}`} className="scroll-mt-6">
                <Section
                  title={c.titulo}
                  action={<span className="text-[11px] font-semibold text-txt-faint tabular-nums">{c.ativos}/{c.campos.length} ligados</span>}
                >
                  <div className="grid gap-3 md:grid-cols-2">
                    {c.campos.map((k) => {
                      const meta = metaDe(k, modo[k], botId)
                      const on = meta.tipo === 'bool' ? Boolean(modo[k]) : ligados.has(k)
                      return (
                        <CampoModo key={k} k={k} meta={meta} valor={modo[k]} on={on}
                          onToggle={(v) => alternar(k, meta.tipo, v)} onChange={(v) => setCampo(k, v)} />
                      )
                    })}
                  </div>
                </Section>
              </motion.div>
            ))}
          </motion.div>

          {/* resumo + ações */}
          <motion.aside
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.1 }}
            className="lg:sticky lg:top-6"
          >
            <Card className="overflow-hidden">
              <div className="px-5 pt-5 pb-4 border-b border-border">
                <p className="text-[11px] font-bold uppercase tracking-wide text-txt-faint">{criar ? 'Modo novo' : 'Modo'}</p>
                <p className={cn('font-bold truncate', nome.trim() ? 'text-txt' : 'text-txt-faint italic')}>{nome.trim() || 'sem nome'}</p>
                <p className="text-xs text-txt-dim mt-1 tabular-nums">{totalLigados} de {totalCampos} campos ligados</p>
              </div>
              {porCat.length > 0 && (
                <nav className="px-3 py-3 border-b border-border">
                  {porCat.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => document.getElementById(`cat-${c.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                      className="w-full flex items-center justify-between gap-3 h-9 px-2.5 rounded-lg text-sm text-txt-dim hover:text-txt hover:bg-surface2 transition-colors"
                    >
                      <span className="truncate">{c.titulo}</span>
                      <span className={cn('text-[11px] font-bold tabular-nums', c.ativos ? 'text-primary-light' : 'text-txt-faint')}>{c.ativos}/{c.campos.length}</span>
                    </button>
                  ))}
                </nav>
              )}
              <div className="p-5 space-y-2.5">
                <Button className="w-full" size="lg" onClick={salvar} loading={salvando}>
                  <Save className="h-4 w-4" />{criar ? 'Criar modo' : 'Salvar modo'}
                </Button>
                {!criar && (
                  <Button className="w-full" variant="danger" onClick={() => setConfirmarApagar(true)} disabled={salvando}>
                    <Trash2 className="h-4 w-4" />Apagar modo
                  </Button>
                )}
                <Link to={`/bots/${botId}`} className="block text-center text-xs font-semibold text-txt-dim hover:text-txt pt-1">
                  cancelar
                </Link>
              </div>
            </Card>
          </motion.aside>
        </div>
      </PageBody>

      <ConfirmModal
        open={confirmarApagar}
        onClose={() => setConfirmarApagar(false)}
        onConfirm={apagar}
        title="Apagar modo"
        message={`Apagar o modo "${modoNome}"? Não dá pra desfazer.`}
        confirmText="Apagar"
        danger
      />
      {avisoEl}
    </>
  )
}
