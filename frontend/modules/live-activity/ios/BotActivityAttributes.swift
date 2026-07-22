import Foundation
import ActivityKit

// ⚠️ ESTE ARQUIVO TEM QUE SER IDÊNTICO ao de targets/botswidget/BotActivityAttributes.swift.
// O ActivityKit casa a activity do app com o widget pelo NOME do tipo + shape do ContentState.
// Se divergir, a Live Activity simplesmente não aparece — sem erro nenhum.
//
// ARQUITETURA: UMA Live Activity pro app inteiro, não uma por bot.
// O que decide se a Dynamic Island fica espaçosa (compact) ou vira bolinha apertada
// (minimal) é QUANTAS Live Activities existem — não o nosso código. Com uma só, a ilha
// fica sempre em compact, cabendo o número de bots E a porcentagem. E some a necessidade
// de rotear token por activityId: não existe token pra cruzar quando só há um.
//
// Por isso quase tudo vive no ContentState (mutável): o card MUDA DE CARA conforme os bots
// entram e saem — "Auto Follow · 82%" com um, "3 bots rodando · 62%" com vários. Attributes
// é imutável, então só guarda o que nunca muda.

/// Uma linha da lista (um bot rodando). Só usada quando há 2+.
///
/// `id` é o id da RUN, e existe porque nem `bot` nem `nome` são únicos: conectar o
/// Instagram fura o guard de 1-run-por-bot (dois runs com bot="auto-follow"), e duas
/// conexões teriam o mesmo nome. ForEach com id repetido é comportamento indefinido.
struct LinhaBot: Codable, Hashable {
  var id: String     // id da run — único por construção
  var bot: String    // id do bot ("auto-follow") → define a cor no widget
  var nome: String   // rótulo humano ("Auto Follow")
  var pct: Int
}

struct BotActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var titulo: String       // "Auto Follow" (1) | "3 bots rodando" (N)
    var pct: Int             // % do bot único, ou a MÉDIA de todos
    var medido: Bool         // já sabe o tamanho da fila? senão: barra zerada + status
    var label: String        // "57/70 · seguindo" (1) | "" (N — as linhas dizem tudo)
    var quantos: Int         // quantos bots rodando agora
    var bot: String          // id do bot único → cor (vazio quando são vários)
    var linhas: [LinhaBot]   // uma por bot (vazio quando é um só)
  }

  var app: String   // fixo; existe só porque ActivityAttributes precisa de algo imutável
}
