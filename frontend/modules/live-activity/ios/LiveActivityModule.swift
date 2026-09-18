import ExpoModulesCore
import ActivityKit
import Foundation

public class LiveActivityModule: Module {
  // evita observadores duplicados; e guarda quais activities já estão sendo ouvidas
  private var observando = false
  private var idsObservados = Set<String>()
  // URL base + token da API, pra POSTAR o token DIRETO do nativo (funciona com o app fechado,
  // quando o iOS acorda o app em background só pra entregar o token — o JS/RN pode nem bootar).
  private var apiBase = ""
  private var apiToken = ""
  private let defaults = UserDefaults.standard

  public func definition() -> ModuleDefinition {
    Name("LiveActivity")
    // onToken = token de UPDATE de uma activity; onPushToStart = pushToStartToken do app.
    Events("onToken", "onPushToStart")

    // Lê a config persistida e JÁ começa a observar no boot do módulo (nativo) — assim, quando o
    // iOS acorda o app em background por causa de uma LA criada por push-to-start, o token é
    // capturado e postado DIRETO, sem depender do JS rodar.
    OnCreate {
      self.apiBase = self.defaults.string(forKey: "la_api_base") ?? ""
      self.apiToken = self.defaults.string(forKey: "la_api_token") ?? ""
      self.startObserving()
    }

    // O JS passa a URL base + token (do env) UMA vez; a gente persiste pra usar em background.
    Function("configurar") { (baseUrl: String, token: String) in
      self.apiBase = baseUrl
      self.apiToken = token
      self.defaults.set(baseUrl, forKey: "la_api_base")
      self.defaults.set(token, forKey: "la_api_token")
    }

    // device suporta + usuário deixou ligado?
    Function("disponivel") { () -> Bool in
      if #available(iOS 16.2, *) {
        return ActivityAuthorizationInfo().areActivitiesEnabled
      }
      return false
    }

    // Id da Live Activity VIVA (ou "" se não tem). Só conta .active (a morta some ~4s depois).
    Function("atual") { () -> String in
      guard #available(iOS 16.2, *) else { return "" }
      return Activity<BotActivityAttributes>.activities
        .first(where: { $0.activityState == .active })?.id ?? ""
    }

    // Idempotente; o JS chama no boot também (redundante com o OnCreate, sem problema).
    Function("observar") {
      self.startObserving()
    }

    // Inicia A Live Activity do app (fluxo MANUAL — o tap do usuário). Devolve o id, ou "".
    AsyncFunction("start") { (titulo: String) -> String in
      guard #available(iOS 16.2, *),
            ActivityAuthorizationInfo().areActivitiesEnabled else { return "" }
      let attrs = BotActivityAttributes(app: "bots")
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

    // Encerra a Live Activity do app (limpar órfã antes de criar outra).
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

  private func startObserving() {
    if observando { return }
    observando = true
    if #available(iOS 17.2, *) {
      Task { [weak self] in
        for await data in Activity<BotActivityAttributes>.pushToStartTokenUpdates {
          let hex = data.map { String(format: "%02x", $0) }.joined()
          self?.sendEvent("onPushToStart", ["token": hex])
          self?.postToken("/liveactivity/pts", ["token": hex, "bundle": self?.bundleId() ?? ""])
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

  // Observa o token de update de UMA activity (uma vez por id): emite onToken pro JS E posta
  // DIRETO no server (o direto é o que faz a barra andar com o app fechado).
  @available(iOS 16.2, *)
  private func ouvirToken(_ activity: Activity<BotActivityAttributes>) {
    if idsObservados.contains(activity.id) { return }
    idsObservados.insert(activity.id)
    Task { [weak self] in
      for await tokenData in activity.pushTokenUpdates {
        let hex = tokenData.map { String(format: "%02x", $0) }.joined()
        self?.sendEvent("onToken", ["token": hex, "id": activity.id])
        self?.postToken("/liveactivity",
                        ["token": hex, "bundle": self?.bundleId() ?? "", "activity_id": activity.id])
      }
    }
  }

  private func bundleId() -> String {
    return Bundle.main.bundleIdentifier ?? ""
  }

  // POST fire-and-forget pro server (best-effort). Só roda se já tiver URL+token configurados.
  private func postToken(_ path: String, _ body: [String: Any]) {
    guard !apiBase.isEmpty, !apiToken.isEmpty,
          let url = URL(string: apiBase + path),
          let data = try? JSONSerialization.data(withJSONObject: body) else { return }
    var req = URLRequest(url: url)
    req.httpMethod = "POST"
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.setValue("Bearer " + apiToken, forHTTPHeaderField: "Authorization")
    req.httpBody = data
    URLSession.shared.dataTask(with: req).resume()
  }
}
