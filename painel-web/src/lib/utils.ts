import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// twMerge: a classe passada por quem usa o componente VENCE a padrão dele (ex. a cor do Badge)
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Conta de uma run pra exibir: "@usuario", mas run em lote vem "3 contas" (sem @). */
export function arroba(conta: string): string {
  return conta.startsWith('@') || /\d+ contas?$/.test(conta) ? conta : `@${conta}`
}

/** "há 3 min", "há 2 h", "há 4 dias" a partir de um epoch em SEGUNDOS. */
export function tempoRelativo(epochS?: number | null): string {
  if (!epochS) return '—'
  const d = Math.max(0, Date.now() / 1000 - epochS)
  if (d < 60) return 'agora'
  if (d < 3600) return `há ${Math.floor(d / 60)} min`
  if (d < 86400) return `há ${Math.floor(d / 3600)} h`
  const dias = Math.floor(d / 86400)
  return dias === 1 ? 'há 1 dia' : `há ${dias} dias`
}

/** Duração em segundos → "1h 05min", "12min", "40s". */
export function fmtDuracao(s?: number | null): string {
  if (s == null || !isFinite(s)) return '—'
  s = Math.max(0, Math.round(s))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), seg = s % 60
  if (h) return `${h}h ${String(m).padStart(2, '0')}min`
  if (m) return `${m}min`
  return `${seg}s`
}

/** Epoch em segundos → "27/10 21:34". */
export function fmtDataHora(epochS?: number | null): string {
  if (!epochS) return '—'
  const d = new Date(epochS * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Cor (classe Tailwind de texto) por status de run — mesma regra do statusCor do app. */
export const STATUS_COR: Record<string, string> = {
  iniciando: 'text-warn',
  rodando: 'text-primary',
  finalizado: 'text-ok',
  parado: 'text-txt-dim',
  erro: 'text-danger',
}
export const STATUS_BG: Record<string, string> = {
  iniciando: 'bg-warn/15 text-warn',
  rodando: 'bg-primary/15 text-primary-light',
  finalizado: 'bg-ok/15 text-ok',
  parado: 'bg-surface2 text-txt-dim',
  erro: 'bg-danger/15 text-danger',
}
