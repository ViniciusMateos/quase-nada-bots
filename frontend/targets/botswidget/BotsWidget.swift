import ActivityKit
import WidgetKit
import SwiftUI

// ── identidade Quase Nada Bots (o gradiente do ícone) ──────────────────────
let rosa = Color(red: 0.965, green: 0.247, blue: 0.576)      // #F63F93
let amarelo = Color(red: 0.969, green: 1.000, blue: 0.235)   // #F7FF3C
let roxo = Color(red: 0.506, green: 0.078, blue: 0.690)      // #8114B0

// Cor por bot — usada nas linhas da lista e na barra quando só um está rodando.
func corDoBot(_ bot: String) -> Color {
  switch bot {
  case "auto-follow": return rosa
  case "dm-followers": return amarelo
  default: return roxo
  }
}

// Gradiente da marca: a barra do CONJUNTO não é de nenhum bot, então usa a identidade.
let gradienteMarca = LinearGradient(
  gradient: Gradient(colors: [roxo, rosa]),
  startPoint: .leading, endPoint: .trailing
)

// Logo da marca (cachorro dentro do círculo), BRANCA — igual ao Brechó. É o logo, não o
// ícone do app: sem o quadrado do gradiente, que num card escuro vira um adesivo colado.
func logoQN(_ lado: CGFloat) -> some View {
  Image("qnlogo")
    .resizable()
    .renderingMode(.template)
    .aspectRatio(contentMode: .fit)
    .foregroundColor(.white)
    .frame(width: lado, height: lado)
}

func pctFrac(_ p: Int) -> Double { Double(max(0, min(100, p))) / 100.0 }

// A cor do destaque: de um bot quando é um só, da marca quando é o conjunto.
func corDestaque(_ s: BotActivityAttributes.ContentState) -> Color {
  s.quantos == 1 ? corDoBot(s.bot) : rosa
}

/// Texto do trailing da ilha: "82%" com um bot, "3 · 62%" com vários.
/// Antes de medir vai reticência — deixar vazio faria a ilha ficar torta (logo de um lado,
/// buraco do outro) durante os ~70s em que o bot abre o navegador e loga.
func compacto(_ s: BotActivityAttributes.ContentState) -> String {
  if !s.medido { return "···" }
  return s.quantos > 1 ? "\(s.quantos) · \(s.pct)%" : "\(s.pct)%"
}

/// Barra fina de um bot dentro da lista (só aparece quando há 2+ rodando).
struct LinhaView: View {
  let linha: LinhaBot

  var body: some View {
    HStack(spacing: 8) {
      Text(linha.nome)
        .font(.system(size: 11, weight: .semibold))
        .foregroundColor(Color.white.opacity(0.78))
        .lineLimit(1)
        .frame(width: 82, alignment: .leading)
      ProgressView(value: pctFrac(linha.pct))
        .tint(corDoBot(linha.bot))
        .scaleEffect(x: 1, y: 0.6, anchor: .center)
      Text("\(linha.pct)%")
        .font(.system(size: 10, weight: .bold))
        .foregroundColor(Color.white.opacity(0.78))
        .monospacedDigit()
        .frame(width: 30, alignment: .trailing)
    }
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
      // ── Lock screen ──
      // Um card só, mesmo com N bots: cabeçalho com o resumo e uma linha por bot embaixo.
      // Mesma cara da barrinha flutuante dentro do app.
      VStack(alignment: .leading, spacing: 9) {
        HStack(spacing: 9) {
          logoQN(24)
          Text(context.state.titulo)
            .font(.headline).foregroundColor(.white).lineLimit(1)
          Spacer()
          if context.state.medido {
            Text("\(context.state.pct)%")
              .font(.headline.bold()).foregroundColor(corDestaque(context.state))
          }
        }
        // barra ZERADA enquanto não mediu (evita barra "meio cheia" falsa)
        GeometryReader { geo in
          ZStack(alignment: .leading) {
            Capsule().fill(Color.white.opacity(0.16))
            Capsule()
              .fill(context.state.quantos > 1
                    ? AnyShapeStyle(gradienteMarca)
                    : AnyShapeStyle(corDoBot(context.state.bot)))
              .frame(width: geo.size.width * (context.state.medido ? pctFrac(context.state.pct) : 0))
          }
        }
        .frame(height: 6)

        if context.state.linhas.isEmpty {
          Text(context.state.label).font(.caption).foregroundColor(.gray).lineLimit(1)
        } else {
          VStack(spacing: 5) {
            ForEach(context.state.linhas, id: \.id) { linha in
              LinhaView(linha: linha)
            }
          }
        }
      }
      .padding()
      .activityBackgroundTint(Color.black.opacity(0.9))
      .activitySystemActionForegroundColor(.white)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          logoQN(28)
        }
        DynamicIslandExpandedRegion(.trailing) {
          if context.state.medido {
            Text(compacto(context.state))
              .font(.title3.bold()).foregroundColor(corDestaque(context.state))
          }
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(alignment: .leading, spacing: 5) {
            Text(context.state.titulo)
              .font(.caption.bold()).foregroundColor(.white).lineLimit(1)
            ProgressView(value: context.state.medido ? pctFrac(context.state.pct) : 0)
              .tint(corDestaque(context.state))
            if context.state.linhas.isEmpty {
              Text(context.state.label).font(.caption).foregroundColor(.gray).lineLimit(1)
            } else {
              ForEach(context.state.linhas, id: \.id) { linha in
                LinhaView(linha: linha)
              }
            }
          }
        }
      } compactLeading: {
        logoQN(20)
      } compactTrailing: {
        // Existe UMA Live Activity, então a ilha fica sempre aqui (nunca em minimal) e
        // cabe o número de bots + a porcentagem juntos.
        Text(compacto(context.state))
          .foregroundColor(corDestaque(context.state))
      } minimal: {
        // Só acontece se OUTRO app tiver uma Live Activity ao mesmo tempo.
        ZStack {
          Circle().stroke(Color.white.opacity(0.18), lineWidth: 2.2)
          Circle()
            .trim(from: 0, to: context.state.medido ? pctFrac(context.state.pct) : 0)
            .stroke(corDestaque(context.state), style: StrokeStyle(lineWidth: 2.2, lineCap: .round))
            .rotationEffect(.degrees(-90))
          logoQN(13)
        }
        .frame(width: 25, height: 25)
      }
    }
  }
}
