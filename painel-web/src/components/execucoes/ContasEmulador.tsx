// Contas do emulador com o estado de cada uma (mesmas regras/rótulos da aba Emulador do app) +
// o "Verificar e sincronizar": sincroniza app ↔ emulador e depois enfileira a verificação profunda.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { ShieldCheck, Users } from 'lucide-react'
import { api, locaisDe } from '@/lib/api'
import { cmpTexto } from '@/lib/ordenar'
import { QK, useContas, useEmulador } from '@/lib/queries'
import { CONTA_BRECHO, ehUsername, sincronizarEmulador, type ResultadoSync } from '@/lib/syncEmulador'
import { cn } from '@/lib/utils'
import { Button, Section, Skeleton } from '@/components/ui'
import { Modal } from '@/components/Modal'

type Tom = 'ok' | 'danger' | 'marca' | 'fraco' | 'texto'
const COR_TXT: Record<Tom, string> = {
  ok: 'text-ok',
  danger: 'text-danger',
  marca: 'text-primary-light',
  fraco: 'text-txt-faint',
  texto: 'text-txt',
}
const COR_DOT: Record<Tom, string> = {
  ok: 'bg-ok',
  danger: 'bg-danger',
  marca: 'bg-primary',
  fraco: 'bg-txt-faint',
  texto: 'bg-txt',
}

function LinhaConta({ nome, ativa, txt, tom, pulsando, i }: { nome: string; ativa?: boolean; txt: string; tom: Tom; pulsando?: boolean; i: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(i, 12) * 0.03 }}
      className="flex items-center gap-2.5 py-1.5 min-w-0"
    >
      <span className={cn('h-2 w-2 rounded-full shrink-0', COR_DOT[tom], pulsando && 'animate-pulso')} />
      <span className="text-sm font-semibold text-txt truncate flex-1 min-w-0">
        @{nome}
        {ativa && <span className="ml-1.5 text-[11px] font-semibold text-primary-light">· ativa</span>}
      </span>
      <span className={cn('text-[11px] font-semibold shrink-0', COR_TXT[tom])}>{txt}</span>
    </motion.div>
  )
}

export function ContasEmulador() {
  const qc = useQueryClient()
  const { data: status, isError: semStatus } = useEmulador()
  const { data: contas } = useContas()
  const [sincronizando, setSincronizando] = useState(false)
  const [resultado, setResultado] = useState<string[] | null>(null)

  const verificando = !!status?.verificando_sessoes || sincronizando

  // enquanto verifica, puxa o status mais rápido (o app faz 5s nessa tela; o hook geral é 10s)
  useEffect(() => {
    if (!verificando) return
    const id = setInterval(() => qc.invalidateQueries({ queryKey: QK.emulador }), 4000)
    return () => clearInterval(id)
  }, [verificando, qc])

  // VERIFICAR = sincroniza com o emulador E verifica a fundo. Primeiro a sincronização (conta do
  // emulador que o app não tem entra no app; conta do app fora do emulador vai pra fila de login —
  // o brechó no emulador dele). Depois enfileira a verificação profunda — a fila é uma por vez,
  // então ela roda DEPOIS dos logins e já pega as contas novas.
  async function verificar() {
    if (status?.verificando_sessoes || sincronizando) return
    setSincronizando(true)
    let r: ResultadoSync | null = null
    try { r = await sincronizarEmulador() } catch { /* segue pra verificação mesmo assim */ }
    try { await api.verificarSessoes() } catch { /* backend pode não expor ainda */ }
    setSincronizando(false)
    qc.invalidateQueries({ queryKey: QK.emulador })
    qc.invalidateQueries({ queryKey: QK.contas })
    qc.invalidateQueries({ queryKey: QK.runs })
    if (r && (r.adicionadas.length || r.logando.length || r.semSenha.length || r.senhaIncorreta.length)) {
      const partes: string[] = []
      const arr = (l: string[]) => l.map((u) => '@' + u).join(', ')
      if (r.adicionadas.length) partes.push(`Entraram no app: ${arr(r.adicionadas)}`)
      if (r.logando.length) partes.push(`Logando: ${arr(r.logando)}`)
      if (r.semSenha.length) partes.push(`Sem senha salva (edite a conta e ponha a senha): ${arr(r.semSenha)}`)
      if (r.senhaIncorreta.length) partes.push(`Senha incorreta (o Instagram recusou; edite a conta e corrija): ${arr(r.senhaIncorreta)}`)
      setResultado(partes)
    }
  }

  // TODAS as contas marcadas pro emulador (+ as logadas lá que ainda não estão no app), cada uma
  // com o estado: sessão ok / bloqueada / não sincronizada (fora do emulador)…
  const logadas = new Set((status?.contas_logadas ?? []).map((u) => u.toLowerCase()))
  const porLabel = new Map((contas ?? []).map((a) => [(a.label || '').toLowerCase(), a]))
  const nomesEmu = new Set<string>()
  for (const a of contas ?? []) if (locaisDe(a).includes('emulador') && a.label) nomesEmu.add(a.label)
  for (const u of status?.contas_logadas ?? []) {
    const a = porLabel.get(u.toLowerCase())
    if (ehUsername(u) && (!a || locaisDe(a).includes('emulador'))) nomesEmu.add(u)
  }
  const contasEmu = [...nomesEmu].filter((u) => u.toLowerCase() !== CONTA_BRECHO).sort(cmpTexto)
  // PRINCIPAL = a conta do brechó (emulador próprio, desligado): o estado é o último que os jobs
  // dela reportaram; AUXILIARES = as outras (emulador das segue)
  const temBrecho = (contas ?? []).some((a) => (a.label || '').toLowerCase() === CONTA_BRECHO)
  const stBrecho = status?.sessoes?.[CONTA_BRECHO]
  const brechoTxt = stBrecho === 'ok' ? 'logada' : stBrecho === 'senha_incorreta' ? 'senha incorreta'
    : stBrecho === 'bloqueada' ? 'bloqueada' : 'não sincronizada'
  const brechoTom: Tom = stBrecho === 'ok' ? 'ok' : stBrecho === 'senha_incorreta' || stBrecho === 'bloqueada' ? 'danger' : 'marca'

  const carregando = (status === undefined && !semStatus) || contas === undefined
  const nOk = contasEmu.filter((u) => logadas.has(u.toLowerCase()) && status?.sessoes?.[u] === 'ok').length

  return (
    <Section
      title="Contas"
      subtitle={!carregando && contasEmu.length ? `${nOk} de ${contasEmu.length} auxiliares com sessão ok` : undefined}
      action={
        <Link to="/contas" className="text-xs font-semibold text-txt-dim hover:text-txt transition-colors">
          gerenciar
        </Link>
      }
    >
      <Button
        variant={verificando ? 'subtle' : 'primary'}
        size="sm"
        className="w-full mb-3"
        onClick={verificar}
        disabled={verificando || semStatus}
        title={semStatus ? 'Sem status do PC agora' : undefined}
      >
        <ShieldCheck className={cn('h-3.5 w-3.5', verificando && 'animate-pulso')} />
        {sincronizando ? 'Sincronizando…' : verificando ? 'Verificando…' : 'Verificar e sincronizar'}
      </Button>

      {carregando ? (
        <div className="space-y-3 py-1">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-2.5">
              <Skeleton className="h-2 w-2 rounded-full" />
              <Skeleton className="h-3 w-32" />
              <div className="flex-1" />
              <Skeleton className="h-3 w-14" />
            </div>
          ))}
        </div>
      ) : contasEmu.length === 0 && !temBrecho ? (
        <div className="flex flex-col items-center text-center py-6">
          <Users className="h-8 w-8 text-txt-faint mb-2" />
          <p className="text-sm text-txt-dim max-w-[260px]">
            {semStatus
              ? 'Sem status do PC agora.'
              : 'Nenhuma conta ainda. Adicione em "gerenciar" — ao verificar, o agente loga sozinho.'}
          </p>
        </div>
      ) : (
        <div>
          {temBrecho && (
            <>
              <p className="text-[11px] font-bold uppercase tracking-wider text-txt-faint mt-1 mb-0.5">Principal</p>
              <LinhaConta nome={CONTA_BRECHO} txt={brechoTxt} tom={brechoTom} i={0} />
              <p className="text-[11px] text-txt-faint pl-[18px] -mt-0.5 mb-1">emulador próprio — liga só na hora do story</p>
            </>
          )}
          {contasEmu.length > 0 && (
            <p className="text-[11px] font-bold uppercase tracking-wider text-txt-faint mt-3 mb-0.5">Auxiliares</p>
          )}
          <div className={cn(contasEmu.length > 8 && 'sm:columns-2 lg:columns-1 2xl:columns-2 gap-6')}>
            {contasEmu.map((u, i) => {
              const st = status?.sessoes?.[u]
              const noDevice = logadas.has(u.toLowerCase())
              // enquanto verifica, as do device ficam "verificando" — nunca mostra o status velho
              const checando = verificando && noDevice
              let txt: string
              let tom: Tom
              if (!noDevice) { txt = 'não sincronizada'; tom = 'marca' } // fora do emulador: o verificar loga ela
              else if (checando) { txt = 'verificando…'; tom = 'fraco' }
              else if (st === 'ok') { txt = 'sessão ok'; tom = 'ok' }
              else if (st === 'bloqueada') { txt = 'bloqueada'; tom = 'danger' }
              else if (st === 'desconhecida') { txt = 'desconhecida'; tom = 'fraco' }
              else { txt = 'logada'; tom = 'texto' } // no device, ainda não verificada a fundo
              return (
                <div key={u} className="break-inside-avoid">
                  <LinhaConta nome={u} ativa={u === status?.conta_ativa} txt={txt} tom={tom} pulsando={checando} i={i + 1} />
                </div>
              )
            })}
          </div>
        </div>
      )}

      <p className="mt-3 pt-3 border-t border-border text-[11px] leading-relaxed text-txt-faint">
        "Verificar" já sincroniza: loga as contas que faltam (a do brechó no emulador dela), traz pro app as
        que já estavam logadas e entra em cada auxiliar pra confirmar quem está ok ou bloqueada.
      </p>

      <Modal
        open={!!resultado}
        onClose={() => setResultado(null)}
        title="Sincronizado"
        size="sm"
        footer={<Button onClick={() => setResultado(null)}>Ok</Button>}
      >
        <div className="space-y-3">
          {(resultado ?? []).map((p, i) => (
            <p key={i} className="text-sm text-txt-dim leading-relaxed">
              {p}
            </p>
          ))}
        </div>
      </Modal>
    </Section>
  )
}
