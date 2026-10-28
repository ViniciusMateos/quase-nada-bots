import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity,
  Bot,
  CalendarClock,
  History,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Smartphone,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEmulador, useRunsAtivas } from '@/lib/queries'
import { Logo, StatusDot } from './ui'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

// Menu do painel = as áreas do app (Emulador/home, bots, execuções, histórico, contas, cronograma)
const NAV: NavItem[] = [
  { to: '/visao-geral', label: 'Visão geral', icon: LayoutDashboard },
  { to: '/bots', label: 'Bots', icon: Bot },
  { to: '/execucoes', label: 'Execuções', icon: Activity },
  { to: '/historico', label: 'Histórico', icon: History },
  { to: '/contas', label: 'Contas', icon: Users },
  { to: '/cronograma', label: 'Cronograma', icon: CalendarClock },
  { to: '/ajustes', label: 'Ajustes', icon: Settings },
]

function NavRow({ item, collapsed, badge, onNavigate }: { item: NavItem; collapsed: boolean; badge?: number; onNavigate?: () => void }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center h-11 rounded-xl transition-colors',
          collapsed ? 'justify-center px-0 mx-auto w-11' : 'px-3 gap-3',
          isActive ? 'text-white' : 'text-txt-dim hover:text-txt hover:bg-surface2',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.div
              layoutId="nav-active"
              className="absolute inset-0 rounded-xl bg-primary shadow-glow"
              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            />
          )}
          <Icon className="relative h-5 w-5 shrink-0" strokeWidth={2.2} />
          {!collapsed && <span className="relative text-sm font-semibold flex-1">{item.label}</span>}
          {!!badge && (
            <span
              className={cn(
                'relative min-w-5 h-5 px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center',
                isActive ? 'bg-white/25 text-white' : 'bg-primary/20 text-primary-light',
                collapsed && 'absolute -top-1 -right-1 min-w-4 h-4 px-1 text-[10px]',
              )}
            >
              {badge}
            </span>
          )}
          {collapsed && (
            <span className="pointer-events-none absolute left-full ml-3 px-2 py-1 rounded-md bg-surface2 border border-border text-xs text-txt opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
              {item.label}
            </span>
          )}
        </>
      )}
    </NavLink>
  )
}

/** Rodapé da sidebar: o agente do emulador está no ar? quantas contas logadas? */
function EmuladorRodape({ collapsed }: { collapsed: boolean }) {
  const { data, isError } = useEmulador()
  const online = !!data?.online && !isError
  const n = data?.contas_logadas?.length ?? 0
  return (
    <Link
      to="/visao-geral"
      title={online ? `Emulador online · ${n} contas logadas` : 'Emulador offline'}
      className={cn('flex items-center rounded-xl hover:bg-surface2 transition-colors', collapsed ? 'justify-center h-10' : 'px-2.5 gap-2.5 py-2')}
    >
      <div className="relative h-8 w-8 rounded-lg bg-surface2 flex items-center justify-center shrink-0">
        <Smartphone className="h-4 w-4 text-txt-dim" />
        <StatusDot tone={online ? 'ok' : 'danger'} className="absolute -bottom-0.5 -right-0.5 ring-2 ring-surface" />
      </div>
      {!collapsed && (
        <div className="min-w-0 leading-tight">
          <p className="text-sm font-semibold text-txt">{online ? 'Emulador online' : 'Emulador offline'}</p>
          <p className="text-[11px] text-txt-dim truncate">{online ? `${n} conta${n === 1 ? '' : 's'} logada${n === 1 ? '' : 's'}` : 'o agente do PC não respondeu'}</p>
        </div>
      )}
    </Link>
  )
}

function SidebarContent({
  collapsed,
  onToggle,
  onNavigate,
}: {
  collapsed: boolean
  onToggle?: () => void
  onNavigate?: () => void
}) {
  const { ativas } = useRunsAtivas()
  return (
    <div className="flex h-full flex-col bg-surface/60 backdrop-blur-xl">
      {/* Marca */}
      <Link to="/visao-geral" onClick={onNavigate} className={cn('flex items-center h-16 shrink-0', collapsed ? 'justify-center' : 'px-4 gap-2.5')}>
        <Logo className="h-9 w-9 shrink-0" />
        {!collapsed && (
          <div className="leading-tight">
            <p className="font-extrabold text-txt text-[15px]">Quase Nada</p>
            <p className="text-[11px] text-txt-dim -mt-0.5">Bots · painel</p>
          </div>
        )}
      </Link>

      {/* Nav */}
      <nav className="flex-1 px-2.5 py-2 space-y-1 overflow-y-auto">
        {NAV.map((item) => (
          <NavRow
            key={item.to}
            item={item}
            collapsed={collapsed}
            badge={item.to === '/execucoes' ? ativas.length : undefined}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      {/* Emulador */}
      <div className="p-2.5 border-t border-border">
        <EmuladorRodape collapsed={collapsed} />
      </div>

      {/* Toggle (só desktop) */}
      {onToggle && (
        <button
          onClick={onToggle}
          className="hidden md:flex items-center justify-center h-10 border-t border-border text-txt-faint hover:text-txt transition-colors"
          title={collapsed ? 'Expandir' : 'Recolher'}
        >
          {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </button>
      )}
    </div>
  )
}

/** Pílula "N rodando" do topo — o equivalente da barra flutuante do app. Leva pras execuções. */
function RodandoPill() {
  const { ativas } = useRunsAtivas()
  if (!ativas.length) return null
  const r = ativas[0]
  const pct = r.progress?.total ? Math.round((r.progress.done / r.progress.total) * 100) : null
  return (
    <Link
      to={ativas.length === 1 ? `/execucoes/${r.id}` : '/execucoes'}
      className="flex items-center gap-2.5 h-9 pl-2.5 pr-3.5 rounded-full bg-primary/12 border border-primary/30 text-primary-light hover:bg-primary/20 transition-colors max-w-[380px]"
    >
      <StatusDot tone="ativo" pulse />
      <span className="text-xs font-semibold truncate">
        {ativas.length === 1 ? (r.titulo || r.bot) : `${ativas.length} rodando`}
      </span>
      {ativas.length === 1 && pct != null && <span className="text-[11px] font-bold tabular-nums">{pct}%</span>}
    </Link>
  )
}

export default function AppLayout() {
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('qnb_sidebar') === '1' } catch { return false }
  })
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    try { localStorage.setItem('qnb_sidebar', collapsed ? '1' : '0') } catch { /* sem storage */ }
  }, [collapsed])
  useEffect(() => setMobileOpen(false), [location.pathname])

  const current = NAV.find((n) => location.pathname.startsWith(n.to))
  // a transição anima por ÁREA (1º segmento), não a cada sub-rota/query
  const chave = '/' + (location.pathname.split('/')[1] || '')

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Sidebar desktop */}
      <motion.aside
        animate={{ width: collapsed ? 76 : 248 }}
        transition={{ type: 'spring', stiffness: 300, damping: 34 }}
        className="hidden md:block shrink-0 border-r border-border"
      >
        <SidebarContent collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      </motion.aside>

      {/* Sidebar mobile (drawer) */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/60 md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              className="fixed left-0 top-0 bottom-0 z-50 w-64 border-r border-border md:hidden"
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            >
              <SidebarContent collapsed={false} onNavigate={() => setMobileOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Conteúdo */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center gap-3 h-14 px-4 md:px-8 border-b border-border shrink-0 bg-bg/80 backdrop-blur">
          <button
            onClick={() => setMobileOpen(true)}
            className="md:hidden h-9 w-9 flex items-center justify-center rounded-lg text-txt-dim hover:bg-surface2"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-bold text-txt md:text-sm md:text-txt-dim md:font-semibold">{current?.label || 'Quase Nada Bots'}</span>
          <div className="flex-1" />
          <RodandoPill />
        </header>

        <main className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={chave}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="min-h-full"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}
