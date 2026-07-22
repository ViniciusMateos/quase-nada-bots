import ExpoModulesCore
import ActivityKit

public class LiveActivityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LiveActivity")
    Events("onToken")

    // device suporta + usuário deixou ligado?
    Function("disponivel") { () -> Bool in
      if #available(iOS 16.2, *) {
        return ActivityAuthorizationInfo().areActivitiesEnabled
      }
      return false
    }

    // Id da Live Activity VIVA (ou "" se não tem). O JS usa pra decidir se precisa criar:
    // se já existe UMA e é a que ele está observando, não mexe.
    //
    // ⚠️ SÓ conta activity .active: quando a LA encerra (server manda push `end`), o iOS a
    // mantém em .ended/.dismissed por ~4s antes de remover. Sem filtrar por .active, o `atual`
    // devolvia o id da LA MORTA nessa janela → o garantirLA achava que ainda existia e NÃO
    // criava outra → o run seguinte rodava SEM barra no lock screen. Filtrando, a LA morta
    // vira "" e o app cria uma nova na hora.
    Function("atual") { () -> String in
      guard #available(iOS 16.2, *) else { return "" }
      return Activity<BotActivityAttributes>.activities
        .first(where: { $0.activityState == .active })?.id ?? ""
    }

    // Inicia A Live Activity do app (só existe uma) e devolve o id, ou "" se não rolou.
    // String não-opcional de propósito: é o formato de retorno que já compila neste setup.
    //
    // O token chega DEPOIS (1-3s) e pode rotacionar a qualquer momento — por isso o
    // evento onToken, nunca um setTimeout. Como só existe uma activity, o token que chega
    // é sempre dela: não precisa carimbar de quem é.
    AsyncFunction("start") { (titulo: String) -> String in
      guard #available(iOS 16.2, *),
            ActivityAuthorizationInfo().areActivitiesEnabled else { return "" }
      let attrs = BotActivityAttributes(app: "bots")
      // medido=false → o widget mostra "começando" (sem barra falsa nem 0%)
      let state = BotActivityAttributes.ContentState(
        titulo: titulo, pct: 0, medido: false, label: "começando",
        quantos: 1, bot: "", linhas: [])
      do {
        let activity = try Activity.request(
          attributes: attrs,
          content: .init(state: state, staleDate: nil),
          pushType: .token
        )
        Task { [weak self] in
          for await tokenData in activity.pushTokenUpdates {
            let hex = tokenData.map { String(format: "%02x", $0) }.joined()
            self?.sendEvent("onToken", ["token": hex])
          }
        }
        return activity.id
      } catch {
        return ""
      }
    }

    // Encerra a Live Activity do app. Normalmente quem encerra é o SERVER (push `end`),
    // que funciona com o app fechado; isto aqui é pra limpar órfã antes de criar outra.
    AsyncFunction("endAll") { (promise: Promise) in
      guard #available(iOS 16.2, *) else { promise.resolve(nil); return }
      Task {
        for activity in Activity<BotActivityAttributes>.activities {
          await activity.end(nil, dismissalPolicy: .immediate)
        }
        promise.resolve(nil)
      }
    }
  }
}
