// O LOG da tela da Run: linhas parseadas (igual o app), blocos por conta que dobram/desdobram,
// auto-scroll pro fim (com botão "ir pro fim" quando você rolou pra cima), busca, copiar e baixar.
import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowDown,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ChevronsDownUp,
  ChevronsUpDown,
  CircleAlert,
  CircleUser,
  Copy,
  Download,
  Search,
  Send,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button, Skeleton } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { agrupar, parseLinha, type SecaoConta } from './logParse'

async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    // fallback (http sem permissão de clipboard)
    try {
      const ta = document.createElement('textarea')
      ta.value = texto
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}

const LogLinha = memo(function LogLinha({ raw }: { raw: string }) {
  const toast = useToast()
  const p = parseLinha(raw)
  if (p.tipo === 'oculta') return null
  let el
  if (p.tipo === 'conta') {
    // (os [conta] normalmente viram bloco; este é o caso solto — depois do fecho do lote / na busca)
    el = (
      <div className="flex items-center gap-2 mt-2 mb-1 rounded-lg border-l-[3px] border-primary bg-surface2 px-2.5 py-1.5 font-sans">
        <CircleUser className="h-4 w-4 text-primary" />
        <span className="text-sm font-extrabold text-txt">@{p.user}</span>
        {p.pos && <span className="ml-auto text-xs font-bold text-txt-dim tabular-nums">{p.pos}</span>}
      </div>
    )
  } else if (p.tipo === 'divisor') {
    el = (
      <div className="py-2">
        <div className="h-px bg-border" />
      </div>
    )
  } else if (p.tipo === 'titulo') {
    el = <p className="font-sans text-[13px] font-bold text-primary-light mt-2.5 mb-0.5 tracking-wide">{p.texto}</p>
  } else if (p.tipo === 'kv') {
    el = (
      <div className="flex items-baseline justify-between gap-4 py-0.5 font-sans text-[13px]">
        <span className="text-txt-dim min-w-0">{p.label}</span>
        <span className="text-txt font-semibold text-right">{p.valor}</span>
      </div>
    )
  } else if (p.tipo === 'dmhead') {
    el = (
      <div className="flex items-center gap-1.5 mt-2.5 mb-px font-sans">
        <Send className="h-3.5 w-3.5 text-amarelo" />
        <span className="text-[13.5px] font-bold text-txt">@{p.user}</span>
        {p.enviada && <CheckCheck className="h-3.5 w-3.5 text-ok" />}
      </div>
    )
  } else if (p.tipo === 'mensagem') {
    el = <p className="text-[11.5px] leading-4 italic text-txt-dim/80 pl-5 line-clamp-2">{p.texto}</p>
  } else if (p.tipo === 'sleep') {
    el = <p className="text-[11px] italic text-[#5A5A5A] pl-5 py-px truncate font-sans">{p.texto}</p>
  } else {
    el = (
      <p className={cn('text-[12.5px] leading-[19px] whitespace-pre-wrap break-words', p.cor)}>
        {p.hora && <span className="text-[#5A5A5A] text-[11px] mr-2 select-none">{p.hora}</span>}
        {p.texto}
      </p>
    )
  }
  return (
    <div className="group/linha relative animate-fade-in rounded hover:bg-white/[0.03] pr-7">
      {el}
      <button
        type="button"
        title="Copiar linha"
        onClick={async () => ((await copiarTexto(raw)) ? toast.ok('linha copiada') : toast.error('Não deu pra copiar.'))}
        className="absolute right-0.5 top-0.5 hidden group-hover/linha:flex h-5 w-5 items-center justify-center rounded text-txt-faint hover:text-txt hover:bg-surface2"
      >
        <Copy className="h-3 w-3" />
      </button>
    </div>
  )
})

function BlocoConta({
  s,
  aberta,
  agora,
  linhas,
  onToggle,
  onCopiar,
}: {
  s: SecaoConta
  aberta: boolean
  agora: boolean
  linhas: string[]
  onToggle: () => void
  onCopiar: (t: string, msg: string) => void
}) {
  return (
    <div className={cn('mt-3', aberta ? 'mb-1' : 'mb-0')}>
      <div
        className={cn(
          'group/conta flex items-center gap-2 rounded-lg border-l-[3px] border-primary bg-surface2 pl-2.5 pr-2 py-2 font-sans',
          !aberta && 'opacity-85 hover:opacity-100',
        )}
      >
        <button type="button" onClick={onToggle} className="flex items-center gap-2 min-w-0 flex-1 text-left">
          {aberta ? <ChevronDown className="h-4 w-4 text-txt-faint shrink-0" /> : <ChevronRight className="h-4 w-4 text-txt-faint shrink-0" />}
          <CircleUser className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-extrabold text-txt truncate">@{s.user}</span>
          {s.erro && <CircleAlert className="h-4 w-4 text-danger shrink-0" />}
          {agora && (
            <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-primary animate-pulso shrink-0">agora</span>
          )}
          <span className="flex-1" />
          {!aberta && (
            <span className="text-[11px] font-semibold text-txt-faint tabular-nums shrink-0">
              {s.visiveis} {s.visiveis === 1 ? 'linha' : 'linhas'}
            </span>
          )}
          {s.pos && <span className="text-xs font-bold text-txt-dim tabular-nums shrink-0">{s.pos}</span>}
        </button>
        <button
          type="button"
          title={`Copiar o log da @${s.user}`}
          onClick={() => onCopiar([`[conta] @${s.user}`, ...s.idx.map((i) => linhas[i])].join('\n'), `log da @${s.user} copiado`)}
          className="hidden group-hover/conta:flex h-6 w-6 items-center justify-center rounded text-txt-faint hover:text-txt hover:bg-border shrink-0"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {aberta && s.idx.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="ml-2 pl-3 border-l border-border mt-1 mb-1">
              {s.idx.map((i) => (
                <LogLinha key={i} raw={linhas[i]} />
              ))}
            </div>
            <button
              type="button"
              onClick={onToggle}
              className="ml-2 mb-2 flex w-full items-center justify-center gap-1 py-1 text-[11px] font-bold text-txt-faint hover:text-txt-dim font-sans"
            >
              <ChevronUp className="h-3.5 w-3.5" />
              fechar @{s.user}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// larguras do skeleton — irregulares de propósito pra lembrar log de verdade
const LARGURAS = ['38%', '72%', '55%', '66%', '44%', '80%', '50%', '63%', '35%', '70%', '58%', '48%']

export function LogView({
  runId,
  linhas,
  rodando,
  conectando,
  className,
}: {
  runId: string
  linhas: string[]
  rodando: boolean
  conectando: boolean
  className?: string
}) {
  const toast = useToast()
  const boxRef = useRef<HTMLDivElement>(null)
  const noFimRef = useRef(true)
  const [longe, setLonge] = useState(false)
  const [busca, setBusca] = useState('')
  // blocos de conta: o que você abriu/fechou na mão (o resto segue o padrão — ver abertaPadrao)
  const [abertos, setAbertos] = useState<Record<string, boolean>>({})

  const secoes = useMemo(() => agrupar(linhas), [linhas])
  const contas = useMemo(() => secoes.filter((s): s is SecaoConta => s.tipo === 'conta'), [secoes])
  const ultimaConta = contas.length ? contas[contas.length - 1].key : null
  // padrão: rodando → só a conta da vez aberta (as anteriores vão fechando sozinhas); terminada →
  // tudo fechado com o resumo à mostra (uma conta só = aberta)
  const abertaPadrao = (s: SecaoConta) => contas.length === 1 || (rodando && s.key === ultimaConta)
  const estaAberta = (s: SecaoConta) => abertos[s.key] ?? abertaPadrao(s)
  const todasAbertas = contas.length > 0 && contas.every(estaAberta)
  const alternar = (s: SecaoConta) => setAbertos((prev) => ({ ...prev, [s.key]: !(prev[s.key] ?? abertaPadrao(s)) }))
  const abrirTodas = (v: boolean) => setAbertos(Object.fromEntries(contas.map((s) => [s.key, v])))

  // busca: lista CORRIDA só com as linhas visíveis que batem (sem os blocos)
  const q = busca.trim().toLowerCase()
  const achadas = useMemo(() => {
    if (!q) return null
    const out: number[] = []
    linhas.forEach((raw, i) => {
      if (!raw.toLowerCase().includes(q)) return
      const t = parseLinha(raw).tipo
      if (t !== 'oculta') out.push(i)
    })
    return out
  }, [q, linhas])

  const visiveis = useMemo(() => linhas.reduce((n, l) => n + (parseLinha(l).tipo === 'oculta' ? 0 : 1), 0), [linhas])

  // gruda no fim enquanto você está no fim (log novo chegando); se rolou pra cima, respeita
  useLayoutEffect(() => {
    const el = boxRef.current
    if (el && noFimRef.current) el.scrollTop = el.scrollHeight
  }, [linhas, achadas, abertos])

  function aoRolar() {
    const el = boxRef.current
    if (!el) return
    const perto = el.scrollHeight - el.scrollTop - el.clientHeight < 60
    noFimRef.current = perto
    setLonge((atual) => (atual === !perto ? atual : !perto))
  }
  function irAoFim() {
    const el = boxRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    noFimRef.current = true
    setLonge(false)
  }

  async function copiar(texto: string, msg: string) {
    if (await copiarTexto(texto)) toast.ok(msg)
    else toast.error('Não deu pra copiar.')
  }
  function baixar() {
    const blob = new Blob([linhas.join('\n') + '\n'], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${runId}.log`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className={cn('flex flex-col min-h-0', className)}>
      {/* barra de ferramentas */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative flex-1 min-w-[180px] max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-txt-faint" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar no log"
            className="w-full h-9 pl-9 pr-8 rounded-lg bg-surface2 border border-border text-sm text-txt placeholder:text-txt-faint focus:border-primary transition-colors"
          />
          {busca && (
            <button
              type="button"
              onClick={() => setBusca('')}
              title="Limpar busca"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center rounded text-txt-faint hover:text-txt"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {achadas && (
          <span className="text-xs text-txt-dim tabular-nums">
            {achadas.length} {achadas.length === 1 ? 'linha' : 'linhas'}
          </span>
        )}
        <div className="flex-1" />
        {contas.length > 1 && !achadas && (
          <Button variant="ghost" size="sm" onClick={() => abrirTodas(!todasAbertas)}>
            {todasAbertas ? <ChevronsDownUp className="h-3.5 w-3.5" /> : <ChevronsUpDown className="h-3.5 w-3.5" />}
            {todasAbertas ? 'Fechar contas' : 'Abrir contas'}
          </Button>
        )}
        <Button variant="ghost" size="sm" disabled={!linhas.length} onClick={() => copiar(linhas.join('\n'), 'log copiado')}>
          <Copy className="h-3.5 w-3.5" />
          Copiar
        </Button>
        <Button variant="ghost" size="sm" disabled={!linhas.length} onClick={baixar}>
          <Download className="h-3.5 w-3.5" />
          Baixar
        </Button>
      </div>

      {/* caixa do log */}
      <div className="relative flex-1 min-h-0">
        <div
          ref={boxRef}
          onScroll={aoRolar}
          className="h-full overflow-y-auto rounded-xl border border-border bg-[#0A0A0A] px-3.5 py-3 font-mono"
        >
          {conectando && linhas.length === 0 ? (
            <div className="space-y-2.5 py-1">
              {LARGURAS.map((w, i) => (
                <div key={i} style={{ width: w }}>
                  <Skeleton className="h-3" />
                </div>
              ))}
            </div>
          ) : visiveis === 0 ? (
            <p className="py-10 text-center text-sm text-txt-faint font-sans">
              {rodando ? 'Esperando o bot logar alguma coisa…' : 'Sem log pra essa execução.'}
            </p>
          ) : achadas ? (
            achadas.length ? (
              achadas.map((i) => <LogLinha key={i} raw={linhas[i]} />)
            ) : (
              <p className="py-10 text-center text-sm text-txt-faint font-sans">Nada no log com "{busca.trim()}".</p>
            )
          ) : (
            secoes.map((s) =>
              s.tipo === 'conta' ? (
                <BlocoConta
                  key={s.key}
                  s={s}
                  linhas={linhas}
                  aberta={estaAberta(s)}
                  agora={rodando && s.key === ultimaConta}
                  onToggle={() => alternar(s)}
                  onCopiar={copiar}
                />
              ) : (
                <div key={s.key}>
                  {s.idx.map((i) => (
                    <LogLinha key={i} raw={linhas[i]} />
                  ))}
                </div>
              ),
            )
          )}
          {rodando && visiveis > 0 && !achadas && (
            <div className="flex items-center gap-1.5 pt-2 text-txt-faint">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulso" />
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulso [animation-delay:200ms]" />
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulso [animation-delay:400ms]" />
            </div>
          )}
        </div>

        <AnimatePresence>
          {longe && (
            <motion.button
              type="button"
              onClick={irAoFim}
              initial={{ opacity: 0, y: 12, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 420, damping: 30 }}
              className="absolute bottom-4 right-4 flex items-center gap-1.5 h-9 pl-3 pr-3.5 rounded-full bg-primary text-white text-xs font-bold shadow-glow hover:bg-primary-light"
            >
              <ArrowDown className="h-4 w-4" />
              Ir pro fim
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
