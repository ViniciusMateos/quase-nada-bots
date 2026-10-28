// Modelo da tela de Contas — mesma regra do ContasIgScreen do app: uma linha por @username,
// juntando a credencial salva no navegador, a conta do backend e o estado no emulador.
import { locaisDe, type Account, type EmuladorStatus } from '@/lib/api'
import type { Credencial } from '@/lib/credenciais'
import { CONTA_BRECHO, ehUsername } from '@/lib/syncEmulador'
import { cmpTexto } from '@/lib/ordenar'

export type SessaoEmul = NonNullable<EmuladorStatus['sessoes']>[string]
export type Secao = 'principal' | 'auxiliares' | 'fora'
export type Tom = 'ok' | 'warn' | 'danger' | 'neutro'

export type Entry = {
  usuario: string
  senha?: string
  id?: string
  criadaEm?: number
  pendente?: boolean
  grupos?: string[]
  // conta FORA do emulador das segue = a do brechó (o Story Repost roda no emulador próprio dela)
  propria?: boolean
  // conta que SAIU do emulador das segue (Remover Contas zera o "emulador" dos locais)
  fora?: boolean
  emulLogada?: boolean // logada no app do IG dentro do emulador?
  emulSessao?: SessaoEmul // última verificação
  secao: Secao
}

export const SECOES: { id: Secao; titulo: string; desc: string }[] = [
  { id: 'principal', titulo: 'Principal', desc: 'A conta do brechó — roda no emulador próprio dela.' },
  { id: 'auxiliares', titulo: 'Auxiliares', desc: 'As do emulador das segue.' },
  { id: 'fora', titulo: 'Fora do emulador', desc: 'Saíram pelo Remover contas. Logou de novo na mão, volta pra Auxiliares.' },
]

export function montarEntries(
  creds: Credencial[],
  contas: Account[],
  emul: string[],
  sess: Record<string, SessaoEmul>,
): Entry[] {
  const map = new Map<string, Entry>()
  // casa TUDO por @username (lowercase): a mesma conta vem da credencial, do backend e do emulador
  const ensure = (u: string): Entry => {
    const k = u.toLowerCase()
    let e = map.get(k)
    if (!e) {
      e = { usuario: u, secao: 'auxiliares' }
      map.set(k, e)
    }
    return e
  }
  for (const c of creds) ensure(c.usuario).senha = c.senha
  for (const a of contas) {
    const e = ensure(a.label)
    e.id = a.id
    e.criadaEm = a.criada_em
    e.pendente = a.pendente
    e.grupos = a.grupos
    // Principal = SÓ a do brechó (antes toda removida caía lá — segue25, 28/10)
    e.propria = (a.label || '').toLowerCase() === CONTA_BRECHO
    e.fora = !e.propria && !locaisDe(a).includes('emulador')
    if (e.propria) e.emulSessao = sess[a.label] ?? sess[CONTA_BRECHO] // emulador dela
  }
  for (const u of emul) {
    if (!ehUsername(u)) continue // título de tela/lixo lido pelo agente nunca vira conta
    const e = ensure(u)
    e.emulLogada = true
    e.emulSessao = sess[u]
  }
  const lista = [...map.values()].sort((a, b) => cmpTexto(a.usuario, b.usuario))
  for (const e of lista) {
    const principal = !!e.propria || e.usuario.toLowerCase() === CONTA_BRECHO
    e.secao = principal ? 'principal' : e.fora && !e.emulLogada ? 'fora' : 'auxiliares'
  }
  return lista
}

/** Selo do estado (mesmo texto/cor do app). */
export function estadoDe(e: Entry): { texto: string; tom: Tom } {
  if (e.propria) {
    if (e.emulSessao === 'ok') return { texto: 'logada · emulador do brechó', tom: 'ok' }
    if (e.emulSessao === 'senha_incorreta') return { texto: 'senha incorreta · edite e corrija', tom: 'danger' }
    return { texto: 'não sincronizada · emulador do brechó', tom: 'warn' }
  }
  if (e.emulLogada) {
    if (e.emulSessao === 'ok') return { texto: 'sessão ok', tom: 'ok' }
    if (e.emulSessao === 'bloqueada') return { texto: 'bloqueada', tom: 'danger' }
    return { texto: 'logada', tom: 'ok' }
  }
  return { texto: 'não sincronizada', tom: 'warn' }
}

/** Idade da conta (1ª conexão), igual o app. Pendente/sem id = sem idade. */
export function idadeDe(e: Entry): string | null {
  if (!e.id || e.pendente || !e.criadaEm) return null
  const dias = Math.floor((Date.now() / 1000 - e.criadaEm) / 86400)
  if (dias <= 0) return 'há menos de 1 dia'
  if (dias === 1) return 'há 1 dia'
  return `há ${dias} dias`
}
