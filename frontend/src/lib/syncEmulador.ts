// Sincronização app ↔ emulador (20/10/2026) — roda EMBUTIDA no "verificar" da aba Emulador:
//   1) conta logada no emulador que o app não conhece → entra no app (locais = emulador);
//   2) conta do app fora do emulador → o agente loga lá (com a senha salva no aparelho). Desde
//      20/10 não tem mais cadeado: TODA conta sincroniza. A do BRECHÓ loga no emulador próprio dela
//      — como ele vive desligado, o "está logada?" dela é o último que os jobs dela reportaram
//      (sessoes[brecho] = ok | deslogada); só manda logar quando não está ok.
// Conta sem senha salva no aparelho não tem como logar → volta em `semSenha` pra avisar.
import { api, locaisDe, type EmuladorStatus } from '@/lib/api';
import { lerCredenciais, promoverPendentes } from '@/lib/credenciais';

/** Tem cara de @ do Instagram? (o agente já filtra; aqui é a 2ª trava pra lixo nunca virar conta) */
/** A conta da loja: roda no emulador PRÓPRIO dela (Story Repost), fora do das segue. */
export const CONTA_BRECHO = 'brechoquasenadaa';

export function ehUsername(u: string): boolean {
  return /^[a-z0-9._]{1,30}$/.test(u || '');
}

/** Durante o VERIFICAR: esta conta ainda não recebeu o resultado desta rodada? Todas as cadastradas
 *  ficam "verificando…" até o agente reportar cada uma (sessoes_ts depois do início). Backend antigo
 *  (sem verificando_desde) → todas aguardando enquanto verifica. */
export function aindaVerificando(u: string, status: EmuladorStatus | null | undefined,
                                 verificando: boolean): boolean {
  if (!verificando) return false;
  const desde = status?.verificando_desde;
  if (!desde) return true;
  const ts = status?.sessoes_ts?.[u] ?? status?.sessoes_ts?.[u.toLowerCase()];
  return !ts || ts < desde;
}

export type ResultadoSync = {
  adicionadas: string[]; logando: string[]; semSenha: string[];
  senhaIncorreta: string[];   // o IG recusou a senha salva → não re-tenta sozinho (só ao salvar outra)
};

/** `verificar` = o "verificar" do app: as contas fora do emulador vão DENTRO da verificação (um
 *  lote só: o agente loga as que faltam e depois verifica todas). Sem ele, só enfileira os logins. */
export async function sincronizarEmulador(verificar = false): Promise<ResultadoSync> {
  let [contas, status] = await Promise.all([api.getAccounts(), api.emuladorStatus()]);
  // senha de conta criada pelo Criar Conta só vira credencial quando a conta já está no app
  await promoverPendentes(contas.map((a) => a.label || '')).catch(() => 0);
  const creds = await lerCredenciais().catch(() => []);
  const logadas = (status?.contas_logadas ?? []).filter(ehUsername);
  const noEmulador = new Set(logadas.map((u) => u.toLowerCase()));
  const conhecidas = new Set(contas.map((a) => (a.label || '').toLowerCase()));

  // 1) emulador → app
  const adicionadas: string[] = [];
  for (const u of logadas) {
    if (conhecidas.has(u.toLowerCase())) continue;
    await api.adicionarContaPendente(u, ['emulador']).catch(() => {});
    adicionadas.push(u);
  }
  // credencial salva só no aparelho (sem conta no server) também conta como do emulador
  let novas = adicionadas.length;
  for (const c of creds) {
    if (!conhecidas.has(c.usuario.toLowerCase()) && ehUsername(c.usuario)
        && !noEmulador.has(c.usuario.toLowerCase())) {
      await api.adicionarContaPendente(c.usuario, ['emulador']).catch(() => {});
      novas++;
    }
  }
  if (novas) contas = await api.getAccounts().catch(() => contas);

  // 2) app → emulador (o brechó → emulador dele, só se não estiver logado lá)
  // senha recusada pelo IG: não fica tentando de novo a cada verificar (errar senha várias vezes
  // na conta da loja chama atenção do IG) — loga quando você salvar a senha certa em Contas
  const stBrecho = status?.sessoes?.[CONTA_BRECHO];
  const senhaIncorreta: string[] = stBrecho === 'senha_incorreta' ? [CONTA_BRECHO] : [];
  const doEmulador = contas.filter((a) => {
    const l = (a.label || '').toLowerCase();
    if (l === CONTA_BRECHO) return stBrecho !== 'ok' && stBrecho !== 'senha_incorreta';
    // "bloqueada" = o bot tirou ela do emulador (ex: verificação humana). Na sincronização solta NÃO
    // reloga (22/10); no VERIFICAR vai junto (05/11 — "verificar TODAS as cadastradas"): o login mostra
    // se ela ainda está presa (o agente marca de novo e tira, sem push repetido) ou se você já resolveu
    if (!verificar && status?.sessoes?.[a.label] === 'bloqueada') return false;
    // senha recusada pelo IG: não insiste (errar senha várias vezes chama atenção) — só ao salvar outra
    if (status?.sessoes?.[a.label] === 'senha_incorreta') return false;
    return locaisDe(a).includes('emulador') && !noEmulador.has(l);
  });
  const senhas: Record<string, string> = {};
  const semSenha: string[] = [];
  for (const a of doEmulador) {
    const c = creds.find((x) => x.usuario.toLowerCase() === (a.label || '').toLowerCase());
    if (c?.senha) senhas[a.label] = c.senha;
    else semSenha.push(a.label);
  }
  const logando = Object.keys(senhas);
  if (verificar) {
    const v = await api.verificarSessoes(logando, senhas);
    // backend antigo (sem o lote junto) ignora as contas e não devolve `logar` → loga à parte, como antes
    if (logando.length && !Array.isArray(v?.logar)) await api.reconectarEmulador(logando, senhas);
  } else if (logando.length) await api.reconectarEmulador(logando, senhas);
  return { adicionadas, logando, semSenha, senhaIncorreta };
}
