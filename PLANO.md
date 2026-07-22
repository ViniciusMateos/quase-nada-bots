# IG Automations Hub — Plano

> Hub pessoal de automações do Instagram: um **app de celular** (controle remoto) +
> um **backend** que roda os bots num servidor/PC. Repo **privado**.
> Status: **planejamento** (a conta principal está em checkpoint — bom momento pra
> construir a estrutura, que não toca no IG).

---

## 1. Objetivo

Centralizar várias automações pessoais de Instagram num só lugar, controláveis pelo
celular, reaproveitando a base já feita no [`auto-follow-instagram`](../auto-follow-instagram/).

## 2. Automações

| Worker | Status | O que faz |
|--------|--------|-----------|
| `follow_likers` | ✅ **feito** (vira o 1º worker) | Segue os curtidores dos posts de um grupo de DM, reage ❤️, retoma de onde parou |
| `dm_followers` | 🔜 planejado | Manda DM pros seguidores novos (welcome msg), retomando do último processado |
| `post_story` | 🔜 planejado | Posta o mesmo story em 2+ contas |

## 3. API oficial — o que dá e o que NÃO dá

A API oficial da Meta (Graph API / Instagram API with Login) exige conta **Business/
Creator** + app na Meta + app review. Mesmo assim:

- **DM proativo pros seguidores → ❌ não existe.** Só dá pra responder quem te mandou
  DM nas últimas 24h. A lista de "quem seguiu por último" também não é exposta.
- **Postar story → ⚠️ só conta Business** (Content Publishing API, mídia em URL público).
- **Novos seguidores → ❌** a API dá só contagem, não a lista de usuários.

**Conclusão:** `dm_followers` e o "pega quem seguiu na aba de notificações" **só dá pela
API interna do app logado** (mesma abordagem do `follow_likers`: Playwright + `fetch`
na página logada). `post_story` pode ser oficial só se for Business; senão, interna também.

## 4. Arquitetura e padrão de repositórios

**Padrão:** os workers vivem fisicamente dentro de `workers/` (pra rodar tudo junto),
mas **cada worker é o SEU PRÓPRIO repositório** e o `workers/` está no `.gitignore` do
hub. O **repo do hub** versiona só o desenvolvimento do **app** (e o core/backend/docs).

```
ig-automations-hub/            ← REPO PRÓPRIO (desenvolvimento do app)
  .gitignore                   ← ignora workers/
  PLANO.md  DM_API_REFERENCE.md
  app/         React Native + Expo: painel de controle (não roda o bot no celular,
               só comanda / mostra saldo e logs)
  core/        (futuro) base compartilhada extraída dos workers:
               sessão Playwright, safety (caps/delays/kill-switch/fmt_tempo),
               state/retomada, ig_client, import de cookies
  backend/     (opcional, p/ rodar 24/7) FastAPI orquestrando os workers
  workers/                     ← GITIGNORED no hub — cada um tem repo próprio
    auto-follow-instagram/       ← repo: ViniciusMateos/auto-follow-instagram  ✅ (v1.0.1)
    dm_followers/              ← repo próprio (a criar)
    post_story/                ← futuro
```

- O **app é controle remoto.** A automação roda no PC/servidor (precisa de browser real)
  — ou, app-first, dentro de um **WebView logado** no próprio app (sem backend; melhor IP).
- Stack já familiar (CLAUDE.md): **FastAPI** no backend, **React Native + Expo** no app.

## 5. Decisão-chave: login = SESSÃO, não senha

**Não** guardar login+senha no banco. Motivos:
- Login programático com senha dispara **checkpoint/2FA** quase sempre (já comprovado).
- Senha no servidor = se vazar, as contas vão junto.

**Padrão correto** (o `follow_likers` já faz): logar **uma vez** numa janela/webview →
salvar o **cookie de sessão** (criptografado) → os workers reusam. Expirou, pede de novo.
Cada conta = uma sessão salva (ex: 2 contas de story = 2 sessões).

## 6. Padrão de retomada (já pronto)

O usuário define o ponto de início na 1ª vez (ex: de qual seguidor começar, do mais
antigo pro mais recente); ao terminar a lista, salva o último; no próximo run retoma de
onde parou. **Isso já existe** no `state.json` do `follow_likers` — é genérico, serve
pros três workers.

## 7. Segurança / ban (por worker)

Cada automação tem seu perfil de risco. Caps **independentes** por worker e por conta:

- `follow_likers`: teto de ruptura observado ~600–900 follows/dia (deu checkpoint).
  Sustentável: bem abaixo (30–60/dia, delays 30s+).
- `dm_followers`: **maior risco de todos.** DM em massa é o sinal de spam nº 1.
  Exige: caps minúsculos (20–40/dia), mensagem **variada** (spintax), delays grandes.
- `post_story`: risco menor, mas evitar postar idêntico em 2 contas no mesmo segundo.
- **Não empilhar tudo na mesma conta.** Distribuir automações entre contas.
- Kill-switch global: qualquer bloqueio (feedback_required/spam/429/checkpoint HTML)
  para o worker e registra o saldo — já implementado no core.

## 8. Roadmap (fases)

1. **Core compartilhado** — extrair sessão/safety/state/ig_client do `follow_likers`
   pra um pacote reutilizável. Migrar o `follow_likers` pra usar o core.
2. **Backend FastAPI** — registro de workers, gestão de sessões (login-once), endpoints
   start/stop/status/saldo/logs.
3. **App RN/Expo** — painel: lista de automações, botão liga/desliga, saldo e log ao vivo.
4. **Worker `dm_followers`** — pega novos seguidores (API interna) + DM com retomada +
   spintax + caps minúsculos.
5. **Worker `post_story`** — upload de mídia + post em N contas.

## 9. Decisões em aberto

- Onde roda o backend? (PC sempre ligado / VPS / Raspberry).
- Como o app autentica no SEU backend (não no IG) — token simples já resolve.
- Multi-conta: 1 sessão por conta; quais automações em quais contas.
- Story: tentar via API oficial (Business) ou ir de interna mesmo?
