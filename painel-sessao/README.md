# App no navegador + Painel de Sessão (local)

Roda o **app Quase Nada Bots dentro do navegador do PC** — uma cópia do app, com as mesmas
telas e os mesmos dados ao vivo (Hub, contas por grupo, rodar bots, logs, histórico, cronograma).
É o mesmo código do app (Expo) compilado pra web; o que é só-de-iPhone (Live Activity e push)
fica de fora. O login/reconexão do Instagram é feito por um Chromium de verdade dirigido pelo
Playwright (porque o navegador não consegue ler o cookie `sessionid`, que é httpOnly).

## Rodar

Duplo-clique em **`iniciar.bat`** (ou `python painel_sessao.py`).
Abre sozinho em **http://127.0.0.1:8777** — o app completo.

- App completo: `http://127.0.0.1:8777/`
- Painel simples só de reconexão (lista enxuta): `http://127.0.0.1:8777/painel`

## Reconectar uma conta (login do Instagram)

1. No app (ou no `/painel`), toque em **reconectar** numa conta com *sessão caiu*.
2. Abre uma janela de Chromium no login do Instagram (o `@` já vem preenchido).
3. **Faça o login na mão** (resolva captcha/verificação por e-mail se o IG pedir — isso o
   painel **não** faz por você, de propósito: pular verificação limita a conta).
4. Quando estiver **dentro da conta**, volte ao app → *"sessão detectada"* → **Conectar sessão**.
5. Os cookies vão pro backend (mesmo endpoint do app, `POST /instagram/session`), a conta vira
   ativa e o servidor valida. Toque em **sincronizar** pra ver o status verde.

## Criar conta nova no Instagram (`/criar`)

Facilitador pra criar contas: `http://127.0.0.1:8777/criar` (ou o link "+ Criar conta no IG"
no `/painel`). Ele:

1. **Gera os dados** — usuário (próximo número do seu padrão, ex: `quasenadasegue13`), senha
   forte, **email Gmail +alias** (`seuemail+usuario@gmail.com` — todos os códigos caem na mesma
   caixa), nome e um aniversário adulto. Tudo editável.
2. **Abre o cadastro do IG já preenchido** num Chromium (mesmo esquema do login: perfil
   persistente + automação mascarada). Você resolve **captcha** e **aniversário** na mão.
3. **Pega o código do email sozinho** (opcional) — com um **app password** do Gmail configurado,
   o painel lê a caixa por IMAP, acha o código de verificação do IG e **preenche sozinho** (e
   tenta avançar). Sem app password, você digita o código na janela.
4. **Salva a conta** — quando estiver dentro da conta, clica em *Salvar conta*: captura a sessão
   e registra a conta no backend (mesmo endpoint do login), guarda a credencial (user+senha, no
   mesmo storage do app → o login passa a autofillar) e põe no **grupo** escolhido.

A senha/credencial da conta IG fica só no navegador (localStorage, mesma origem do app).

**Setup do código automático (uma vez):** no Gmail, ligue a **verificação em 2 etapas** e o
**IMAP** (Gmail → Config → "Encaminhamento e POP/IMAP" → Ativar IMAP). Gere uma **senha de app**
em `myaccount.google.com/apppasswords` (16 letras) e cole no campo *App password do Gmail* do
`/criar` (o email base = seu Gmail). Fica salva local em `gmail_config.json` (gitignored) ou nas
envs `QN_GMAIL_USER`/`QN_GMAIL_APP_PASSWORD`. O painel lê por IMAP só pra achar o código do IG.

## Atualizar o app (depois de mudar o código do app)

O app servido na web é um **build** (pasta `frontend/dist-web`). Quando você mexer no código do
app e quiser refletir na web, rode **`atualizar-app.bat`** (ou
`cd frontend && npx expo export --platform web --output-dir dist-web`) e reinicie o `iniciar.bat`.
O app no celular continua igual (OTA/EAS) — isto é só a versão web.

## Como funciona (resumo técnico)

- O servidor local (`painel_sessao.py`, FastAPI) serve o app exportado em `/` e expõe os
  endpoints do helper de login (`/api/abrir`, `/api/status`, `/api/conectar`, `/api/fechar`),
  que dirigem um Chromium pelo Playwright pra capturar a sessão.
- O app fala com o backend de produção direto (`https://quasenadaserver2.duckdns.org/bots`), com
  a URL+token embutidos no build (lidos do `frontend/.env.local` na hora de exportar). O token do
  helper nunca vai pro HTML do `/painel` — fica no servidor local.
- Partes nativas viram no-op gracioso na web via variantes `.web` (o Metro escolhe
  `arquivo.web.tsx` automaticamente): `push.web.ts`, `credenciais.web.ts` (localStorage no lugar
  do Keychain), `InstagramLoginScreen.web.tsx` (usa o helper Playwright). Live Activity e push
  não existem na web.

## Config (automática)

Sem configurar nada: lê a URL do backend e o token do `../frontend/.env.local`. Sobrescreve por
env: `QN_BACKEND_URL` / `QN_TOKEN` / `QN_PANEL_PORT` (padrão `8777`). No app web, o helper de
login é `EXPO_PUBLIC_PAINEL_URL` (padrão `http://127.0.0.1:8777`, embutido no build).

## Requisitos (já instalados nesta máquina)

- Python 3.12 com `playwright` (+ Chromium), `fastapi`, `uvicorn`.
- Node + as deps web do Expo (`react-dom`, `react-native-web`, `@expo/metro-runtime`).
- Se faltar o navegador do Playwright: `python -m playwright install chromium`.

## Observações

- O login acontece pelo **IP do PC** (igual o celular loga pelo IP dele). A checagem/execução no
  servidor continua saindo pelo túnel residencial — a sessão é portável.
- Só serve em `127.0.0.1` (local). Não exponha essa porta pra rede.
