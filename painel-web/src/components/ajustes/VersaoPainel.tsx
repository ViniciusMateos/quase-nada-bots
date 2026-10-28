import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { CloudDownload, RefreshCw } from 'lucide-react'
import { Button, Section, Spinner, StatusDot } from '@/components/ui'
import { cn } from '@/lib/utils'
import { InfoLinha } from './pecas'

// "Versão" do painel = o build que está rodando. O Vite põe um hash no nome do script de entrada
// (/painel-assets/index-<hash>.js) a cada build: é o equivalente do "OTA #N" do app — a prova de que o
// build novo carregou. Pra saber se tem versão nova, lê o index.html que o PC serve AGORA (GET
// local no painel-sessao, não no backend) e compara o script.
const DEV = import.meta.env.DEV

function scriptAtual(): string | null {
  const s = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/painel-assets/"]')
  return s?.getAttribute('src') ?? null
}

function scriptDoHtml(html: string): string | null {
  const m = html.match(/<script[^>]*\ssrc="([^"]*\/painel-assets\/[^"]+\.js)"/i)
  return m ? m[1] : null
}

const idBuild = (src: string | null) =>
  src ? (src.split('/').pop() ?? src).replace(/\.js$/, '').replace(/^index-/, '') : null

type Estado = 'dev' | 'checando' | 'atualizado' | 'disponivel' | 'erro'

export function VersaoPainelCard() {
  const atual = useMemo(scriptAtual, [])
  const [recarregando, setRecarregando] = useState(false)

  const remoto = useQuery({
    queryKey: ['ajustes', 'build-remoto'],
    queryFn: async () => {
      const r = await fetch('/', { cache: 'no-store' })
      if (!r.ok) throw new Error(`erro ${r.status}`)
      return scriptDoHtml(await r.text())
    },
    enabled: !DEV && !!atual,
    refetchInterval: 5 * 60_000,
    staleTime: 0,
    retry: 0,
  })

  const estado: Estado =
    DEV || !atual ? 'dev'
    : remoto.isPending ? 'checando'
    : remoto.isError || !remoto.data ? 'erro'
    : remoto.data !== atual ? 'disponivel'
    : 'atualizado'

  const rotulo = {
    dev: 'modo dev',
    checando: 'verificando…',
    atualizado: 'atualizado',
    disponivel: 'desatualizado',
    erro: 'não deu pra conferir',
  }[estado]

  function atualizarAgora() {
    setRecarregando(true)
    // deixa o fade "Atualizando…" aparecer antes do reload (igual o app)
    setTimeout(() => window.location.reload(), 450)
  }

  const id = DEV ? 'dev' : idBuild(atual) ?? '—'

  return (
    <Section
      title="Versão do painel"
      subtitle="O build que está aberto neste navegador"
      action={
        !DEV && (
          <Button variant="ghost" size="sm" onClick={() => remoto.refetch()} disabled={remoto.isFetching}>
            <RefreshCw className={cn('h-3.5 w-3.5', remoto.isFetching && 'animate-spin')} />
            Procurar atualização
          </Button>
        )
      }
      className="h-full"
    >
      {/* atualização: só aparece quando tem build novo esperando (igual o card do app) */}
      <AnimatePresence initial={false}>
        {estado === 'disponivel' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-xl border border-warn/40 bg-warn/[0.06] p-4 mb-3">
              <p className="flex items-center gap-2 text-sm font-extrabold text-txt">
                <CloudDownload className="h-4 w-4 text-warn" /> Atualização disponível
              </p>
              <p className="text-xs text-txt-dim leading-relaxed mt-1.5">
                Tem um build mais novo do painel no PC. Recarrega pra abrir já atualizado.
              </p>
              <Button className="mt-3" size="sm" onClick={atualizarAgora} loading={recarregando}>Atualizar agora</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <InfoLinha label="Build">
        <span className="font-mono text-xs">#{id}</span>
      </InfoLinha>
      <InfoLinha label="Estado">
        {estado === 'checando' ? <Spinner className="h-3.5 w-3.5" /> : (
          <StatusDot tone={estado === 'atualizado' ? 'ok' : estado === 'disponivel' ? 'warn' : 'neutro'} />
        )}
        <span className={cn('text-xs font-semibold', estado === 'disponivel' ? 'text-warn' : 'text-txt')}>{rotulo}</span>
      </InfoLinha>
      <InfoLinha label="Modo">
        <span className="text-xs text-txt-dim">{DEV ? 'desenvolvimento (Vite)' : 'produção (build)'}</span>
      </InfoLinha>
      <InfoLinha label="Aberto em">
        <span className="font-mono text-xs truncate">{window.location.host}</span>
      </InfoLinha>

      <p className="text-[11px] text-txt-faint leading-relaxed mt-3">
        O painel não tem OTA: ele atualiza quando é buildado de novo no PC. O nº do OTA do app continua no rodapé
        dos Ajustes do iPhone.
      </p>

      {/* overlay "Atualizando…" por cima de tudo enquanto recarrega */}
      {createPortal(
        <AnimatePresence>
          {recarregando && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="fixed inset-0 z-[200] bg-bg/95 flex flex-col items-center justify-center gap-4"
            >
              <Spinner className="h-8 w-8" />
              <p className="text-[15px] font-bold text-txt">Atualizando…</p>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </Section>
  )
}
