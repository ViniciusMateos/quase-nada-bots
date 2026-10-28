// Modais da tela de Contas: conta (nova/editar senha), código de verificação, nome de grupo e o
// resumo do "Verificar e sincronizar".
import { Link } from 'react-router-dom'
import { AtSign, KeyRound } from 'lucide-react'
import { Modal } from '@/components/Modal'
import { Button, Input } from '@/components/ui'
import { cn } from '@/lib/utils'
import { Campo, CampoSenha } from './pecas'
import type { Tom } from './modelo'

export type DadosConta = { editando: boolean; usuario: string; senha: string; erro?: string }

export function ModalConta({
  aberto,
  dados,
  salvando,
  onMudar,
  onFechar,
  onSalvar,
}: {
  aberto: boolean
  dados: DadosConta | null
  salvando: boolean
  onMudar: (p: Partial<DadosConta>) => void
  onFechar: () => void
  onSalvar: () => void
}) {
  const d = dados ?? { editando: false, usuario: '', senha: '' }
  return (
    <Modal
      open={aberto}
      onClose={onFechar}
      size="sm"
      title={d.editando ? `Editar @${d.usuario}` : 'Nova conta'}
      footer={
        <>
          <Button variant="ghost" onClick={onFechar}>
            Cancelar
          </Button>
          <Button type="submit" form="form-conta-ig" loading={salvando}>
            Salvar
          </Button>
        </>
      }
    >
      <form
        id="form-conta-ig"
        className="space-y-4"
        autoComplete="off"
        onSubmit={(ev) => {
          ev.preventDefault()
          onSalvar()
        }}
      >
        <Campo label="Usuário">
          <div className="relative">
            <AtSign className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-txt-faint" />
            <Input
              value={d.usuario}
              disabled={d.editando}
              autoFocus={!d.editando}
              onChange={(e) => onMudar({ usuario: e.target.value, erro: undefined })}
              placeholder="usuário"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="pl-10 disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>
        </Campo>
        <Campo
          label="Senha"
          dica="A senha fica só neste navegador. Não é guardada no servidor: vai junto só na hora de logar."
        >
          <CampoSenha
            value={d.senha}
            onChange={(v) => onMudar({ senha: v, erro: undefined })}
            placeholder="senha"
            autoFocus={d.editando}
          />
        </Campo>
        {d.erro && <p className="text-sm text-danger">{d.erro}</p>}
      </form>
    </Modal>
  )
}

export type DadosCodigo = { user: string; codigo: string; erro?: string }

export function ModalCodigo({
  aberto,
  dados,
  enviando,
  onMudar,
  onFechar,
  onEnviar,
}: {
  aberto: boolean
  dados: DadosCodigo | null
  enviando: boolean
  onMudar: (p: Partial<DadosCodigo>) => void
  onFechar: () => void
  onEnviar: () => void
}) {
  const d = dados ?? { user: '', codigo: '' }
  return (
    <Modal
      open={aberto}
      onClose={onFechar}
      size="sm"
      title={`Código de @${d.user}`}
      footer={
        <>
          <Button variant="ghost" onClick={onFechar}>
            Cancelar
          </Button>
          <Button type="submit" form="form-codigo-ig" loading={enviando}>
            Enviar
          </Button>
        </>
      }
    >
      <form
        id="form-codigo-ig"
        className="space-y-4"
        onSubmit={(ev) => {
          ev.preventDefault()
          onEnviar()
        }}
      >
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/15 text-primary-light flex items-center justify-center shrink-0">
            <KeyRound className="h-4 w-4" />
          </div>
          <p className="text-sm text-txt-dim leading-relaxed">
            O Instagram mandou um código (e-mail/SMS). Digite aqui pra o login continuar.
          </p>
        </div>
        <Input
          value={d.codigo}
          onChange={(e) => onMudar({ codigo: e.target.value, erro: undefined })}
          placeholder="código (ex: 123456)"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          className="h-12 text-center font-mono text-lg tracking-[0.3em] placeholder:tracking-normal placeholder:text-sm"
        />
        {d.erro && <p className="text-sm text-danger">{d.erro}</p>}
      </form>
    </Modal>
  )
}

export type DadosNomeGrupo = { original: string | null; nome: string; erro?: string }

export function ModalNomeGrupo({
  aberto,
  dados,
  salvando,
  onMudar,
  onFechar,
  onSalvar,
}: {
  aberto: boolean
  dados: DadosNomeGrupo | null
  salvando: boolean
  onMudar: (p: Partial<DadosNomeGrupo>) => void
  onFechar: () => void
  onSalvar: () => void
}) {
  const d = dados ?? { original: null, nome: '' }
  return (
    <Modal
      open={aberto}
      onClose={onFechar}
      size="sm"
      title={d.original ? `Renomear "${d.original}"` : 'Novo grupo'}
      footer={
        <>
          <Button variant="ghost" onClick={onFechar}>
            Cancelar
          </Button>
          <Button type="submit" form="form-grupo" loading={salvando}>
            Salvar
          </Button>
        </>
      }
    >
      <form
        id="form-grupo"
        className="space-y-3"
        onSubmit={(ev) => {
          ev.preventDefault()
          onSalvar()
        }}
      >
        <Campo
          label="Nome do grupo"
          dica={d.original ? undefined : 'Depois de criar, você já marca as contas dele na lista.'}
        >
          <Input
            value={d.nome}
            onChange={(e) => onMudar({ nome: e.target.value, erro: undefined })}
            placeholder="nome (ex: Vitrine)"
            autoFocus
          />
        </Campo>
        {d.erro && <p className="text-sm text-danger">{d.erro}</p>}
      </form>
    </Modal>
  )
}

export type ItemAviso = { rotulo: string; contas?: string[]; tom?: Tom }
export type DadosAviso = {
  titulo: string
  itens: ItemAviso[]
  rodape?: string
  runId?: string | null
  verExecucoes?: boolean
}

const TOM_BORDA: Record<Tom, string> = {
  ok: 'border-l-ok',
  warn: 'border-l-warn',
  danger: 'border-l-danger',
  neutro: 'border-l-primary',
}

/** Resumo de uma ação (ex: o "Verificar e sincronizar"), com atalho pra acompanhar a execução. */
export function ModalAviso({ aberto, dados, onFechar }: { aberto: boolean; dados: DadosAviso | null; onFechar: () => void }) {
  const d = dados ?? { titulo: '', itens: [] }
  const destino = d.runId ? `/execucoes/${d.runId}` : d.verExecucoes ? '/execucoes' : null
  return (
    <Modal
      open={aberto}
      onClose={onFechar}
      title={d.titulo}
      footer={
        <>
          <Button variant={destino ? 'ghost' : 'primary'} onClick={onFechar}>
            Fechar
          </Button>
          {destino && (
            <Link
              to={destino}
              onClick={onFechar}
              className="inline-flex items-center h-10 px-4 rounded-xl text-sm font-semibold bg-primary text-white hover:bg-primary-light hover:shadow-glow transition-all"
            >
              Acompanhar
            </Link>
          )}
        </>
      }
    >
      <div className="space-y-3">
        {d.itens.map((it) => (
          <div key={it.rotulo} className={cn('border-l-2 pl-3 py-0.5', TOM_BORDA[it.tom ?? 'neutro'])}>
            <p className="text-sm text-txt font-semibold">{it.rotulo}</p>
            {!!it.contas?.length && (
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {it.contas.map((u) => (
                  <span key={u} className="inline-flex items-center h-6 px-2 rounded-md bg-surface2 border border-border text-xs font-semibold text-txt-dim">
                    @{u}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {d.rodape && <p className="text-sm text-txt-dim leading-relaxed pt-1">{d.rodape}</p>}
      </div>
    </Modal>
  )
}
