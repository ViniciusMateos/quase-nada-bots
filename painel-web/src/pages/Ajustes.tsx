import { PageBody, PageHeader } from '@/components/ui'
import { AgenteCard, ServidorCard } from '@/components/ajustes/Conexoes'
import { InstagramCard } from '@/components/ajustes/InstagramCard'
import { Aparece } from '@/components/ajustes/pecas'
import { SobrePainelCard, SoNoIphoneCard } from '@/components/ajustes/Sobre'
import { VersaoPainelCard } from '@/components/ajustes/VersaoPainel'

// Ajustes = o SettingsScreen do app adaptado ao painel: atalho das contas, servidor em uso (e se
// responde), agente do emulador, versão do painel (o "OTA" daqui), o que só existe no iPhone e o
// "sobre". Nada aqui mexe no servidor — tudo é leitura.
export default function Ajustes() {
  return (
    <>
      <PageHeader title="Ajustes" subtitle="Conexões, versão do painel e o que só existe no iPhone" />
      <PageBody className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <Aparece className="h-full"><ServidorCard /></Aparece>
          <Aparece className="h-full" delay={0.04}><AgenteCard /></Aparece>
          <Aparece className="h-full" delay={0.08}><InstagramCard /></Aparece>
          <Aparece className="h-full" delay={0.12}><VersaoPainelCard /></Aparece>
          <Aparece className="h-full" delay={0.16}><SobrePainelCard /></Aparece>
          <Aparece className="h-full" delay={0.2}><SoNoIphoneCard /></Aparece>
        </div>
      </PageBody>
    </>
  )
}
