import { motion } from 'framer-motion'
import { Hourglass, Pause, Shuffle, Sun, Unplug, Users, Zap, type LucideIcon } from 'lucide-react'

// As regras do backend (backend/cronograma.py), em português de gente.
const ITENS: { icon: LucideIcon; titulo: string; texto: string }[] = [
  {
    icon: Zap,
    titulo: 'Roda sozinho',
    texto: 'O servidor confere o plano a cada minuto e, na hora marcada, inicia o Aquecimento Humano na conta. Sem push: fica uma linha no log da run ("Cronograma: comecei…") e, no iPhone, a Live Activity liga sozinha.',
  },
  {
    icon: Sun,
    titulo: '2x por conta, todo dia',
    texto: 'Uma vez de manhã (10h–13h30) e uma de tarde (13h30–17h), nunca coladas. Teto às 17h de propósito: a noite fica livre pro Auto Follow e o DM na mão.',
  },
  {
    icon: Shuffle,
    titulo: 'Horários sorteados',
    texto: 'Os horários são sorteados todo dia (sem padrão) e nunca caem duas contas na mesma faixa — é uma conta por vez, pra não juntar tudo no mesmo IP. No mesmo dia não mudam, nem se o servidor reiniciar.',
  },
  {
    icon: Hourglass,
    titulo: 'Adia se tem bot rodando',
    texto: 'Um bot por vez. Se na hora tiver outro rodando, espera a vaga por até 2h; passou disso, pula — não roda atrasado.',
  },
  {
    icon: Unplug,
    titulo: 'Sessão caiu',
    texto: 'Se a sessão da conta caiu, não roda e manda o push "reconecta" (conta adicionada sem conectar: "conecta"). É o único aviso que o cronograma manda.',
  },
  {
    icon: Pause,
    titulo: 'Pausar',
    texto: 'Pausado, nada roda sozinho. Ao ligar de novo, volta a partir do próximo horário — o que passou enquanto estava pausado é pulado.',
  },
  {
    icon: Users,
    titulo: 'Quem entra',
    texto: 'As contas marcadas pro servidor e sem cadeado. Conta nova entra no plano do dia na hora (horário que já passou não roda); conta apagada, travada ou tirada do servidor sai. Rodar na mão continua valendo pra todas.',
  },
]

export function ComoFunciona() {
  return (
    <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-5">
      {ITENS.map((it, i) => {
        const Icon = it.icon
        return (
          <motion.div
            key={it.titulo}
            initial={{ opacity: 0, y: 6 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ delay: Math.min(i, 6) * 0.04, duration: 0.25 }}
            className="flex gap-3"
          >
            <div className="h-8 w-8 shrink-0 rounded-lg bg-surface2 border border-border flex items-center justify-center">
              <Icon className="h-4 w-4 text-primary-light" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-txt">{it.titulo}</p>
              <p className="text-xs text-txt-dim leading-relaxed mt-1">{it.texto}</p>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
