// Relógio do cronograma. O backend agenda em America/Sao_Paulo (cronograma.py `_TZ`): o PC está
// no Brasil, mas calcular no fuso certo deixa o "agora", a contagem e o casamento com as runs
// iguais aos do servidor mesmo se o navegador estiver em outro fuso.
const TZ = 'America/Sao_Paulo'

let fmtSP: Intl.DateTimeFormat | null = null
try {
  fmtSP = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  })
} catch {
  fmtSP = null   // navegador sem o fuso → cai na hora local (o PC é BR mesmo)
}

/** Um instante no relógio de Brasília: a data (YYYY-MM-DD) + os segundos desde a meia-noite. */
export type Instante = { data: string; seg: number }

const p2 = (n: number) => String(n).padStart(2, '0')

export function instanteSP(ms: number = Date.now()): Instante {
  const d = new Date(ms)
  if (fmtSP) {
    const p: Record<string, string> = {}
    for (const x of fmtSP.formatToParts(d)) p[x.type] = x.value
    const h = Number(p.hour) % 24
    return { data: `${p.year}-${p.month}-${p.day}`, seg: h * 3600 + Number(p.minute) * 60 + Number(p.second) }
  }
  return {
    data: `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`,
    seg: d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds(),
  }
}

/** "14:05" */
export const hhmm = (hora: number, min: number) => `${p2(hora)}:${p2(min)}`

/** Minuto do dia → "14:05" (aceita 1440 = "24:00"). */
export const minParaHhmm = (m: number) => hhmm(Math.floor(m / 60), Math.round(m % 60))

/** Segundos do dia → "14:05". */
export const segParaHhmm = (s: number) => hhmm(Math.floor(s / 3600) % 24, Math.floor((s % 3600) / 60))

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

/** "2026-10-28" → "Quarta, 28/10" (mesmo formato do app, com o dia por extenso). */
export function fmtDataPlano(iso: string): string {
  const [y, m, d] = (iso || '').split('-').map(Number)
  if (!y || !m || !d) return iso || '—'
  const dt = new Date(y, m - 1, d)
  const dia = DIAS[dt.getDay()]
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)}, ${p2(d)}/${p2(m)}`
}

/** Contagem regressiva grande: "01:23:05" (ou "23:05" com menos de 1h). */
export function fmtRelogio(s: number): string {
  s = Math.max(0, Math.floor(s))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), seg = s % 60
  return h ? `${p2(h)}:${p2(m)}:${p2(seg)}` : `${p2(m)}:${p2(seg)}`
}

/** "em 2h 10min" / "em 12 min" / "em menos de 1 min". */
export function fmtFalta(s: number): string {
  s = Math.max(0, Math.floor(s))
  if (s < 60) return 'em menos de 1 min'
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  if (!h) return `em ${m} min`
  return m ? `em ${h}h ${p2(m)}min` : `em ${h}h`
}

/** "há 12 min" / "há 1h 05min" (a partir de segundos passados). */
export function fmtPassou(s: number): string {
  s = Math.max(0, Math.floor(s))
  if (s < 60) return 'agora há pouco'
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  if (!h) return `há ${m} min`
  return m ? `há ${h}h ${p2(m)}min` : `há ${h}h`
}
