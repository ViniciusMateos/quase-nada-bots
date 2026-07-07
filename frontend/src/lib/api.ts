import { baseUrl, http } from '@/lib/apiClient';
import { getToken } from '@/lib/tokenStorage';

export type Bot = {
  nome: string; dir: string; tem_modos: boolean; tem_chats: boolean; descricao: string;
};
export type Progresso = { done: number; total: number; label: string };
export type RunInfo = {
  id: string; bot: string; status: string; started_at: number;
  ended_at?: number | null; returncode?: number | null; params: Record<string, unknown>;
  linhas: number; progress?: Progresso | null;
};
export type RunDetail = RunInfo & { log: string[] };
export type Chat = { nome: string; thread_id: string };
export type IgCookie = {
  name: string; value: string; domain?: string; path?: string;
  httpOnly?: boolean; secure?: boolean; sameSite?: string; session?: boolean; expirationDate?: number;
};
export type ConnectResult = { runs: { bot: string; id: string }[] };
export type Proxy = { enabled: boolean; server: string; username: string; password: string };

export const api = {
  listBots: () => http.get<Record<string, Bot>>('/bots'),
  getModos: (bot: string) => http.get<Record<string, Record<string, unknown>>>(`/bots/${bot}/modos`),
  putModos: (bot: string, modos: unknown) => http.put(`/bots/${bot}/modos`, modos),
  getChats: (bot: string) => http.get<Chat[]>(`/bots/${bot}/chats`),
  getProxy: (bot: string) => http.get<Proxy>(`/bots/${bot}/proxy`),
  putProxy: (bot: string, p: Proxy) => http.put<Proxy>(`/bots/${bot}/proxy`, p),
  addChat: (bot: string, nome: string, thread_id: string) => http.post<Chat>(`/bots/${bot}/chats`, { nome, thread_id }),
  delChat: (bot: string, nome: string) => http.del(`/bots/${bot}/chats/${encodeURIComponent(nome)}`),
  startRun: (bot: string, params: Record<string, unknown>) => http.post<RunInfo>('/runs', { bot, params }),
  listRuns: () => http.get<RunInfo[]>('/runs'),
  getRun: (id: string) => http.get<RunDetail>(`/runs/${id}`),
  stopRun: (id: string) => http.post(`/runs/${id}/stop`),
  connectInstagram: (cookies: IgCookie[], bots?: string[]) =>
    http.post<ConnectResult>('/instagram/session', { cookies, bots }),
  registerDevice: (token: string) => http.post<{ ok: boolean; devices: number }>('/devices', { token }),
};

// URL do WebSocket de log (http→ws, com o token na query).
export async function logsWsUrl(runId: string): Promise<string> {
  const base = (await baseUrl()).replace(/^http/, 'ws');
  const token = await getToken();
  return `${base}/runs/${runId}/logs?token=${encodeURIComponent(token ?? '')}`;
}
