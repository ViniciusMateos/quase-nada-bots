import { baseUrl, http } from '@/lib/apiClient';
import { env } from '@/config/env';

export type Bot = {
  nome: string; dir: string; tem_modos: boolean; tem_chats: boolean; descricao: string;
};
export type Progresso = { done: number; total: number; label: string };
// pausa em contagem regressiva: `ate` = epoch (segundos) em que a pausa acaba → o app ticka
export type Espera = { ate: number; restam: number; motivo: string };
export type RunInfo = {
  id: string; bot: string; status: string; started_at: number;
  // nome do PROCESSO, não do bot: "Auto Follow" ao rodar, "Conectando Instagram" ao
  // importar a sessão. É o que o widget flutuante e a Live Activity exibem.
  titulo?: string;
  ended_at?: number | null; returncode?: number | null; params: Record<string, unknown>;
  linhas: number; progress?: Progresso | null;
  status_log?: string | null;   // a LINHA VIVA do log (o que está logando agora) — mostrada
                                 // embaixo do nome na home e no widget flutuante
  espera?: Espera | null;        // se em pausa, a contagem regressiva (o app ticka em cima)
};
export type RunDetail = RunInfo & { log: string[] };
export type LoteInfo = { lote: true; bot: string; total: number; contas: string[]; run_id?: string };
export type Chat = { nome: string; thread_id: string };
export type IgCookie = {
  name: string; value: string; domain?: string; path?: string;
  httpOnly?: boolean; secure?: boolean; sameSite?: string; session?: boolean; expirationDate?: number;
};
export type ConnectResult = { runs: { bot: string; id: string }[]; conta?: Account };
export type Account = {
  id: string; label: string; conectada_em: number; ativa: boolean;
  criada_em?: number;   // 1ª conexão — NÃO reseta ao reconectar (idade real da conta)
  sessao_ok?: boolean;  // só no /accounts/validar: sessão do IG ainda viva?
};
export type RunHistorico = {
  id: string; bot: string; dry_run: boolean;
  started_at: number | null; ended_at: number | null; duracao_s: number | null;
  status: string; bloqueio: boolean; saldo: Record<string, number | string>; backfill?: boolean;
  conta?: string | null;   // @username da conta IG usada na run
};

export type CronTarefa = {
  conta_id?: string; conta: string; bot: string; modo: string; desc: string;
  hora: number; min: number; enviado: boolean;
};
export type Cronograma = { ativo: boolean; data: string; tarefas: CronTarefa[] };

export const api = {
  listBots: () => http.get<Record<string, Bot>>('/bots'),
  getModos: (bot: string) => http.get<Record<string, Record<string, unknown>>>(`/bots/${bot}/modos`),
  putModos: (bot: string, modos: unknown) => http.put(`/bots/${bot}/modos`, modos),
  getChats: (bot: string) => http.get<Chat[]>(`/bots/${bot}/chats`),
  addChat: (bot: string, nome: string, thread_id: string) => http.post<Chat>(`/bots/${bot}/chats`, { nome, thread_id }),
  delChat: (bot: string, nome: string) => http.del(`/bots/${bot}/chats/${encodeURIComponent(nome)}`),
  startRun: (bot: string, params: Record<string, unknown>) => http.post<RunInfo>('/runs', { bot, params }),
  // roda o bot em VÁRIAS contas, uma atrás da outra. contas = ids; vazio = todas as ativas.
  runLote: (bot: string, params: Record<string, unknown>, contas: string[]) =>
    http.post<LoteInfo>(`/bots/${bot}/run-lote`, { params, contas }),
  listRuns: () => http.get<RunInfo[]>('/runs'),
  getHistorico: () => http.get<RunHistorico[]>('/runs/history'),
  getRun: (id: string) => http.get<RunDetail>(`/runs/${id}`),
  stopRun: (id: string) => http.post(`/runs/${id}/stop`),
  // manda o push token da Live Activity do APP + o bundle deste build (vira o tópico do
  // APNs) — a partir daí é o server que empurra a barra viva. Não é por run: existe UMA
  // Live Activity, e o server é quem soma as runs dentro dela.
  setLiveActivity: (token: string, bundle: string, activityId: string) =>
    http.post('/liveactivity', { token, bundle, activity_id: activityId }),
  testLiveActivity: (n: number) =>
    http.post<{ ok: boolean; erro?: string }>('/liveactivity/test', { n }),
  connectInstagram: (cookies: IgCookie[], label?: string) =>
    http.post<ConnectResult>('/instagram/session', { cookies, label }),
  getAccounts: () => http.get<Account[]>('/accounts'),
  validarContas: () => http.get<Account[]>('/accounts/validar'),
  ativarConta: (id: string) => http.post<{ ativa: string }>(`/accounts/${encodeURIComponent(id)}/ativar`, {}),
  removerConta: (id: string) => http.del(`/accounts/${encodeURIComponent(id)}`),
  registerDevice: (token: string) => http.post<{ ok: boolean; devices: number }>('/devices', { token }),
  getCronograma: () => http.get<Cronograma>('/cronograma'),
  setCronograma: (ativo: boolean) => http.put<{ ativo: boolean }>('/cronograma', { ativo }),
};

// URL do WebSocket de log (http→ws, com o token na query).
export async function logsWsUrl(runId: string): Promise<string> {
  const base = (await baseUrl()).replace(/^http/, 'ws');
  return `${base}/runs/${runId}/logs?token=${encodeURIComponent(env.apiToken)}`;
}
