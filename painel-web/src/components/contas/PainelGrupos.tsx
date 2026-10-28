// Grupos de contas: clicar num grupo liga o modo "marcar contas" na lista; renomear/apagar por linha.
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, FolderPlus, Pencil, Tag, Trash2, UserMinus, UserPlus, type LucideIcon } from 'lucide-react'
import { Button, Section, Skeleton } from '@/components/ui'
import type { Grupo } from '@/lib/api'
import { cmpTexto } from '@/lib/ordenar'
import { cn } from '@/lib/utils'
import { IconBtn } from './pecas'

export function PainelGrupos({
  grupos,
  carregando,
  editando,
  onAbrir,
  onNovo,
  onRenomear,
  onApagar,
}: {
  grupos: Grupo[]
  carregando: boolean
  editando: string | null
  onAbrir: (nome: string) => void
  onNovo: () => void
  onRenomear: (nome: string) => void
  onApagar: (nome: string) => void
}) {
  const lista = [...grupos].sort((a, b) => cmpTexto(a.nome, b.nome))
  return (
    <Section
      title="Grupos"
      subtitle={grupos.length ? 'Clique num grupo pra escolher as contas dele.' : undefined}
      action={
        <Button variant="subtle" size="sm" onClick={onNovo}>
          <FolderPlus className="h-3.5 w-3.5" />
          Novo grupo
        </Button>
      }
    >
      {carregando ? (
        <div className="space-y-2">
          <Skeleton className="h-11" />
          <Skeleton className="h-11" />
        </div>
      ) : lista.length === 0 ? (
        <p className="text-sm text-txt-dim leading-relaxed">
          Separe as contas em grupos (ex: Captação, Vitrine) pra rodar um bot só num grupo.
        </p>
      ) : (
        <div className="grid gap-1.5 sm:grid-cols-2 2xl:grid-cols-1">
          <AnimatePresence initial={false}>
            {lista.map((g) => {
              const on = editando === g.nome
              return (
                <motion.div
                  key={g.nome}
                  layout
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.18 }}
                  role="button"
                  tabIndex={0}
                  onClick={() => onAbrir(g.nome)}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                      ev.preventDefault()
                      onAbrir(g.nome)
                    }
                  }}
                  className={cn(
                    'group flex items-center gap-2.5 h-11 pl-3 pr-1.5 rounded-xl border cursor-pointer transition-colors',
                    on ? 'border-primary/60 bg-primary/10' : 'border-border bg-surface2/40 hover:bg-surface2',
                  )}
                >
                  <Tag className={cn('h-4 w-4 shrink-0', on ? 'text-primary-light' : 'text-txt-faint')} />
                  <span className="flex-1 min-w-0 truncate text-sm font-semibold text-txt">{g.nome}</span>
                  <span className="text-xs font-bold tabular-nums text-txt-dim px-1.5">{g.contas.length}</span>
                  <div className="flex items-center opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100 transition-opacity">
                    <IconBtn title="Renomear" onClick={() => onRenomear(g.nome)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </IconBtn>
                    <IconBtn title="Apagar grupo" tom="danger" onClick={() => onApagar(g.nome)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconBtn>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}
    </Section>
  )
}

function Atalho({ to, icon: Icon, titulo, desc }: { to: string; icon: LucideIcon; titulo: string; desc: string }) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 rounded-xl border border-border bg-surface2/40 px-3 py-2.5 hover:bg-surface2 hover:border-txt-faint/60 hover:-translate-y-px transition-all"
    >
      <span className="h-9 w-9 rounded-lg bg-surface2 border border-border flex items-center justify-center shrink-0 text-txt-dim group-hover:text-primary-light transition-colors">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-txt">{titulo}</span>
        <span className="block text-xs text-txt-dim leading-snug">{desc}</span>
      </span>
      <ArrowRight className="h-4 w-4 text-txt-faint group-hover:text-txt group-hover:translate-x-0.5 transition-all shrink-0" />
    </Link>
  )
}

/** Atalhos pras telas de Criar conta e Remover contas (os botões do app). */
export function PainelAtalhos() {
  return (
    <Section title="Atalhos">
      <div className="grid gap-2">
        <Atalho
          to="/contas/criar"
          icon={UserPlus}
          titulo="Criar conta nova"
          desc="O bot vai até o código do e-mail; o resto você termina no emulador."
        />
        <Atalho
          to="/contas/remover"
          icon={UserMinus}
          titulo="Remover do emulador"
          desc="Termina a sessão no app do IG pra abrir vaga no limite de ~10."
        />
      </div>
    </Section>
  )
}
