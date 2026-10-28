import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

/** Breadcrumb simples ("Bots / Auto Follow / Chats") — fica colado em cima do PageHeader. */
export function Migalha({ itens }: { itens: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="Caminho" className="flex items-center gap-1 px-5 md:px-8 pt-5 md:pt-6 -mb-4 md:-mb-6 text-xs font-semibold text-txt-faint min-w-0">
      {itens.map((it, i) => (
        <Fragment key={`${it.label}-${i}`}>
          {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
          {it.to ? (
            <Link to={it.to} className="hover:text-txt transition-colors truncate">{it.label}</Link>
          ) : (
            <span className="text-txt-dim truncate">{it.label}</span>
          )}
        </Fragment>
      ))}
    </nav>
  )
}
