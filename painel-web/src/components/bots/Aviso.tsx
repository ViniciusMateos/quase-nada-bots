import { useCallback, useRef, useState } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/ui'

/** O Alert.alert(título, mensagem) do app: um modalzinho com OK. Devolve `aviso(t, m)` e o elemento. */
export function useAviso() {
  const [aberto, setAberto] = useState(false)
  // guarda o último conteúdo pra ele não sumir durante a animação de saída
  const ultimo = useRef<{ titulo: string; msg: string }>({ titulo: '', msg: '' })
  const aviso = useCallback((titulo: string, msg: string) => {
    ultimo.current = { titulo, msg }
    setAberto(true)
  }, [])
  const fechar = () => setAberto(false)
  const avisoEl = (
    <Modal
      open={aberto}
      onClose={fechar}
      title={ultimo.current.titulo}
      size="sm"
      footer={<Button size="sm" onClick={fechar} autoFocus>Ok</Button>}
    >
      <p className="text-sm text-txt-dim leading-relaxed whitespace-pre-line">{ultimo.current.msg}</p>
    </Modal>
  )
  return { aviso, avisoEl }
}
