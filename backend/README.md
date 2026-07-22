# Quase Nada Bots — Backend (API)

FastAPI que orquestra os bots (`auto-follow`, `dm-followers`) como subprocessos, faz
**stream do log ao vivo** via WebSocket e gerencia modos/chats.
É a ponte entre o app React Native e os bots rodando na Oracle.

## Rodar local

```bash
pip install -r requirements.txt
BOTS_API_TOKEN=algumtoken uvicorn app:app --reload --port 8010
```

Auth: header `Authorization: Bearer <BOTS_API_TOKEN>` (no WebSocket use `?token=`).

## Variáveis de ambiente

| Var | Default | Pra quê |
|---|---|---|
| `BOTS_API_TOKEN` | `troca-esse-token-na-oracle` | token da API |
| `WORKERS_DIR` | `../workers` | onde estão os bots |
| `PYTHON_BIN` | python atual | python que roda os bots (venv na Oracle) |
| `MAX_LOG_LINES` | 3000 | buffer de log por run |

## Endpoints

| Método | Rota | O quê |
|---|---|---|
| GET | `/health` | status + bots |
| GET | `/bots` | lista os bots |
| GET/PUT | `/bots/{bot}/modos` | lê/grava os modos (`perfis.json`) |
| GET/POST | `/bots/{bot}/chats` | lê/adiciona chats (`chats.json`) |
| DELETE | `/bots/{bot}/chats/{nome}` | remove chat |
| POST | `/runs` | inicia run: `{bot, params:{modo,chat,dry_run,limite,...}}` |
| GET | `/runs` | lista runs (ativos + recentes) |
| GET | `/runs/{id}` | detalhe + últimas linhas de log |
| POST | `/runs/{id}/stop` | para o run (mata o processo) |
| WS | `/runs/{id}/logs?token=` | **log ao vivo** (manda histórico + tempo real) |

## Arquitetura

```
app.py          FastAPI (rotas + WebSocket + auth)
run_manager.py  spawna o bot, captura stdout, broadcast pros assinantes, parar
bots.py         registro dos bots + monta a CLI + lê/grava modos/chats
settings.py     config via env
```

Cada run = um `python main.py <flags>` rodando no diretório do bot. Suporta
runs simultâneos e parar pelo `/stop`.
