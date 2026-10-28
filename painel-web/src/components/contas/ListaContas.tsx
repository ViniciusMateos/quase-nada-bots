// Lista de contas: tabela densa no desktop (lg+) e cartões no celular. As seções (Principal /
// Auxiliares / Fora do emulador) viram linhas-cabeçalho, igual o app.
import { motion } from 'framer-motion'
import { KeyRound, LogIn, Pencil, Trash2 } from 'lucide-react'
import { Button, Spinner } from '@/components/ui'
import { cmpTexto } from '@/lib/ordenar'
import { cn } from '@/lib/utils'
import { estadoDe, idadeDe, SECOES, type Entry, type Secao } from './modelo'
import { Caixa, IconBtn, Selo, TagGrupo } from './pecas'

export type BlocoSecao = { secao: Secao; itens: Entry[] }
export type EdicaoGrupo = { nome: string; sel: Set<string> }

type Props = {
  blocos: BlocoSecao[]
  editGrupo: EdicaoGrupo | null
  onMarcar: (id: string) => void
  busy: string | null
  verificando: boolean
  onReconectar: (e: Entry) => void
  onCodigo: (e: Entry) => void
  onEditar: (e: Entry) => void
  onApagar: (e: Entry) => void
}

const entrada = (i: number) => ({
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.22, delay: Math.min(i, 12) * 0.025, ease: 'easeOut' as const },
})

function Avatar({ e }: { e: Entry }) {
  return (
    <span
      className={cn(
        'h-8 w-8 rounded-lg flex items-center justify-center text-[13px] font-extrabold uppercase shrink-0',
        e.secao === 'principal' ? 'bg-marca text-white' : 'bg-surface2 text-txt-dim border border-border',
      )}
    >
      {e.usuario.charAt(0) || '?'}
    </span>
  )
}

function SenhaInfo({ e, curto }: { e: Entry; curto?: boolean }) {
  return e.senha ? (
    <span className="inline-flex items-center gap-1 text-txt-dim" title="Senha salva neste navegador">
      <KeyRound className="h-3.5 w-3.5 text-ok" />
      {curto ? 'senha salva' : 'salva'}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-warn" title="Sem senha salva: o agente não consegue logar essa conta">
      <KeyRound className="h-3.5 w-3.5" />
      sem senha
    </span>
  )
}

function Grupos({ e }: { e: Entry }) {
  if (!e.grupos?.length) return <span className="text-txt-faint">—</span>
  return (
    <div className="flex flex-wrap gap-1">
      {[...e.grupos].sort(cmpTexto).map((g) => (
        <TagGrupo key={g} nome={g} />
      ))}
    </div>
  )
}

function Acoes({ e, p, compacto }: { e: Entry; p: Props; compacto?: boolean }) {
  const ocupado = p.busy === e.usuario
  return (
    <div className={cn('flex items-center gap-1', compacto ? 'justify-end' : 'w-full')}>
      <Button
        variant="subtle"
        size="sm"
        className={cn(!compacto && 'flex-1 h-9')}
        disabled={!!p.busy}
        onClick={(ev) => {
          ev.stopPropagation()
          p.onReconectar(e)
        }}
        title={e.propria ? 'Logar no emulador próprio dela' : 'Logar de novo no app do Instagram'}
      >
        <LogIn className="h-3.5 w-3.5" />
        Reconectar
      </Button>
      {ocupado ? (
        <div className="w-[104px] flex items-center justify-center">
          <Spinner className="h-4 w-4" />
        </div>
      ) : (
        <>
          <IconBtn title="Código de verificação (quando o Instagram pede)" tom="marca" onClick={() => p.onCodigo(e)}>
            <KeyRound className="h-4 w-4" />
          </IconBtn>
          <IconBtn title="Editar senha" onClick={() => p.onEditar(e)}>
            <Pencil className="h-4 w-4" />
          </IconBtn>
          <IconBtn title="Apagar conta" tom="danger" onClick={() => p.onApagar(e)}>
            <Trash2 className="h-4 w-4" />
          </IconBtn>
        </>
      )}
    </div>
  )
}

function CabecalhoSecao({ secao, n }: { secao: Secao; n: number }) {
  const s = SECOES.find((x) => x.id === secao)!
  return (
    <div className="flex items-baseline gap-2 min-w-0">
      <span className="text-[11px] font-bold uppercase tracking-wider text-txt-dim">{s.titulo}</span>
      <span className="text-[11px] font-bold text-txt-faint tabular-nums">{n}</span>
      <span className="text-[11px] text-txt-faint truncate hidden sm:inline">· {s.desc}</span>
    </div>
  )
}

export function ListaContas(p: Props) {
  const marcavel = (e: Entry) => !!p.editGrupo && !!e.id
  const marcado = (e: Entry) => !!p.editGrupo && !!e.id && p.editGrupo.sel.has(e.id)
  let idx = 0

  return (
    <>
      {/* ── desktop: tabela ── */}
      <div className="hidden lg:block">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-txt-faint border-y border-border bg-surface2/40">
              <th className="text-left font-semibold py-2.5 pl-5 pr-3">Conta</th>
              <th className="text-left font-semibold py-2.5 px-3">Estado</th>
              <th className="text-left font-semibold py-2.5 px-3 hidden xl:table-cell">Idade</th>
              <th className="text-left font-semibold py-2.5 px-3">Grupos</th>
              <th className="text-left font-semibold py-2.5 px-3 hidden xl:table-cell">Senha</th>
              <th className="text-right font-semibold py-2.5 pl-3 pr-5">Ações</th>
            </tr>
          </thead>
          {p.blocos.map((b) => (
            <tbody key={b.secao}>
              <tr>
                <td colSpan={6} className="pl-5 pr-5 pt-4 pb-2">
                  <CabecalhoSecao secao={b.secao} n={b.itens.length} />
                </td>
              </tr>
              {b.itens.map((e) => {
                const est = estadoDe(e)
                const idade = idadeDe(e)
                const pode = marcavel(e)
                const on = marcado(e)
                return (
                  <motion.tr
                    key={e.usuario}
                    {...entrada(idx++)}
                    onClick={pode ? () => p.onMarcar(e.id!) : undefined}
                    className={cn(
                      'border-t border-border/70 transition-colors',
                      on ? 'bg-primary/[0.07]' : 'hover:bg-surface2/50',
                      pode && 'cursor-pointer',
                      p.editGrupo && !e.id && 'opacity-50',
                    )}
                  >
                    <td className="py-2.5 pl-5 pr-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {p.editGrupo && (
                          <span className={cn(!e.id && 'invisible')} title={e.id ? undefined : 'Conta sem cadastro no servidor'}>
                            <Caixa marcado={on} />
                          </span>
                        )}
                        <Avatar e={e} />
                        <div className="min-w-0">
                          <p className="font-semibold text-txt truncate">@{e.usuario}</p>
                          <p className="text-[11px] text-txt-faint xl:hidden flex items-center gap-2">
                            {idade && <span className="tabular-nums">{idade}</span>}
                            <SenhaInfo e={e} curto />
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <Selo texto={est.texto} tom={est.tom} pulse={p.verificando && !!e.emulLogada} />
                    </td>
                    <td className="py-2.5 px-3 hidden xl:table-cell text-xs text-txt-dim tabular-nums whitespace-nowrap">
                      {idade ?? <span className="text-txt-faint" title={e.pendente ? 'Pendente: ainda sem sessão' : undefined}>—</span>}
                    </td>
                    <td className="py-2.5 px-3">
                      <Grupos e={e} />
                    </td>
                    <td className="py-2.5 px-3 hidden xl:table-cell text-xs whitespace-nowrap">
                      <SenhaInfo e={e} />
                    </td>
                    <td className="py-2.5 pl-3 pr-5">
                      <Acoes e={e} p={p} compacto />
                    </td>
                  </motion.tr>
                )
              })}
            </tbody>
          ))}
        </table>
      </div>

      {/* ── celular/tablet: cartões ── */}
      <div className="lg:hidden px-4 pb-4 space-y-5">
        {p.blocos.map((b) => (
          <div key={b.secao} className="space-y-2.5">
            <div className="pt-3 px-1">
              <CabecalhoSecao secao={b.secao} n={b.itens.length} />
            </div>
            {b.itens.map((e, i) => {
              const est = estadoDe(e)
              const idade = idadeDe(e)
              const pode = marcavel(e)
              const on = marcado(e)
              return (
                <motion.div
                  key={e.usuario}
                  {...entrada(i)}
                  onClick={pode ? () => p.onMarcar(e.id!) : undefined}
                  className={cn(
                    'rounded-xl border p-3.5 space-y-3 transition-colors',
                    on ? 'border-primary/50 bg-primary/[0.07]' : 'border-border bg-surface2/30',
                    pode && 'cursor-pointer',
                    p.editGrupo && !e.id && 'opacity-50',
                  )}
                >
                  <div className="flex items-start gap-3">
                    {p.editGrupo && e.id && (
                      <span className="pt-1.5">
                        <Caixa marcado={on} />
                      </span>
                    )}
                    <Avatar e={e} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-txt truncate">@{e.usuario}</p>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                        <Selo texto={est.texto} tom={est.tom} pulse={p.verificando && !!e.emulLogada} />
                        {idade && <span className="text-[11px] text-txt-faint tabular-nums">{idade}</span>}
                      </div>
                    </div>
                    <span className="text-[11px] pt-1 shrink-0">
                      <SenhaInfo e={e} />
                    </span>
                  </div>
                  {!!e.grupos?.length && <Grupos e={e} />}
                  {!p.editGrupo && <Acoes e={e} p={p} />}
                </motion.div>
              )
            })}
          </div>
        ))}
      </div>
    </>
  )
}
