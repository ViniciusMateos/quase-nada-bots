# Referência de API — DM pros seguidores (worker `dm_followers`)

> Extraído de captura Fiddler real (`insta-curtida-mensagem-pesquisaperfil.saz`).
> Mesma abordagem do like-bot: chamadas via página logada (Playwright / WebView).
> Sem segredos aqui — `fb_dtsg`/`sessionid`/etc. vêm da sessão logada em runtime.

## Constantes (iguais ao like-bot)
- `X-IG-App-ID: 936619743392459` · `X-ASBD-ID: 359341`
- GraphQL boilerplate: `fb_dtsg`, `lsd`, `jazoest`, `av`, `__a=1` (extraídos da página)

## Fluxo de envio (2 passos + lookup)

### 1. username → pk (id do usuário)
- `PolarisProfilePageContentQuery` — `doc_id=26672929172408668` (POST /api/graphql)
  - Resposta traz `username` + `pk`/`id`. Ex: `clevss_` → `48814321494`.
- (Se a lista de seguidores/notificações já trouxer o pk, pula esse passo.)
- (Opcional) `PolarisProfileDirectOrPartnershipInboxMessageEligibilityQuery`
  `doc_id=25978531468488868` — checa se dá pra mandar DM pro perfil.

### 2. Criar / abrir a thread
- `POST https://www.instagram.com/api/v1/direct_v2/create_group_thread/`
- `Content-Type: application/x-www-form-urlencoded`
- Body: `recipient_users=["<pk>"]&fb_dtsg=<...>&jazoest=<...>`
  (funciona pra 1 destinatário só, apesar do nome "group")
- Resposta JSON: `{ "status":"ok", "thread_id":"340282...", "thread_v2_id":"1774817340235710", "users":[{pk,username}], ... }`
- **Usar o `thread_v2_id`** no passo 3 (NÃO o `thread_id` gigante).

### 3. Enviar o texto — `IGDirectTextSendMutation`
- `POST https://www.instagram.com/api/graphql` — `doc_id=26911679871773184`
- `variables`:
```json
{
  "ig_thread_igid": "<thread_v2_id do passo 2>",
  "offline_threading_id": "<número aleatório grande, único por msg>",
  "recipient_igids": null,
  "text": { "sensitive_string_value": "<MENSAGEM>" },
  "mentions": [],
  "mentioned_user_ids": [],
  "send_attribution": "igd_web_chat_tab:in_thread"
}
```
- `offline_threading_id`: id gerado no cliente (qualquer inteiro grande único).
- O `@brechoquasenadaa` no texto é texto puro — `mentions` fica `[]` mesmo.

## Template da mensagem (1ª linha = @ da pessoa)
```
{username}

Siga o @brechoquasenadaa pra acompanhar os próximos drops!!

Primeira compra no brechó tem desconto de 10% em qualquer item!
```
→ trocar `{username}` pelo @ do destinatário. (Bom: variar o texto/spintax pra reduzir flag de spam.)

## 0. Lista de "quem me seguiu" — aba de notificações ✅
- `PolarisActivityFeedStoriesViewQuery` — **`POST https://www.instagram.com/graphql/query`**
  (atenção: `/graphql/query`, não `/api/graphql`) — `doc_id=26398841236455905`
- `variables = {"inbox_request_data":{},"pending_request_data":{}}`
  + boilerplate (fb_dtsg, lsd, jazoest, av, __a=1…). Retorna ~90 atividades de uma vez.
- Resposta: `data.xdt_activity_inbox.new_stories[]` + `old_stories[]`, cada item:
```json
{
  "__typename": "XDTActivityFeedStory",
  "type": 3,                                   // 3 = "começou a seguir você"
  "args": {
    "timestamp": 1782391155.16,                // ordenar por aqui (cronológico)
    "text": "me_rainb começou a seguir você.",
    "users": [{ "pk": "2210266788", "username": "me_rainb", "is_verified": false }]
  }
}
```
- **Filtrar** itens de follow: `type == 3` (ou `args.text` contém "começou a seguir").
  De cada um pega `args.users[0].pk` + `username` + `args.timestamp`.
- Retomada: ordena por timestamp (antigo→novo), processa, salva o último pk/timestamp,
  no próximo run só pega quem é mais novo que o salvo.
- (`POST /api/v1/news/inbox_seen/` apenas marca como visto — opcional.)

## Referência (capturado, NÃO usado agora)
- Like de post: `PolarisAPILikePostMutation` / `usePolarisLikeMediaXIGLikeMutation`.
- Follow (GraphQL): `usePolarisFollowMutation` `doc_id=26508036048874888`
  (alternativa ao `friendships/create` REST que o like-bot usa).
- Buscar destinatário: `direct_v2/ranked_recipients/`, `direct_v2/search_secondary/`.
