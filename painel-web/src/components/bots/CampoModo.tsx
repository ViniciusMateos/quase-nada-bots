// Um campo do modo (Campo do EditModoScreen): rótulo + interruptor + dica e, conforme o tipo,
// o número, o intervalo "de X até Y", o texto, as opções ou a lista de mensagens.
import { AnimatePresence, motion } from 'framer-motion'
import { Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input, Switch, TextArea } from '@/components/ui'
import { Pilula } from './Pilula'
import { ehString, num, txtNum } from './camposModo'
import type { MetaF, Valor } from './camposModo'

const abre = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: 'auto' },
  exit: { opacity: 0, height: 0 },
  transition: { duration: 0.18, ease: 'easeOut' as const },
}

export function CampoModo({ k, meta, valor, on, onToggle, onChange }: {
  k: string; meta: MetaF; valor: Valor; on: boolean; onToggle: (on: boolean) => void; onChange: (v: Valor) => void
}) {
  const lista = meta.tipo === 'lista'
  return (
    <motion.div
      layout="position"
      className={cn(
        'rounded-xl border p-4 transition-colors',
        on || ehString(meta.tipo) ? 'border-border bg-surface2/50' : 'border-border/70 bg-transparent',
        lista && 'md:col-span-2',
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <label htmlFor={`campo-${k}`} className="text-sm font-semibold text-txt leading-snug pt-0.5">{meta.label}</label>
        {!ehString(meta.tipo) && <Switch checked={on} onChange={onToggle} label={meta.label} />}
      </div>
      {meta.dica && <p className="text-xs text-txt-faint leading-relaxed mt-1.5">{meta.dica}</p>}

      {meta.tipo === 'text' && (
        <Input
          id={`campo-${k}`}
          className="mt-3"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder={typeof meta.sug === 'string' && meta.sug ? meta.sug : meta.label}
          value={String(valor ?? '')}
          onChange={(e) => onChange(meta.label === 'Conta-alvo' ? e.target.value.replace(/^@+/, '') : e.target.value)}
        />
      )}

      {meta.tipo === 'opcao' && (
        <div className="flex flex-wrap gap-2 mt-3">
          {(meta.opcoes ?? []).map((o) => (
            <Pilula key={o.valor} grupo={`opcao-${k}`} sel={(valor || meta.sug) === o.valor} onClick={() => onChange(o.valor)} tamanho="sm">
              {o.label}
            </Pilula>
          ))}
        </div>
      )}

      {lista && (
        <div className="mt-3 space-y-2">
          <AnimatePresence initial={false}>
            {((valor as string[]) ?? []).map((t, i) => (
              <motion.div key={i} {...abre} className="overflow-hidden">
                <div className="flex items-start gap-2 pt-0.5">
                  <span className="mt-3 h-5 min-w-5 px-1 rounded-md bg-surface text-[11px] font-bold text-txt-dim flex items-center justify-center tabular-nums">{i + 1}</span>
                  <TextArea
                    rows={3}
                    className="flex-1 text-sm"
                    autoCapitalize="none"
                    placeholder="oii {username}! ... @brechoquasenadaa ..."
                    value={t}
                    onChange={(e) => onChange(((valor as string[]) ?? []).map((x, j) => (j === i ? e.target.value : x)))}
                  />
                  <button
                    type="button"
                    title="Remover mensagem"
                    onClick={() => onChange(((valor as string[]) ?? []).filter((_x, j) => j !== i))}
                    className="mt-2 h-8 w-8 flex items-center justify-center rounded-lg text-txt-faint hover:text-danger hover:bg-danger/10 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          <button
            type="button"
            onClick={() => onChange([...((valor as string[]) ?? []), ''])}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-primary-light hover:text-primary transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />adicionar mensagem
          </button>
        </div>
      )}

      <AnimatePresence initial={false}>
        {meta.tipo === 'cap' && on && (
          <motion.div key="cap" {...abre} className="overflow-hidden">
            <Input
              id={`campo-${k}`}
              className="mt-3 tabular-nums"
              inputMode="decimal"
              placeholder="0"
              value={txtNum(valor as number)}
              onChange={(e) => onChange(num(e.target.value))}
            />
          </motion.div>
        )}
        {meta.tipo === 'range' && on && (
          <motion.div key="range" {...abre} className="overflow-hidden">
            <div className="flex items-center gap-3 mt-3">
              <Input
                id={`campo-${k}`}
                className="text-center tabular-nums"
                inputMode="decimal"
                placeholder="0"
                aria-label={`${meta.label} — de`}
                value={txtNum((valor as number[])?.[0] ?? 0)}
                onChange={(e) => onChange([num(e.target.value), (valor as number[])?.[1] ?? 0])}
              />
              <span className="text-xs text-txt-dim shrink-0">até</span>
              <Input
                className="text-center tabular-nums"
                inputMode="decimal"
                placeholder="0"
                aria-label={`${meta.label} — até`}
                value={txtNum((valor as number[])?.[1] ?? 0)}
                onChange={(e) => onChange([(valor as number[])?.[0] ?? 0, num(e.target.value)])}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
