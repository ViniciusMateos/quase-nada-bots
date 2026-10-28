import { useEffect, useState } from 'react'
import { Activity, BellRing, CloudDownload, ExternalLink, KeyRound, Monitor, Smartphone } from 'lucide-react'
import { Logo, Section } from '@/components/ui'
import { Pilula } from '@/components/cronograma/estado'
import { lerCredenciais } from '@/lib/credenciais'
import { ItemExplicado } from './pecas'

/** O que é o painel, onde ele roda, onde ficam as senhas — e o atalho pro app antigo em /app. */
export function SobrePainelCard() {
  const [senhas, setSenhas] = useState<number | null>(null)
  useEffect(() => {
    let vivo = true
    lerCredenciais().then((l) => vivo && setSenhas(l.length)).catch(() => vivo && setSenhas(0))
    return () => { vivo = false }
  }, [])

  return (
    <Section title="Sobre o painel" className="h-full">
      <div className="flex items-center gap-3 mb-5">
        <Logo className="h-11 w-11 shrink-0" />
        <div className="min-w-0">
          <p className="font-extrabold text-txt leading-tight">Quase Nada Bots · painel</p>
          <p className="text-xs text-txt-dim mt-0.5">
            A versão desktop do app: as mesmas funções, com cara de painel — tabelas, telas largas e tudo à mão no PC.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <ItemExplicado icon={<Monitor className="h-4 w-4" />} titulo="Roda local, no PC">
          Servido pelo painel de sessão em <span className="font-mono text-txt">quase-nada-bots.localhost</span>, que
          liga junto com o PC. Fala direto com o mesmo servidor do app — o que você faz aqui aparece no iPhone e
          vice-versa.
        </ItemExplicado>

        <ItemExplicado
          icon={<KeyRound className="h-4 w-4" />}
          titulo="Senhas só neste navegador"
          extra={senhas != null && (
            <Pilula className="tabular-nums">
              {senhas} {senhas === 1 ? 'senha salva aqui' : 'senhas salvas aqui'}
            </Pilula>
          )}
        >
          As senhas das contas do Instagram ficam guardadas só neste navegador (igual o Keychain no iPhone) e nunca
          vão pro servidor. Outro navegador ou outro PC não enxerga — lá elas precisam ser salvas de novo.
        </ItemExplicado>

        <ItemExplicado icon={<Smartphone className="h-4 w-4" />} titulo="O app antigo continua em /app">
          A versão celular (o app no navegador, do jeito de antes) segue no ar, se precisar de alguma tela do jeito antigo.
          <a
            href="/app"
            target="_blank"
            rel="noreferrer"
            className="mt-2.5 flex w-fit items-center gap-1.5 h-8 px-3 rounded-lg bg-surface2 text-xs font-semibold text-txt hover:bg-border transition-colors"
          >
            Abrir a versão celular
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </ItemExplicado>
      </div>
    </Section>
  )
}

/** O que existe só no app do iPhone (e por quê não tem aqui). */
export function SoNoIphoneCard() {
  const tag = <Pilula tom="fraco">só no app</Pilula>
  return (
    <Section title="Só no iPhone" subtitle="Coisas do celular que o navegador não faz" className="h-full">
      <div className="space-y-4">
        <ItemExplicado icon={<Activity className="h-4 w-4" />} titulo="Live Activity" extra={tag}>
          A barra viva na tela bloqueada e na Ilha Dinâmica. Quando o cronograma roda sozinho, o servidor liga ela
          por push-to-start (iOS 17.2+). Aqui no painel, o que está rodando aparece na pílula do topo e em Execuções.
        </ItemExplicado>
        <ItemExplicado icon={<BellRing className="h-4 w-4" />} titulo="Notificações" extra={tag}>
          Os avisos de começou/terminou das runs na mão e o "reconecta" do cronograma (quando a sessão de uma conta
          caiu) chegam só no iPhone. O painel não recebe push.
        </ItemExplicado>
        <ItemExplicado icon={<CloudDownload className="h-4 w-4" />} titulo="Atualização OTA" extra={tag}>
          O app baixa versão nova sozinho e mostra o nº do OTA no rodapé dos Ajustes. O painel atualiza de outro
          jeito: quando é buildado de novo no PC (veja Versão do painel).
        </ItemExplicado>
      </div>
    </Section>
  )
}
