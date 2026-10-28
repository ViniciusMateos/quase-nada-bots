// Log inteligente da tela da Run — porta do RunScreen do app: detecta arte de terminal e linhas
// especiais e vira UI. Marcadores ([progress], [espera], [saldo]) NUNCA aparecem crus: viram barra,
// contagem e chips. "[conta] @user i/N" abre um bloco por conta que dobra/desdobra.
import type { Espera, Progresso } from '@/lib/api'

export type Parsed =
  | { tipo: 'oculta' }
  | { tipo: 'conta'; user: string; pos: string }
  | { tipo: 'divisor' }
  | { tipo: 'titulo'; texto: string }
  | { tipo: 'kv'; label: string; valor: string }
  | { tipo: 'dmhead'; user: string; enviada: boolean }
  | { tipo: 'mensagem'; texto: string }
  | { tipo: 'sleep'; texto: string }
  | { tipo: 'texto'; hora: string; texto: string; cor: string; erro: boolean }

// cor do evento (classe Tailwind) — mesma regra do corEvento do app
function corEvento(nivel: string, low: string): { cor: string; erro: boolean } {
  if (nivel === 'ERROR' || low.includes('bloque') || low.includes('⛔') || low.includes('checkpoint')) {
    return { cor: 'text-danger font-bold', erro: true }
  }
  if (low.includes('seguiu @') || low.includes('+ seguiu')) return { cor: 'text-ok', erro: false }
  if (low.includes('pedido')) return { cor: 'text-primary-light', erro: false }
  if (low.includes('pulou') || low.includes('pulad') || low.includes('já seguid') || low.includes('já seguia')) {
    return { cor: 'text-txt-faint', erro: false }
  }
  if (nivel === 'WARNING' || nivel === 'WARN' || low.includes('transitório')) return { cor: 'text-warn', erro: false }
  return { cor: 'text-[#D8D8D8]', erro: false }
}

// linhas TÉCNICAS (id do job/run, serial do device, fila do backend) — não interessam no log
// (pedido do Vinicius 20/10) + os MARCADORES, que viram barra/contagem/chips em vez de texto cru
const TECNICAS = [
  /^\[backend\]/, /^=== JOB /, /^device conectado/, /^não conectou em /, /^ação=/,
  /^aviso: não consegui garantir o IG aberto/,
  /^\[progress\]/, /^\[espera\]/, /^\[espera-fim\]/,
]

export function ehMarcadorOculto(raw: string): boolean {
  return TECNICAS.some((re) => re.test(raw)) || raw.includes('[saldo]')
}

export function parseLinha(raw: string): Parsed {
  if (ehMarcadorOculto(raw)) return { tipo: 'oculta' }
  // conta rodando agora (marcador do agente "[conta] user i/N") → faixa em destaque
  const ct = raw.match(/^\[conta\]\s+@?([A-Za-z0-9._]+)\s*(\d+\/\d+)?/)
  if (ct) return { tipo: 'conta', user: ct[1], pos: ct[2] ?? '' }
  // fecho do job: "=== SALDO: X follows, Y posts — resumo ===" → só o resumo legível
  const saldo = raw.match(/^=== SALDO:\s*(\d+) follows, (\d+) posts\s*[—-]\s*(.*?)\s*===$/)
  if (saldo) {
    const [, f, ps, resumo] = saldo
    const nums = f !== '0' || ps !== '0' ? `${f} follows · ${ps} posts` : ''
    return { tipo: 'titulo', texto: [nums, resumo].filter(Boolean).join('  —  ') || 'fim' }
  }
  const fim = raw.match(/^===\s*(.+?)\s*===$/) // "=== LOTE FIM: … ===" etc.
  if (fim) return { tipo: 'titulo', texto: fim[1] }
  const m = raw.match(/^\d{4}-\d{2}-\d{2}\s+(\d{2}:\d{2}:\d{2})\s+(\w+)\s+([\s\S]*)$/)
  const hora = m ? m[1] : ''
  const nivel = m ? m[2] : ''
  const resto = (m ? m[3] : raw).trimEnd()

  // separadores (───── / ═════) e cabeçalhos com traços (─── TÍTULO ───), sem pegar a árvore ┌─│└
  if (/[─—═]{3,}/.test(resto) || /-{5,}/.test(resto)) {
    const limpo = resto.replace(/[─—═]+/g, ' ').replace(/-{3,}/g, ' ').replace(/\s{2,}/g, ' ').trim()
    return limpo ? { tipo: 'titulo', texto: limpo } : { tipo: 'divisor' }
  }
  const wrap = resto.match(/^[─—]\s*(.+?)\s*[─—]$/) // — Título —
  if (wrap) return { tipo: 'titulo', texto: wrap[1].trim() }

  // ── DM: organiza o bloco em vez de amontoar ──
  const dm = resto.match(/DM\s*→\s*@?([A-Za-z0-9._]+)/)
  if (dm) return { tipo: 'dmhead', user: dm[1], enviada: /enviada/i.test(resto) }
  // corpo da mensagem: linha indentada "│      <texto>" → preview discreto
  const msg = resto.match(/^│\s{3,}(.+)$/)
  if (msg) {
    const limpa = msg[1].replace(/⏎/g, ' ').replace(/\s{2,}/g, ' ').trim()
    return { tipo: 'mensagem', texto: limpa }
  }
  // pausas humanas ("dormiria/dormindo 3s (abrindo perfil)") = ruído de ritmo → bem discreto
  const soneca = resto.match(/dormi(?:ria|ndo)\s+(\S+)\s*\(([^)]+)\)/i)
  if (soneca) return { tipo: 'sleep', texto: `${soneca[2].trim()}  ·  ${soneca[1].trim()}` }

  // "label ..... valor" → linha com valor à direita
  const kv = resto.match(/^(.+?)\s*[.·]{2,}\s*(.+)$/)
  if (kv) return { tipo: 'kv', label: kv[1].trim(), valor: kv[2].trim() }

  const { cor, erro } = corEvento(nivel, resto.toLowerCase())
  return { tipo: 'texto', hora, texto: resto, cor, erro }
}

// ── SEÇÕES POR CONTA: cada "[conta] @user" abre um bloco com as linhas daquela conta embaixo. O que
// vem antes da 1ª conta (abertura) e depois do fecho do lote (═════ / === SALDO) fica solto.
const RE_CONTA = /^\[conta\]\s+@?([A-Za-z0-9._]+)\s*(\d+\/\d+)?/
const RE_FECHO = /^═{3,}\s*$|^=== SALDO:/

export type SecaoConta = {
  tipo: 'conta'; key: string; user: string; pos: string; idx: number[]
  visiveis: number; erro: boolean
}
export type Secao = { tipo: 'solta'; key: string; idx: number[] } | SecaoConta

export function agrupar(linhas: string[]): Secao[] {
  const out: Secao[] = []
  let conta: SecaoConta | null = null
  let fechou = false
  linhas.forEach((raw, i) => {
    const ct = fechou ? null : raw.match(RE_CONTA)
    if (ct) {
      // a mesma conta marcada de novo (ex: o agente reemite no meio) continua no mesmo bloco
      if (conta && conta.user === ct[1]) {
        if (ct[2]) conta.pos = ct[2]
        return
      }
      conta = { tipo: 'conta', key: `${ct[1]}#${i}`, user: ct[1], pos: ct[2] ?? '', idx: [], visiveis: 0, erro: false }
      out.push(conta)
      return
    }
    if (conta && RE_FECHO.test(raw)) {
      fechou = true
      conta = null
    }
    if (conta) {
      const p = parseLinha(raw)
      conta.idx.push(i)
      if (p.tipo !== 'oculta') conta.visiveis += 1
      if ((p.tipo === 'texto' && p.erro) || raw.includes('!!')) conta.erro = true
      return
    }
    const ult = out[out.length - 1]
    if (ult && ult.tipo === 'solta') ult.idx.push(i)
    else out.push({ tipo: 'solta', key: `s#${i}`, idx: [i] })
  })
  return out
}

// ── marcadores ───────────────────────────────────────────────────────────────

export function parseProgresso(txt: string): Progresso | null {
  const resto = txt.slice('[progress]'.length).trim()
  const m = resto.match(/^(\d+)\s+(\d+)\s*(.*)$/)
  if (!m) return null
  return { done: parseInt(m[1], 10), total: parseInt(m[2], 10), label: m[3].trim() }
}

export function parseEspera(txt: string): Espera | null {
  const resto = txt.slice('[espera]'.length).trim()
  const m = resto.match(/^(\d+(?:\.\d+)?)\s*(.*)$/)
  if (!m) return null
  const restam = Math.round(parseFloat(m[1]))
  return { ate: Date.now() / 1000 + restam, restam, motivo: m[2].trim() }
}

/** `[saldo] k=v k=v` (em qualquer lugar da linha) → {k: número|texto}. */
export function parseSaldo(linha: string): Record<string, number | string> | null {
  const i = linha.indexOf('[saldo]')
  if (i < 0) return null
  const d: Record<string, number | string> = {}
  for (const tok of linha.slice(i + '[saldo]'.length).split(/\s+/)) {
    const j = tok.indexOf('=')
    if (j <= 0) continue
    const k = tok.slice(0, j), v = tok.slice(j + 1)
    d[k] = /^-?\d+$/.test(v) ? parseInt(v, 10) : v
  }
  return Object.keys(d).length ? d : null
}

/** Última barra reportada no log (o getRun traz as linhas [progress] persistidas). */
export function ultimoProgresso(linhas: string[]): Progresso | null {
  for (let i = linhas.length - 1; i >= 0; i--) {
    if (linhas[i].startsWith('[progress]')) {
      const p = parseProgresso(linhas[i])
      if (p) return p
    }
  }
  return null
}

/** Último [saldo] do log. */
export function saldoDoLog(linhas: string[]): Record<string, number | string> | null {
  for (let i = linhas.length - 1; i >= 0; i--) {
    if (linhas[i].includes('[saldo]')) {
      const s = parseSaldo(linhas[i])
      if (s) return s
    }
  }
  return null
}

/** Conta da run pelo log ("Conta: @quasenadasegue3 (...)"), igual o backend detecta. */
export function contaDoLog(linhas: string[]): string | null {
  for (const l of linhas) {
    if (!l.includes('Conta:')) continue
    const m = l.match(/Conta:\s*@?([A-Za-z0-9._]+)/)
    if (m) return m[1]
  }
  return null
}
