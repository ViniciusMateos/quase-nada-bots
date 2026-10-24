import { baseUrl, http } from '@/lib/apiClient';
import { env } from '@/config/env';

export type Bot = {
  nome: string; dir: string; tem_modos: boolean; tem_chats: boolean; descricao: string;
  // onde a run desse bot executa de verdade — quem decide é o BACKEND (ex: 'emulador' | 'server').
  // Opcional: backends antigos não mandam. Usado só pra rotular na aba Emulador.
  target?: string;
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
  pendente?: boolean;   // conta adicionada SEM conectar ainda (só o @, sem sessão)
  grupos?: string[];    // grupos dessa conta (ex: "Vitrine", "Captação")
  // cadeado: NÃO loga sozinha no emulador na sincronização (e fica fora do cronograma)
  travada?: boolean;
  // onde a conta é usada — decide em quais listas aparece (aba Emulador, aba Servidor, lote dos
  // bots). Backend antigo não manda → os dois (ver locaisDe).
  locais?: Local[];
};
export type Local = 'emulador' | 'servidor';
/** Onde a conta é usada (sem o campo = os dois, igual o backend). */
export function locaisDe(a?: Pick<Account, 'locais'> | null): Local[] {
  return a?.locais ?? ['emulador', 'servidor'];
}
// grupo de contas: etiqueta salva no server; usado pra pré-marcar as contas no lote
export type Grupo = { nome: string; contas: string[] };
export type RunHistorico = {
  id: string; bot: string; dry_run: boolean;
  started_at: number | null; ended_at: number | null; duracao_s: number | null;
  status: string; bloqueio: boolean; saldo: Record<string, number | string>; backfill?: boolean;
  conta?: string | null;   // @username da conta IG usada na run
  // o que a run foi DE VERDADE: login/verificar usam o "auto-follow" como veículo, então o nome
  // vem daqui (senão aparece "Auto Follow"). Registros antigos não têm.
  titulo?: string | null; acao?: string | null; motivo?: string | null;
};

export type CronTarefa = {
  conta_id?: string; conta: string; bot: string; modo: string; desc: string;
  hora: number; min: number; enviado: boolean;
  pulado?: boolean;   // passou da hora sem rodar (pausado, ou 2h na fila) — não roda atrasado
};
export type Cronograma = { ativo: boolean; data: string; tarefas: CronTarefa[] };

// status do AGENTE do emulador (o device real que roda o auto-follow). Se o backend ainda não
// expõe /emulador/status, o app trata a ausência graciosamente (mostra "indisponível").
export type EmuladorStatus = {
  online: boolean;              // agente conectado e com device pronto?
  device?: string | null;       // serial/nome do device (ex: "emulator-5554")
  ultimo_ping?: number | null;  // epoch (s) do último heartbeat do agente
  // conta do IG logada/ativa AGORA no app do emulador (reportada pelo agente no heartbeat).
  // No emulador o login mora no app (não em cookie), então "viva" = app logado e legível;
  // "desconhecida" = não deu pra ler (ex: IG fora da aba perfil); null = nunca reportado.
  conta_ativa?: string | null;        // @username (sem "@")
  contas_logadas?: string[];          // todas as logadas no seletor (gavetinha do IG)
  sessao?: 'viva' | 'desconhecida' | null;
  // verificação PROFUNDA (sob demanda): o agente entra em cada conta e marca ok/bloqueada.
  // Último resultado por conta + se um verificar está rodando agora.
  sessoes?: Record<string, 'ok' | 'bloqueada' | 'desconhecida' | 'deslogada' | 'senha_incorreta'>;
  verificando_sessoes?: boolean;
};

// conta do STORY-REPOST (roda no server via instagrapi). Verificação de sessão é pelo proxy
// (get_timeline_feed, read-only) — viva=true/false, null=não deu pra checar.
export type StoryConta = {
  username: string;
  viva: boolean | null;
  ultimo_post?: number | null;   // epoch (s) do story mais recente dessa conta, se souber
};

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
  getHistorico: (bot?: string) =>
    http.get<RunHistorico[]>(bot ? `/runs/history?bot=${encodeURIComponent(bot)}` : '/runs/history'),
  getRun: (id: string) => http.get<RunDetail>(`/runs/${id}`),
  stopRun: (id: string) => http.post(`/runs/${id}/stop`),
  // manda o push token da Live Activity do APP + o bundle deste build (vira o tópico do
  // APNs) — a partir daí é o server que empurra a barra viva. Não é por run: existe UMA
  // Live Activity, e o server é quem soma as runs dentro dela.
  setLiveActivity: (token: string, bundle: string, activityId: string) =>
    http.post('/liveactivity', { token, bundle, activity_id: activityId }),
  // pushToStartToken (iOS 17.2+): com ele o server INICIA a Live Activity sozinho (cronograma).
  setPushToStartToken: (token: string, bundle: string) =>
    http.post<{ ok: boolean }>('/liveactivity/pts', { token, bundle }),
  testLiveActivity: (n: number) =>
    http.post<{ ok: boolean; erro?: string }>('/liveactivity/test', { n }),
  connectInstagram: (cookies: IgCookie[], label?: string) =>
    http.post<ConnectResult>('/instagram/session', { cookies, label }),
  getAccounts: () => http.get<Account[]>('/accounts'),
  // registra uma conta PENDENTE no server (só o @, sem sessão) pra ela já entrar no cronograma
  // antes de conectar. Idempotente. A senha NUNCA vai — fica só no aparelho.
  // `locais` default no server = só emulador
  adicionarContaPendente: (label: string, locais?: Local[]) =>
    http.post<{ id: string; label: string; pendente?: boolean }>('/accounts/pendente',
      locais ? { label, locais } : { label }),
  // force=true ignora o cache de ~60s do server (pull-to-refresh / após reconectar uma conta)
  validarContas: (force = false) => http.get<Account[]>(force ? '/accounts/validar?force=1' : '/accounts/validar'),
  ativarConta: (id: string) => http.post<{ ativa: string }>(`/accounts/${encodeURIComponent(id)}/ativar`, {}),
  removerConta: (id: string) => http.del(`/accounts/${encodeURIComponent(id)}`),
  travarConta: (id: string, travada: boolean) =>
    http.put<{ id: string; travada: boolean }>(`/accounts/${encodeURIComponent(id)}/travada`, { travada }),
  // onde a conta é usada (subconjunto de emulador/servidor; [] = nenhum)
  definirLocais: (id: string, locais: Local[]) =>
    http.put<{ id: string; locais: Local[] }>(`/accounts/${encodeURIComponent(id)}/locais`, { locais }),
  // ── Criar Conta: contas de Gmail (email + senha de app) + código por IMAP + aplicar perfil ──
  getGmailContas: () => http.get<{ user: string; senha_app: string }[]>('/gmail/contas'),
  addGmailConta: (user: string, senha_app: string) =>
    http.post<{ user: string; senha_app: string }[]>('/gmail/contas', { user, senha_app }),
  removerGmailConta: (user: string) =>
    http.post<{ user: string; senha_app: string }[]>('/gmail/remover', { user }),
  gmailCodigo: (alias: string) =>
    http.get<{ code: string | null }>(`/gmail/codigo?alias=${encodeURIComponent(alias)}`),
  // aplica bio + foto (data URL) no perfil da conta (id = ds_user_id de /instagram/session)
  instagramPerfil: (id: string, bio: string, fotoB64?: string) =>
    http.post<{ bio: boolean; foto: boolean }>('/instagram/perfil', { id, bio, foto_b64: fotoB64 || '' }),
  // última foto de perfil usada (pra já vir sugerida na próxima conta)
  getUltimaFoto: () => http.get<{ dataUrl: string }>('/criar/ultima-foto'),
  getGrupos: () => http.get<Grupo[]>('/grupos'),
  criarGrupo: (nome: string) => http.post<{ nome: string }>('/grupos', { nome }),
  // contas = quem fica no grupo (substitui); nome = renomeia
  editarGrupo: (nome: string, dados: { nome?: string; contas?: string[] }) =>
    http.put<Grupo>(`/grupos/${encodeURIComponent(nome)}`, dados),
  removerGrupo: (nome: string) => http.del(`/grupos/${encodeURIComponent(nome)}`),
  registerDevice: (token: string) => http.post<{ ok: boolean; devices: number }>('/devices', { token }),
  getCronograma: () => http.get<Cronograma>('/cronograma'),
  setCronograma: (ativo: boolean) => http.put<{ ativo: boolean }>('/cronograma', { ativo }),
  // status do agente do emulador (device). Backend pode não expor → o chamador trata o erro
  // como "indisponível". As RUNS do emulador seguem nos endpoints normais (/runs e
  // /bots/:bot/run-lote) — o backend roteia server vs emulador pelo `target` do bot.
  emuladorStatus: () => http.get<EmuladorStatus>('/emulador/status'),
  // dispara a verificação profunda das sessões do emulador (o agente entra em cada conta)
  verificarSessoes: () => http.post<{ ok: boolean; run_id?: string }>('/emulador/verificar', {}),
  // contas do story-repost (server) + verificação de sessão (pelo proxy). force ignora o
  // cache de ~60s do server. Backend antigo pode não expor → o chamador trata como vazio.
  storyContas: (force = false) =>
    http.get<{ contas: StoryConta[] }>(force ? '/story/contas?force=1' : '/story/contas')
      .then((r) => r.contas ?? []),
  // ── reconectar contas-vitrine (server + emulador) ──
  // server: re-loga user/senha (roda story_poster --login); a run mostra o log e emite
  // "[codigo] <user>" se o IG desafiar (aí o app manda enviarCodigo). Reusa /run-lote.
  reconectarServer: (contas: string[]) =>
    http.post<LoteInfo>('/bots/story-repost/run-lote', { params: { login: true }, contas }),
  // emulador: enfileira login no app do IG (agente do PC digita user/senha). `senhas` = credencial
  // salva no aparelho {user: senha}; sem ela o server usa o contas.json dele.
  reconectarEmulador: (contas: string[], senhas?: Record<string, string>) =>
    http.post<{ emulador: boolean; login: boolean; total: number; contas: string[]; run_ids: string[] }>(
      '/emulador/login', senhas ? { contas, senhas } : { contas }),
  // CRIAR CONTA no emulador: o agente cria a conta tocando no app do IG (o código vem do Gmail).
  // senha/e-mail viajam só no job (nunca no log nem em /runs). Devolve o run_id pra acompanhar.
  criarContaEmulador: (dados: { username: string; senha: string; email: string; ano?: number; dia?: number; bio?: string; grupo?: string }) =>
    http.post<{ emulador: boolean; criar: boolean; run_id: string; username: string; ja_na_fila?: boolean }>(
      '/emulador/criar-conta', dados),
  // código de verificação do IG (server grava em codigos/<user>.txt; emulador busca via GET)
  enviarCodigo: (user: string, codigo: string) =>
    http.post<{ ok: boolean; user: string }>('/contas/codigo', { user, codigo }),
  // atualiza a senha no contas.json do server (ex: você trocou a senha ao recuperar a conta)
  atualizarSenhaStory: (user: string, senha: string) =>
    http.post<{ user: string; criada: boolean }>('/story/senha', { user, senha }),
};

// URL do WebSocket de log (http→ws, com o token na query).
export async function logsWsUrl(runId: string): Promise<string> {
  const base = (await baseUrl()).replace(/^http/, 'ws');
  return `${base}/runs/${runId}/logs?token=${encodeURIComponent(env.apiToken)}`;
}
