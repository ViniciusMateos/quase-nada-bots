// Sincronização app ↔ emulador (20/10/2026) — roda EMBUTIDA no "verificar" da aba Emulador:
//   1) conta logada no emulador que o app não conhece → entra no app (locais = emulador);
//   2) conta do app marcada pro EMULADOR, SEM cadeado e fora do emulador → o agente loga lá
//      (com a senha salva no aparelho). Conta com cadeado nunca loga sozinha.
// Conta sem senha salva no aparelho não tem como logar → volta em `semSenha` pra avisar.
import { api, locaisDe } from '@/lib/api';
import { lerCredenciais } from '@/lib/credenciais';

/** Tem cara de @ do Instagram? (o agente já filtra; aqui é a 2ª trava pra lixo nunca virar conta) */
export function ehUsername(u: string): boolean {
  return /^[a-z0-9._]{1,30}$/.test(u || '');
}

export type ResultadoSync = { adicionadas: string[]; logando: string[]; semSenha: string[] };

export async function sincronizarEmulador(): Promise<ResultadoSync> {
  let [contas, creds, status] = await Promise.all([
    api.getAccounts(),
    lerCredenciais().catch(() => []),
    api.emuladorStatus(),
  ]);
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

  // 2) app → emulador
  const doEmulador = contas.filter((a) => locaisDe(a).includes('emulador') && !a.travada
    && !noEmulador.has((a.label || '').toLowerCase()));
  const senhas: Record<string, string> = {};
  const semSenha: string[] = [];
  for (const a of doEmulador) {
    const c = creds.find((x) => x.usuario.toLowerCase() === (a.label || '').toLowerCase());
    if (c?.senha) senhas[a.label] = c.senha;
    else semSenha.push(a.label);
  }
  const logando = Object.keys(senhas);
  if (logando.length) await api.reconectarEmulador(logando, senhas);
  return { adicionadas, logando, semSenha };
}
