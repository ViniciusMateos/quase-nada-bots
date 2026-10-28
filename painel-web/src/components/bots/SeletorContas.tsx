// Seleção das contas do lote. Cada conta marcada mostra o NÚMERO da vez dela — a ordem em que foi
// marcada (igual escolher fotos de um carrossel do IG): marcar põe no fim; desmarcar tira e os
// números das outras se ajustam. É nessa ordem que o lote roda.
import type { ReactNode } from 'react'
import { AnimatePresence, motion, Reorder, useDragControls } from 'framer-motion'
import { GripVertical, Lock, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { alternarNaOrdem } from './catalogo'

export type ItemConta = {
  key: string          // o que vai pro lote (username no emulador, id no servidor)
  label: string        // @ mostrado
  bloqueada?: boolean  // sem sessão viva: não dá pra marcar
  tag?: ReactNode
}

export function SeletorContas({ itens, ordem, onChange, colunas = 'sm:grid-cols-2 2xl:grid-cols-3' }: {
  itens: ItemConta[]; ordem: string[]; onChange: (ordem: string[]) => void
  colunas?: string   // classes do grid (padrão: 2 colunas, 3 no telão)
}) {
  return (
    <div className={cn('grid gap-2', colunas)}>
      {itens.map((c) => {
        const pos = ordem.indexOf(c.key)
        const on = pos >= 0 && !c.bloqueada
        return (
          <button
            key={c.key}
            type="button"
            role="checkbox"
            aria-checked={on}
            disabled={c.bloqueada}
            onClick={() => onChange(alternarNaOrdem(ordem, c.key))}
            className={cn(
              'group flex items-center gap-3 h-11 px-3 rounded-xl border text-left transition-all duration-150',
              on ? 'border-primary/50 bg-primary/10' : 'border-border bg-surface2/40 hover:bg-surface2 hover:border-txt-faint/50',
              c.bloqueada && 'opacity-50 cursor-not-allowed hover:bg-surface2/40 hover:border-border',
            )}
          >
            <span
              className={cn(
                'relative h-6 w-6 shrink-0 rounded-md border-[1.5px] flex items-center justify-center overflow-hidden transition-colors',
                on ? 'bg-primary border-primary' : 'border-txt-faint group-hover:border-txt-dim',
              )}
            >
              {c.bloqueada ? (
                <Lock className="h-3 w-3 text-txt-faint" />
              ) : (
                <AnimatePresence initial={false} mode="popLayout">
                  {on && (
                    <motion.span
                      key={pos}
                      initial={{ scale: 0.4, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.4, opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 600, damping: 30 }}
                      className="text-[11px] font-extrabold text-white tabular-nums"
                    >
                      {pos + 1}
                    </motion.span>
                  )}
                </AnimatePresence>
              )}
            </span>
            <span className={cn('flex-1 truncate text-sm font-semibold', c.bloqueada ? 'text-txt-faint' : 'text-txt')}>@{c.label}</span>
            {c.tag}
          </button>
        )
      })}
    </div>
  )
}

/** A fila do lote (já na ordem): arrasta pra trocar a vez, X tira. */
export function OrdemLote({ ordem, onChange, rotulo }: {
  ordem: string[]; onChange: (ordem: string[]) => void; rotulo?: (key: string) => string
}) {
  if (!ordem.length) return <p className="text-xs text-txt-faint">Nenhuma conta marcada.</p>
  return (
    <Reorder.Group axis="y" values={ordem} onReorder={onChange} className="space-y-1.5">
      {ordem.map((k, i) => (
        <ItemOrdem key={k} k={k} i={i} label={rotulo ? rotulo(k) : k} onRemover={() => onChange(ordem.filter((x) => x !== k))} />
      ))}
    </Reorder.Group>
  )
}

function ItemOrdem({ k, i, label, onRemover }: { k: string; i: number; label: string; onRemover: () => void }) {
  const controles = useDragControls()
  return (
    <Reorder.Item
      value={k}
      dragListener={false}
      dragControls={controles}
      whileDrag={{ scale: 1.03, boxShadow: '0 12px 28px -10px rgba(0,0,0,0.7)' }}
      className="relative flex items-center gap-2 h-9 pl-1 pr-1.5 rounded-lg bg-surface2 border border-border select-none"
    >
      <span
        onPointerDown={(e) => controles.start(e)}
        className="h-7 w-6 flex items-center justify-center text-txt-faint hover:text-txt cursor-grab active:cursor-grabbing touch-none"
        title="Arraste pra mudar a vez"
      >
        <GripVertical className="h-4 w-4" />
      </span>
      <span className="h-5 min-w-5 px-1 rounded-md bg-primary text-white text-[11px] font-extrabold flex items-center justify-center tabular-nums">{i + 1}</span>
      <span className="flex-1 truncate text-[13px] font-semibold text-txt">@{label}</span>
      <button
        type="button"
        onClick={onRemover}
        className="h-6 w-6 flex items-center justify-center rounded-md text-txt-faint hover:text-danger hover:bg-danger/10 transition-colors"
        title="Tirar do lote"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </Reorder.Item>
  )
}
