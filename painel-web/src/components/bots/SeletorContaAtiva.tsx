// "Trocar conta" (SeletorConta do app): todas as contas com o status da sessão, separadas por grupo.
// Sessão viva → vira a ativa (api.ativarConta). Sem sessão / caiu → manda pra Contas reconectar.
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Check, Link2, Power } from 'lucide-react'
import { api } from '@/lib/api'
import type { Account, Grupo } from '@/lib/api'
import { erroMsg } from '@/lib/apiClient'
import { lerCredenciais } from '@/lib/credenciais'
import type { Credencial } from '@/lib/credenciais'
import { cmpTexto } from '@/lib/ordenar'
import { QK } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { Modal } from '@/components/Modal'
import { Skeleton, Spinner, StatusDot } from '@/components/ui'
import { useToast } from '@/components/Toast'

// uma linha = credencial local (user+senha) e/ou conta do backend, casadas por @user
type Entry = { usuario: string; id?: string; ativa?: boolean; sessaoOk?: boolean }

function secoes(entries: Entry[], grupos: Grupo[]): { titulo: string | null; itens: Entry[] }[] {
  const out: { titulo: string | null; itens: Entry[] }[] = []
  const comGrupo = new Set<string>()
  for (const g of grupos) {
    const itens = entries.filter((e) => e.id && g.contas.includes(e.id))
    if (!itens.length) continue
    itens.forEach((e) => comGrupo.add(e.usuario))
    out.push({ titulo: g.nome, itens })
  }
  const avulsas = entries.filter((e) => !comGrupo.has(e.usuario))
  if (avulsas.length) out.push({ titulo: out.length ? 'Avulsas' : null, itens: avulsas })
  return out
}

export function SeletorContaAtiva({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setEntries(null)
    const [contas, creds, gs] = await Promise.all([
      api.validarContas().catch(() => [] as Account[]),   // traz sessao_ok junto
      lerCredenciais().catch(() => [] as Credencial[]),
      api.getGrupos().catch(() => [] as Grupo[]),
    ])
    setGrupos(gs)
    const map = new Map<string, Entry>()
    for (const c of creds) map.set(c.usuario.toLowerCase(), { usuario: c.usuario })
    for (const a of contas) {
      const k = (a.label || '').toLowerCase()
      const prev = map.get(k)
      map.set(k, { usuario: prev?.usuario || a.label, id: a.id, ativa: a.ativa, sessaoOk: a.sessao_ok })
    }
    setEntries([...map.values()].sort((a, b) => cmpTexto(a.usuario, b.usuario)))
  }, [])

  useEffect(() => { if (open) carregar() }, [open, carregar])

  function escolher(e: Entry) {
    if (busy) return
    if (!e.id || e.sessaoOk === false) {   // sem sessão viva → reconectar
      onClose()
      toast.info(`Reconecta @${e.usuario} na tela de Contas.`)
      nav('/contas')
      return
    }
    if (e.ativa) { onClose(); return }
    setBusy(e.usuario)
    api.ativarConta(e.id)
      .then(() => {
        qc.invalidateQueries({ queryKey: QK.contas })
        toast.ok(`Agora os bots usam @${e.usuario}.`)
        onClose()
      })
      .catch((err) => toast.error(`Não consegui trocar: ${erroMsg(err)}`))
      .finally(() => setBusy(null))
  }

  return (
    <Modal open={open} onClose={onClose} title="Trocar conta" size="md">
      <p className="text-xs text-txt-dim mb-3">A conta que os bots vão usar. Sem sessão viva, cai no reconectar.</p>
      {entries === null ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}
        </div>
      ) : entries.length === 0 ? (
        <p className="text-sm text-txt-dim text-center py-8">Nenhuma conta ainda. Conecta uma na tela de Contas.</p>
      ) : (
        <div className="space-y-3">
          {secoes(entries, grupos).map((s) => (
            <div key={s.titulo ?? '__todas'}>
              {s.titulo && (
                <p className="flex items-center gap-1.5 mb-1 text-[11px] font-bold uppercase tracking-wide text-primary-light">
                  {s.titulo}<span className="text-txt-faint tabular-nums">{s.itens.length}</span>
                </p>
              )}
              <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
                {s.itens.map((e) => {
                  let status: string, tone: 'danger' | 'ok' | 'neutro'
                  if (!e.id) { status = 'sem sessão'; tone = 'danger' }
                  else if (e.sessaoOk === false) { status = 'sessão caiu'; tone = 'danger' }
                  else if (e.ativa) { status = 'ativa · em uso'; tone = 'ok' }
                  else { status = 'sessão ok'; tone = 'neutro' }
                  const reconectar = !e.id || e.sessaoOk === false
                  return (
                    <button
                      key={e.usuario}
                      type="button"
                      disabled={!!busy}
                      onClick={() => escolher(e)}
                      className="w-full flex items-center gap-3 px-3.5 h-11 text-left hover:bg-surface2 transition-colors disabled:opacity-60"
                    >
                      <StatusDot tone={tone} />
                      <span className="flex-1 truncate text-sm font-semibold text-txt">@{e.usuario}</span>
                      <span className={cn('text-[11px] font-semibold', tone === 'danger' ? 'text-danger' : tone === 'ok' ? 'text-ok' : 'text-txt-dim')}>{status}</span>
                      <span className="w-24 flex justify-end">
                        {busy === e.usuario ? <Spinner className="h-4 w-4" />
                          : reconectar ? (
                            <span className="flex items-center gap-1 text-xs font-bold text-primary-light"><Link2 className="h-3.5 w-3.5" />{e.id ? 'reconectar' : 'conectar'}</span>
                          ) : e.ativa ? (
                            <Check className="h-4 w-4 text-ok" />
                          ) : (
                            <span className="flex items-center gap-1 text-xs font-bold text-txt"><Power className="h-3.5 w-3.5" />usar</span>
                          )}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
