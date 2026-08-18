# Backlog — Quase Nada Bots

Ideias/ajustes anotados pra pegar depois. Não implementados ainda.

---

_(vazio no momento)_

---

## Concluído

### Seletor de conta na página de rodar (BotScreen) — 14/08/2026
Na tela de rodar (todos os bots): botão **"Rodar com @conta"** mostrando a conta ativa, card
de **Conta** no topo com botão **trocar** → popup `SeletorConta` (`frontend/src/ui/SeletorConta.tsx`,
padrão do Hub: lista com status de sessão colorido, ordenada por `cmpTexto`). Escolher conta com
sessão viva → `api.ativarConta`; sem sessão/caída → `InstagramLogin` (login preenchido). Só JS (OTA).
