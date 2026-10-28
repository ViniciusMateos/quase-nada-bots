// Criar Conta NO EMULADOR, modo "até o código" — versão painel do CriarContaScreen do app.
// A tela só GERA os dados e dispara o bot (POST /emulador/criar-conta); o agente do PC preenche
// usuário → senha → nascimento → e-mail, pega o código no Gmail e PARA. O resto (Concordo + boas-
// vindas) é na mão, no emulador. Acompanha pelo log da execução.
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight,
  AtSign,
  Check,
  ChevronDown,
  Copy,
  Info,
  LoaderCircle,
  Mail,
  Plus,
  RotateCcw,
  Shuffle,
  TriangleAlert,
  Trash2,
  UserPlus,
  WandSparkles,
} from 'lucide-react'
import { Button, Input, Label, PageBody, Section, Skeleton } from '@/components/ui'
import { ConfirmModal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { api, type Account } from '@/lib/api'
import { erroMsg } from '@/lib/apiClient'
import {
  lerNascPadrao,
  lerSenhaPadrao,
  salvarCredencialPendente,
  salvarNascPadrao,
  salvarSenhaPadrao,
  type Nasc,
} from '@/lib/credenciais'
import { QK, useContas, useEmulador } from '@/lib/queries'
import { ehUsername } from '@/lib/syncEmulador'
import { cn } from '@/lib/utils'
import { CabecalhoMigalha, Campo, CampoSenha, IconBtn, Select, useDialogo } from '@/components/contas/pecas'

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

function gerarSenha() {
  const L = 'abcdefghjkmnpqrstuvwxyz', U = 'ABCDEFGHJKLMNPQRSTUVWXYZ', D = '23456789', S = '!@#$'
  const pick = (s: string, n: number) => Array.from({ length: n }, () => s[Math.floor(Math.random() * s.length)]).join('')
  return (pick(U, 1) + pick(L, 6) + pick(D, 3) + pick(S, 1) + pick(L, 2))
    .split('')
    .sort(() => Math.random() - 0.5)
    .join('')
}

/** Nascimento sorteado: idade de 20 a 34 anos (igual o app). */
function gerarNasc(): Nasc {
  return {
    ano: new Date().getFullYear() - (20 + Math.floor(Math.random() * 15)),
    mes: 1 + Math.floor(Math.random() * 12),
    dia: 1 + Math.floor(Math.random() * 28),
  }
}

const diasNoMes = (mes: number, ano: number) => new Date(ano, mes, 0).getDate()

function idadeDe(n: Nasc): number {
  const h = new Date()
  let i = h.getFullYear() - n.ano
  const m = h.getMonth() + 1
  if (m < n.mes || (m === n.mes && h.getDate() < n.dia)) i--
  return i
}

/** Próximo da série: prefixo mais comum entre as contas + (maior número + 1). Mesma regra do app. */
function sugerirUsuario(contas: Account[]): string {
  const freq: Record<string, number> = {}
  for (const c of contas) {
    const m = (c.label || '').match(/^(.*?)(\d+)$/)
    if (m) freq[m[1]] = (freq[m[1]] || 0) + 1
  }
  const pfx = Object.keys(freq).sort((a, b) => freq[b] - freq[a])[0] || 'quasenadasegue'
  let n = 1
  const re = new RegExp('^' + pfx.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\d+)$', 'i')
  for (const c of contas) {
    const m = (c.label || '').match(re)
    if (m) n = Math.max(n, parseInt(m[1], 10))
  }
  return pfx + (n + 1)
}

const p2 = (n: number) => String(n).padStart(2, '0')

export default function CriarConta() {
  const qc = useQueryClient()
  const nav = useNavigate()
  const toast = useToast()
  const contasQ = useContas()
  const emulQ = useEmulador()
  const gmailsQ = useQuery({ queryKey: QK.gmails, queryFn: api.getGmailContas })
  const gmails = useMemo(() => (Array.isArray(gmailsQ.data) ? gmailsQ.data : []), [gmailsQ.data])

  const [username, setUsername] = useState('')
  const [senha, setSenha] = useState(gerarSenha)
  const [nasc, setNasc] = useState<Nasc>(gerarNasc)
  const [baseEmail, setBaseEmail] = useState('')
  const [extras, setExtras] = useState(false) // senha + nascimento (já vêm preenchidos)
  const [msg, setMsg] = useState('')
  const [criando, setCriando] = useState(false)

  const [novoEmail, setNovoEmail] = useState('')
  const [novoPw, setNovoPw] = useState('')
  const [msgGmail, setMsgGmail] = useState('')
  const [addingGmail, setAddingGmail] = useState(false)
  const remDlg = useDialogo<string>()

  // senha e nascimento: os da última run (ficam salvos SÓ no navegador) pra pré-preencher
  useEffect(() => {
    lerSenhaPadrao().then((s) => {
      if (s) setSenha(s)
    })
    lerNascPadrao().then((n) => {
      if (n) setNasc(n)
    })
  }, [])

  // contas frescas pra sugerir o próximo número (o app busca ao abrir a tela)
  useEffect(() => {
    qc.invalidateQueries({ queryKey: QK.contas })
  }, [qc])

  const sugestao = useMemo(() => {
    if (contasQ.data && contasQ.isFetchedAfterMount) return sugerirUsuario(contasQ.data)
    if (contasQ.isError) return 'quasenadasegue2'
    return ''
  }, [contasQ.data, contasQ.isFetchedAfterMount, contasQ.isError])

  useEffect(() => {
    if (sugestao) setUsername((u) => u || sugestao)
  }, [sugestao])

  // Gmail base: mantém o escolhido se ainda existe, senão o primeiro
  useEffect(() => {
    setBaseEmail((atual) => (atual && gmails.some((c) => c.user === atual) ? atual : gmails[0]?.user || ''))
  }, [gmails])

  // e-mail = base do Gmail + "+usuario" (plus-addressing; tudo cai na mesma caixa)
  const u = username.trim().replace(/^@/, '')
  const email = useMemo(() => {
    if (!u || !baseEmail.includes('@')) return ''
    const [loc, dom] = baseEmail.split('@')
    return `${loc}+${u}@${dom}`
  }, [u, baseEmail])

  const faltando = !username.trim() || !senha.trim() || !email
  const usuarioEsquisito = !!u && !ehUsername(u)

  // data de nascimento (selects)
  const hoje = new Date().getFullYear()
  const aMax = Math.max(hoje - 18, nasc.ano)
  const aMin = Math.min(hoje - 60, nasc.ano)
  const anos = Array.from({ length: aMax - aMin + 1 }, (_, i) => aMax - i)
  const maxDia = diasNoMes(nasc.mes, nasc.ano)
  const idade = idadeDe(nasc)
  function setN(p: Partial<Nasc>) {
    setNasc((n) => {
      const novo = { ...n, ...p }
      novo.dia = Math.min(novo.dia, diasNoMes(novo.mes, novo.ano)) // reclampa o dia
      return novo
    })
  }

  async function copiarEmail() {
    try {
      await navigator.clipboard.writeText(email)
      toast.ok('E-mail copiado.')
    } catch {
      toast.error('Não consegui copiar.')
    }
  }

  async function criar() {
    if (faltando) {
      setMsg('Preencha o usuário e escolha o Gmail base.')
      return
    }
    setCriando(true)
    setMsg('')
    try {
      // ATÉ O CÓDIGO (27/10): o bot para depois do código do e-mail; termos + boas-vindas são na mão
      // (o IG desafia toda conta nova criada no automático logo depois dos termos)
      const res = await api.criarContaEmulador({
        username: u,
        senha,
        email,
        ano: nasc.ano,
        mes: nasc.mes,
        dia: nasc.dia,
        ate_codigo: true,
      })
      // senha PENDENTE: só vira credencial quando a conta aparecer no app (o agente só cadastra se
      // criou de verdade) — senão o sincronizar cadastra e loga uma conta que nem existe
      try { await salvarCredencialPendente({ usuario: u, senha }) } catch { /* ok */ }
      try { await salvarSenhaPadrao(senha) } catch { /* ok */ } // pré-preenche a próxima run
      try { await salvarNascPadrao(nasc) } catch { /* ok */ }
      qc.invalidateQueries({ queryKey: QK.runs })
      nav(`/execucoes/${res.run_id}`)
    } catch (e) {
      setMsg(erroMsg(e) || 'erro ao disparar a criação')
      setCriando(false)
    }
  }

  async function addGmail() {
    const user = novoEmail.trim()
    const senhaApp = novoPw.trim()
    if (!user.includes('@') || !senhaApp) {
      setMsgGmail('Põe o e-mail e a senha de app.')
      return
    }
    setAddingGmail(true)
    try {
      await api.addGmailConta(user, senhaApp)
      setNovoEmail('')
      setNovoPw('')
      setMsgGmail('')
      await qc.invalidateQueries({ queryKey: QK.gmails })
      setBaseEmail(user)
      toast.ok('Gmail adicionado.')
    } catch (e) {
      setMsgGmail('Gmail: ' + erroMsg(e))
    } finally {
      setAddingGmail(false)
    }
  }

  async function removerGmail(user: string) {
    try {
      await api.removerGmailConta(user)
      await qc.invalidateQueries({ queryKey: QK.gmails })
      toast.ok('Gmail removido.')
    } catch {
      toast.error('Não consegui remover o Gmail.')
    }
  }

  const nLogadas = (emulQ.data?.contas_logadas ?? []).filter(ehUsername).length

  return (
    <>
      <CabecalhoMigalha
        trilha={[{ label: 'Contas', to: '/contas' }, { label: 'Criar' }]}
        title="Criar conta"
        subtitle="O bot cria a conta no app do Instagram do emulador e para no código do e-mail."
      />
      <PageBody>
        <div className="grid gap-5 items-start xl:grid-cols-[minmax(0,1fr)_380px] xl:grid-rows-[auto_1fr]">
          {/* ── como funciona ── */}
          <Section title="Como funciona" className="xl:col-start-2 xl:row-start-1">
            <ol className="space-y-3">
              {[
                'O bot começa o cadastro no app do Instagram do emulador: usuário, senha, nascimento e e-mail.',
                'Pega o código de confirmação no Gmail sozinho.',
                'Aí PARA e te avisa: você termina no emulador (Concordo + telas de boas-vindas).',
              ].map((t, i) => (
                <li key={i} className="flex gap-3">
                  <span className="h-6 w-6 rounded-full bg-primary/15 text-primary-light text-xs font-bold flex items-center justify-center shrink-0 tabular-nums">
                    {i + 1}
                  </span>
                  <span className="text-sm text-txt-dim leading-relaxed">{t}</span>
                </li>
              ))}
            </ol>
            <p className="text-xs text-txt-faint leading-relaxed mt-3">
              Enquanto isso o emulador fica reservado pra você (até 15 min ou até voltar pra tela principal do
              Instagram).
            </p>
            <div className="mt-4 rounded-xl border border-warn/30 bg-warn/[0.07] p-3.5">
              <div className="flex gap-2.5">
                <TriangleAlert className="h-4 w-4 text-warn shrink-0 mt-0.5" />
                <div className="text-sm text-txt-dim leading-relaxed">
                  O Instagram limita <strong className="text-warn">~10 contas por aparelho</strong>. Com o seletor cheio,
                  o botão "criar" some no app e o bot avisa "limite de contas" — aí é preciso sair de uma conta antiga
                  pra abrir vaga.
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                    {emulQ.data && (
                      <span className={cn('text-xs tabular-nums', nLogadas >= 10 ? 'text-warn font-semibold' : 'text-txt-faint')}>
                        Agora: {nLogadas} conta{nLogadas === 1 ? '' : 's'} logada{nLogadas === 1 ? '' : 's'} no emulador
                      </span>
                    )}
                    <Link
                      to="/contas/remover"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-primary-light hover:text-primary"
                    >
                      Remover contas do emulador
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </Section>

          {/* ── dados da conta ── */}
          <Section title="Dados da conta" className="xl:col-start-1 xl:row-start-1 xl:row-span-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo
                label="Usuário (@)"
                acao={
                  sugestao && u !== sugestao ? (
                    <button
                      type="button"
                      onClick={() => setUsername(sugestao)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary-light hover:text-primary"
                    >
                      <RotateCcw className="h-3 w-3" />
                      usar {sugestao}
                    </button>
                  ) : null
                }
                dica={
                  usuarioEsquisito ? (
                    <span className="text-warn">O Instagram só aceita letras minúsculas, números, ponto e _.</span>
                  ) : (
                    'Sugerido: o próximo número da série das suas contas.'
                  )
                }
              >
                {contasQ.isLoading && !username ? (
                  <Skeleton className="h-11 rounded-xl" />
                ) : (
                  <div className="relative">
                    <AtSign className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-txt-faint" />
                    <Input
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="usuário"
                      autoComplete="off"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      className="pl-10 font-semibold"
                    />
                  </div>
                )}
              </Campo>

              <Campo label="E-mail da conta (não edita)" dica="Gmail base + o usuário como +alias: tudo cai na mesma caixa.">
                <div className="h-11 flex items-center gap-2 pl-3.5 pr-1.5 rounded-xl border border-dashed border-border bg-surface2/40 min-w-0">
                  <Mail className="h-4 w-4 text-txt-faint shrink-0" />
                  <span className={cn('flex-1 min-w-0 truncate font-mono text-[13px]', email ? 'text-txt' : 'text-txt-faint')}>
                    {email || '—'}
                  </span>
                  {email && (
                    <IconBtn title="Copiar e-mail" onClick={copiarEmail}>
                      <Copy className="h-3.5 w-3.5" />
                    </IconBtn>
                  )}
                </div>
              </Campo>

              <Campo className="sm:col-span-2" label="E-mail base (Gmail) — o +alias de cada conta sai dele">
                {gmailsQ.isLoading ? (
                  <div className="flex gap-2">
                    <Skeleton className="h-9 w-48 rounded-full" />
                    <Skeleton className="h-9 w-40 rounded-full" />
                  </div>
                ) : gmails.length === 0 ? (
                  <p className="text-sm text-txt-dim">
                    Nenhum Gmail ainda. Adicione um em "Contas de Gmail" (precisa de senha de app).
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {gmails.map((g) => {
                      const on = baseEmail === g.user
                      return (
                        <button
                          key={g.user}
                          type="button"
                          onClick={() => setBaseEmail(g.user)}
                          className={cn(
                            'relative inline-flex items-center h-9 px-3.5 rounded-full border text-sm font-semibold transition-colors max-w-full',
                            on ? 'border-primary text-white' : 'border-border bg-surface2 text-txt hover:border-txt-faint',
                          )}
                        >
                          {on && (
                            <motion.span
                              layoutId="gmail-base"
                              className="absolute inset-0 rounded-full bg-primary"
                              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                            />
                          )}
                          <span className="relative flex items-center gap-1.5 min-w-0">
                            {on ? <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={3} /> : <Mail className="h-3.5 w-3.5 shrink-0 text-txt-faint" />}
                            <span className="truncate">{g.user}</span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </Campo>
            </div>

            {/* senha e nascimento: o IG pede antes do e-mail, então o bot preenche — já vêm da última run */}
            <div className="mt-5 rounded-xl border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => setExtras((v) => !v)}
                aria-expanded={extras}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface2/50 transition-colors"
              >
                <span className="text-sm font-semibold text-txt">Senha e nascimento</span>
                <span className="text-xs text-txt-faint">já preenchidos</span>
                <span className="ml-auto hidden sm:inline text-xs text-txt-dim font-mono tabular-nums truncate">
                  {'•'.repeat(8)} · {p2(nasc.dia)}/{p2(nasc.mes)}/{nasc.ano} · {idade} anos
                </span>
                <ChevronDown
                  className={cn('h-4 w-4 text-txt-dim shrink-0 transition-transform ml-auto sm:ml-0', extras && 'rotate-180')}
                />
              </button>
              <AnimatePresence initial={false}>
                {extras && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22, ease: 'easeOut' }}
                    className="overflow-hidden"
                  >
                    <div className="grid gap-4 sm:grid-cols-2 px-4 pt-4 pb-4 border-t border-border">
                      <Campo
                        label="Senha"
                        acao={
                          <button
                            type="button"
                            onClick={() => setSenha(gerarSenha())}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary-light hover:text-primary"
                          >
                            <WandSparkles className="h-3 w-3" />
                            gerar
                          </button>
                        }
                        dica="Fica salva neste navegador e já vem na próxima conta."
                      >
                        <CampoSenha value={senha} onChange={setSenha} visivelInicial />
                      </Campo>
                      <Campo
                        label="Data de nascimento"
                        acao={
                          <button
                            type="button"
                            onClick={() => setNasc(gerarNasc())}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary-light hover:text-primary"
                          >
                            <Shuffle className="h-3 w-3" />
                            sortear
                          </button>
                        }
                        dica={
                          <span className="tabular-nums">
                            {idade} anos · o sorteio fica entre 20 e 34
                          </span>
                        }
                      >
                        <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)_minmax(0,1.1fr)] gap-2">
                          <Select value={nasc.dia} onChange={(e) => setN({ dia: Number(e.target.value) })} aria-label="Dia">
                            {Array.from({ length: maxDia }, (_, i) => i + 1).map((d) => (
                              <option key={d} value={d}>
                                {p2(d)}
                              </option>
                            ))}
                          </Select>
                          <Select value={nasc.mes} onChange={(e) => setN({ mes: Number(e.target.value) })} aria-label="Mês">
                            {MESES.map((m, i) => (
                              <option key={m} value={i + 1}>
                                {m}
                              </option>
                            ))}
                          </Select>
                          <Select value={nasc.ano} onChange={(e) => setN({ ano: Number(e.target.value) })} aria-label="Ano">
                            {anos.map((a) => (
                              <option key={a} value={a}>
                                {a}
                              </option>
                            ))}
                          </Select>
                        </div>
                      </Campo>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

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
              <p className="flex items-start gap-2 text-xs text-txt-faint leading-relaxed flex-1">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                O bot para no código do e-mail. Abre a execução pra acompanhar o log.
              </p>
              <Button size="lg" onClick={criar} disabled={faltando || criando} className="sm:min-w-[220px]">
                {criando ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                {criando ? 'Disparando…' : 'Criar até o código'}
              </Button>
            </div>
          </Section>

          {/* ── contas de Gmail ── */}
          <Section
            title={`Contas de Gmail (${gmails.length})`}
            subtitle="De onde sai o +alias e o código de confirmação."
            className="xl:col-start-2 xl:row-start-2"
          >
            {gmailsQ.isError ? (
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-danger">Não consegui ler os Gmails.</span>
                <Button variant="subtle" size="sm" onClick={() => gmailsQ.refetch()}>
                  Tentar de novo
                </Button>
              </div>
            ) : gmails.length === 0 && !gmailsQ.isLoading ? (
              <p className="text-sm text-txt-dim leading-relaxed">
                Nenhuma. Adicione o Gmail + a senha de app (não a senha normal; precisa de 2FA + IMAP ligados).
              </p>
            ) : (
              <ul className="divide-y divide-border -mx-1">
                <AnimatePresence initial={false}>
                  {gmails.map((g) => (
                    <motion.li
                      key={g.user}
                      layout
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, height: 0 }}
                      className="flex items-center gap-2.5 px-1 py-2"
                    >
                      <Mail className="h-4 w-4 text-txt-faint shrink-0" />
                      <span className="flex-1 min-w-0 truncate text-sm font-semibold text-txt">{g.user}</span>
                      {baseEmail === g.user && (
                        <span className="text-[10px] font-bold uppercase tracking-wide text-primary-light">base</span>
                      )}
                      <IconBtn title="Remover Gmail" tom="danger" onClick={() => remDlg.abrir(g.user)}>
                        <Trash2 className="h-4 w-4" />
                      </IconBtn>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}

            <form
              className="mt-4 pt-4 border-t border-border space-y-2.5"
              autoComplete="off"
              onSubmit={(ev) => {
                ev.preventDefault()
                addGmail()
              }}
            >
              <Label>Adicionar conta de Gmail</Label>
              <Input
                type="email"
                value={novoEmail}
                onChange={(e) => {
                  setNovoEmail(e.target.value)
                  setMsgGmail('')
                }}
                placeholder="seuemail@gmail.com"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
              />
              <CampoSenha
                value={novoPw}
                onChange={(v) => {
                  setNovoPw(v)
                  setMsgGmail('')
                }}
                placeholder="senha de app (16 letras)"
              />
              {!!msgGmail && <p className="text-sm text-danger">{msgGmail}</p>}
              <Button type="submit" variant="subtle" className="w-full" loading={addingGmail}>
                <Plus className="h-4 w-4" />
                Adicionar Gmail
              </Button>
              <p className="text-[11.5px] text-txt-faint leading-relaxed">
                Senha de app: gere em{' '}
                <a
                  href="https://myaccount.google.com/apppasswords"
                  target="_blank"
                  rel="noreferrer"
                  className="text-txt-dim underline decoration-border underline-offset-2 hover:text-primary-light"
                >
                  myaccount.google.com/apppasswords
                </a>{' '}
                (com 2FA ligado) e ligue o IMAP no Gmail.
              </p>
            </form>
          </Section>
        </div>
      </PageBody>

      <ConfirmModal
        open={remDlg.aberto}
        onClose={remDlg.fechar}
        onConfirm={() => remDlg.dados && removerGmail(remDlg.dados)}
        title="Remover Gmail"
        message={`Remover a conta de Gmail ${remDlg.dados ?? ''}?`}
        confirmText="Remover"
        danger
      />
    </>
  )
}
