// Menu de contexto (botão direito / segurar) — o equivalente do long-press do app. Abre no ponto do
// clique indo pra direita e pra baixo; se não couber, gruda na borda. Fecha ao clicar fora, Esc,
// rolar ou redimensionar.
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent as RPointerEvent, MouseEvent as RMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ItemMenu = { label: string; icon: LucideIcon; danger?: boolean; onClick: () => void }

export function MenuContexto({ pos, onClose, itens }: {
  pos: { x: number; y: number } | null
  onClose: () => void
  itens: ItemMenu[]
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [xy, setXy] = useState<{ left: number; top: number }>({ left: 0, top: 0 })
  // snapshot dos itens enquanto aberto (mantém durante a animação de saída)
  const snap = useRef<ItemMenu[]>([])
  if (pos) snap.current = itens

  useLayoutEffect(() => {
    if (!pos) return
    const w = ref.current?.offsetWidth ?? 200
    const h = ref.current?.offsetHeight ?? itens.length * 40 + 8
    setXy({
      left: Math.min(Math.max(8, pos.x + 4), window.innerWidth - w - 8),
      top: Math.min(Math.max(8, pos.y + 4), window.innerHeight - h - 8),
    })
  }, [pos, itens.length])

  useEffect(() => {
    if (!pos) return
    const fora = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const fechar = () => onClose()
    document.addEventListener('mousedown', fora)
    document.addEventListener('touchstart', fora)
    document.addEventListener('keydown', tecla)
    window.addEventListener('resize', fechar)
    window.addEventListener('scroll', fechar, true)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('touchstart', fora)
      document.removeEventListener('keydown', tecla)
      window.removeEventListener('resize', fechar)
      window.removeEventListener('scroll', fechar, true)
    }
  }, [pos, onClose])

  return createPortal(
    <AnimatePresence>
      {pos && (
        <motion.div
          ref={ref}
          role="menu"
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 520, damping: 32 }}
          style={{ left: xy.left, top: xy.top, transformOrigin: 'top left' }}
          className="fixed z-[90] min-w-[184px] py-1 rounded-xl bg-surface2 border border-border shadow-card"
          onContextMenu={(e) => e.preventDefault()}
        >
          {snap.current.map((it, i) => {
            const Icon = it.icon
            return (
              <Fragment key={it.label}>
                {i > 0 && <div className="h-px bg-border mx-2" />}
                <button
                  type="button"
                  role="menuitem"
                  onClick={it.onClick}
                  className={cn(
                    'w-full flex items-center gap-3 h-10 px-3.5 text-sm font-semibold transition-colors',
                    it.danger ? 'text-danger hover:bg-danger/10' : 'text-txt hover:bg-border/60',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {it.label}
                </button>
              </Fragment>
            )
          })}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

/** Botão direito no desktop; segurar (~0,45s) no toque. `foiLongo()` diz se o último toque abriu o
 * menu (pra não contar como clique). */
export function useMenuContexto(abrir: (x: number, y: number) => void, ms = 450) {
  const timer = useRef<number | null>(null)
  const longo = useRef(false)
  const limpar = () => { if (timer.current) { window.clearTimeout(timer.current); timer.current = null } }
  return {
    handlers: {
      onPointerDown: (e: RPointerEvent) => {
        longo.current = false
        if (e.pointerType === 'mouse') return
        const { clientX, clientY } = e
        limpar()
        timer.current = window.setTimeout(() => { longo.current = true; abrir(clientX, clientY) }, ms)
      },
      onPointerUp: limpar,
      onPointerLeave: limpar,
      onPointerCancel: limpar,
      onContextMenu: (e: RMouseEvent) => {
        e.preventDefault()
        if (longo.current) return   // o segurar já abriu
        abrir(e.clientX, e.clientY)
      },
    },
    foiLongo: () => longo.current,
  }
}
