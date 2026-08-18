import ActivityKit
import WidgetKit
import SwiftUI

// ── identidade Quase Nada Bots ─────────────────────────────────────────────
let rosa = Color(red: 0.965, green: 0.247, blue: 0.576)      // #F63F93
let amarelo = Color(red: 0.969, green: 1.000, blue: 0.235)   // #F7FF3C
let roxo = Color(red: 0.506, green: 0.078, blue: 0.690)      // #8114B0

// Cor por bot — usada na barra/anel quando só um está rodando.
func corDoBot(_ bot: String) -> Color {
  switch bot {
  case "auto-follow": return rosa
  case "dm-followers": return amarelo
  default: return roxo
  }
}

// A cor do destaque: do bot quando é um só, rosa da marca quando é o conjunto.
func corDestaque(_ s: BotActivityAttributes.ContentState) -> Color {
  s.quantos == 1 ? corDoBot(s.bot) : rosa
}

// Logo NÍTIDA, IDÊNTICA à do brechó: template branco que PREENCHE o frame (usa só o alpha).
// A logo.png é branca; renderizar com .fit deixava sobra de borda e a marca parecia menor que
// a do brechó nos mesmos tamanhos — .renderingMode(.template) enche o anel igual lá.
// .interpolation(.high) mata o serrilhado do downscale (256px → ~10-54pt).
func logoQN(_ lado: CGFloat) -> some View {
  Image("qnlogo")
    .resizable()
    .interpolation(.high)
    .antialiased(true)
    .renderingMode(.template)
    .aspectRatio(contentMode: .fit)
    .foregroundColor(.white)
    .frame(width: lado, height: lado)
}

func pctFrac(_ p: Int) -> Double { Double(max(0, min(100, p))) / 100.0 }

/// Texto do trailing da ilha: "82%" com um bot, "3 · 62%" com vários (contagem + % junta).
/// Antes de medir vai reticência (deixar vazio deixava a ilha torta nos ~70s de abrir o navegador).
func compacto(_ s: BotActivityAttributes.ContentState) -> String {
  if !s.medido { return "···" }
  return s.quantos > 1 ? "\(s.quantos) · \(s.pct)%" : "\(s.pct)%"
}

// ── Anel de progresso (mesmo do brechó) — recebe a cor ─────────────────────
struct AnelProgresso<Conteudo: View>: View {
  let frac: Double          // 0…1 — 0 = ainda "começando" (total não medido)
  let cor: Color
  let lado: CGFloat
  let traco: CGFloat
  @ViewBuilder let dentro: () -> Conteudo

  var body: some View {
    ZStack {
      // trilho — inset(by: traco/2) mantém o traço DENTRO do frame (senão a ilha corta na direita)
      Circle().inset(by: traco / 2)
        .stroke(Color.white.opacity(0.16), lineWidth: traco)

      if frac >= 1 {
        // 100%: círculo FECHADO (sem ponta) — a ponta arredondada do fim "comia" o traço no topo
        Circle().inset(by: traco / 2).stroke(cor, lineWidth: traco)
      } else if frac > 0 {
        Circle().inset(by: traco / 2)
          .trim(from: 0, to: frac)
          .stroke(cor, style: StrokeStyle(lineWidth: traco, lineCap: .round))
          .rotationEffect(.degrees(-90))   // começa no topo, enche horário
      }

      dentro()
    }
    .frame(width: lado, height: lado)
    .animation(.easeOut(duration: 0.4), value: frac)   // enche animado a cada update
  }
}

// ── Lock screen ── anel grande com a % no miolo + título e sublabel do lado.
// 1 bot  → "Auto Follow" / "57/70 · seguindo".
// N bots → "3 bots rodando" / "Auto Follow · DM Followers" (os nomes), a % é a MÉDIA.
struct BotsLockView: View {
  let s: BotActivityAttributes.ContentState
  var frac: Double { s.medido ? pctFrac(s.pct) : 0 }
  var cor: Color { corDestaque(s) }

  var body: some View {
    HStack(spacing: 14) {
      AnelProgresso(frac: frac, cor: cor, lado: 54, traco: 5) {
        if s.medido {
          Text("\(s.pct)%")
            .font(.system(size: 15, weight: .heavy)).foregroundColor(.white).monospacedDigit()
        } else {
          logoQN(20)
        }
      }
      VStack(alignment: .leading, spacing: 3) {
        HStack(spacing: 7) {
          logoQN(16)
          Text(s.titulo).font(.headline).foregroundColor(.white).lineLimit(1)
        }
        if !s.label.isEmpty {
          Text(s.label).font(.caption).foregroundColor(.gray).lineLimit(1)
        }
      }
      Spacer()
    }
    .padding()
    .activityBackgroundTint(Color.black.opacity(0.9))
    .activitySystemActionForegroundColor(.white)
  }
}

@main
struct BotsWidgetBundle: WidgetBundle {
  var body: some Widget {
    BotsLiveActivity()
  }
}

struct BotsLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: BotActivityAttributes.self) { context in
      BotsLockView(s: context.state)
    } dynamicIsland: { context in
      let f = context.state.medido ? pctFrac(context.state.pct) : 0
      let c = corDestaque(context.state)
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          AnelProgresso(frac: f, cor: c, lado: 40, traco: 4) {
            if context.state.medido {
              Text("\(context.state.pct)%")
                .font(.system(size: 12, weight: .heavy)).foregroundColor(.white).monospacedDigit()
            } else {
              logoQN(18)
            }
          }
        }
        DynamicIslandExpandedRegion(.trailing) {
          // contagem de bots quando é o conjunto (o número + "bots"); vazio com um só
          if context.state.quantos > 1 {
            Text("\(context.state.quantos) bots")
              .font(.caption.bold()).foregroundColor(c)
          }
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(alignment: .leading, spacing: 3) {
            Text(context.state.titulo)
              .font(.caption.bold()).foregroundColor(.white).lineLimit(1)
            if !context.state.label.isEmpty {
              Text(context.state.label).font(.caption).foregroundColor(.gray).lineLimit(1)
            }
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          // respiro nas laterais: a curvatura do Dynamic Island expandido cortava o sublabel
          // colado na borda esquerda
          .padding(.horizontal, 6)
        }
      } compactLeading: {
        // compact fica igual — só a logo (nítida agora)
        logoQN(20)
      } compactTrailing: {
        // uma Live Activity só → a ilha fica sempre em compact; cabe contagem + % juntas
        Text(compacto(context.state)).foregroundColor(c)
      } minimal: {
        // só aparece se OUTRO app tiver uma Live Activity ao mesmo tempo
        AnelProgresso(frac: f, cor: c, lado: 25, traco: 2.6) { logoQN(12) }
      }
    }
  }
}
