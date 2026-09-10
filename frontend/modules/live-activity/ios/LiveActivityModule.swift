import ExpoModulesCore
import ActivityKit

public class LiveActivityModule: Module {
  // evita observadores duplicados (observar() idempotente; token por activity só uma vez)
  private var observando = false
  private var idsObservados = Set<String>()

  public func definition() -> ModuleDefinition {
    Name("LiveActivity")
    // onToken = token de UPDATE de uma activity (o server atualiza/encerra a barra)
    // onPushToStart = pushToStartToken do app (o server INICIA a barra sozinho, app fechado)
    Events("onToken", "onPushToStart")

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

    // Liga os observadores GLOBAIS. Chame no boot do app (idempotente):
    //   (1) pushToStartToken (iOS 17.2+) → onPushToStart → o server pode CRIAR a LA sozinho
    //       (ex: o cronograma auto-rodando o aquecimento, com o app fechado);
    //   (2) token de update de QUALQUER activity — inclui as que o server iniciou via push —
    //       → onToken → o server consegue atualizar/encerrar a barra que ele mesmo criou.
    Function("observar") {
      if self.observando { return }
      self.observando = true
      if #available(iOS 17.2, *) {
        Task { [weak self] in
          for await data in Activity<BotActivityAttributes>.pushToStartTokenUpdates {
            let hex = data.map { String(format: "%02x", $0) }.joined()
            self?.sendEvent("onPushToStart", ["token": hex])
          }
        }
      }
      if #available(iOS 16.2, *) {
        for activity in Activity<BotActivityAttributes>.activities {
          self.ouvirToken(activity)
        }
        Task { [weak self] in
          for await activity in Activity<BotActivityAttributes>.activityUpdates {
            self?.ouvirToken(activity)
          }
        }
      }
    }

    // Inicia A Live Activity do app (fluxo MANUAL — o tap do usuário). Devolve o id, ou "".
    // O token de update chega pelo observador (onToken). push-to-start é o caminho automático.
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
        self.ouvirToken(activity)
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

  // Observa o token de update de UMA activity (uma vez por id) e emite onToken {token, id}.
  @available(iOS 16.2, *)
  private func ouvirToken(_ activity: Activity<BotActivityAttributes>) {
    if idsObservados.contains(activity.id) { return }
    idsObservados.insert(activity.id)
    Task { [weak self] in
      for await tokenData in activity.pushTokenUpdates {
        let hex = tokenData.map { String(format: "%02x", $0) }.joined()
        self?.sendEvent("onToken", ["token": hex, "id": activity.id])
      }
    }
  }
}
