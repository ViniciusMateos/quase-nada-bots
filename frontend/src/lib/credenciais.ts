import * as SecureStore from 'expo-secure-store';

/**
 * Credenciais (user + senha) das contas de Instagram, guardadas SÓ no aparelho (Keychain do iOS
 * via expo-secure-store). NUNCA vão pro servidor — só pré-preenchem o webview de login. São
 * contas auxiliares; o dono aceitou o risco. A sessão (cookies) continua sendo capturada no login.
 */
export type Credencial = { usuario: string; senha: string };

const KEY = 'ig_credenciais_v1';

export async function lerCredenciais(): Promise<Credencial[]> {
  try {
    const s = await SecureStore.getItemAsync(KEY);
    const arr = s ? JSON.parse(s) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function gravarTodas(list: Credencial[]) {
  await SecureStore.setItemAsync(KEY, JSON.stringify(list));
}

export async function salvarCredencial(c: Credencial) {
  const u = c.usuario.trim().replace(/^@/, '');
  const list = await lerCredenciais();
  const resto = list.filter((x) => x.usuario.toLowerCase() !== u.toLowerCase());
  resto.push({ usuario: u, senha: c.senha });
  await gravarTodas(resto);
}

export async function removerCredencial(usuario: string) {
  const list = await lerCredenciais();
  await gravarTodas(list.filter((x) => x.usuario.toLowerCase() !== usuario.trim().toLowerCase()));
}

// Senha de conta ainda EM CRIAÇÃO (Criar Conta): fica à parte até a conta existir de verdade. Se
// fosse direto pras credenciais, o sincronizar veria "senha salva sem conta no app", cadastraria a
// conta e mandaria logar — mesmo com a criação tendo falhado (segue20, falhou na data — 27/10).
const KEY_PEND = 'ig_credenciais_pendentes_v1';

async function lerPendentes(): Promise<Credencial[]> {
  try {
    const s = await SecureStore.getItemAsync(KEY_PEND);
    const arr = s ? JSON.parse(s) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export async function salvarCredencialPendente(c: Credencial) {
  const u = c.usuario.trim().replace(/^@/, '');
  const resto = (await lerPendentes()).filter((x) => x.usuario.toLowerCase() !== u.toLowerCase());
  resto.push({ usuario: u, senha: c.senha });
  await SecureStore.setItemAsync(KEY_PEND, JSON.stringify(resto));
}

/** Promove pra credencial as pendentes cuja conta JÁ está no app — o agente só cadastra a conta
 *  quando a criação deu certo. Devolve quantas promoveu. */
export async function promoverPendentes(labels: string[]): Promise<number> {
  const pend = await lerPendentes();
  if (!pend.length) return 0;
  const existe = new Set(labels.map((l) => (l || '').toLowerCase()));
  const prontas = pend.filter((p) => existe.has(p.usuario.toLowerCase()));
  if (!prontas.length) return 0;
  for (const p of prontas) await salvarCredencial(p);
  const resto = pend.filter((p) => !existe.has(p.usuario.toLowerCase()));
  await SecureStore.setItemAsync(KEY_PEND, JSON.stringify(resto));
  return prontas.length;
}

// Senha PADRÃO do Criar Conta: a última que você digitou fica salva (SÓ no aparelho) e pré-preenche
// a próxima run. Nunca vai pro servidor nem pro código — por isso não pode ser hardcoded (repo público).
const KEY_SENHA = 'ig_senha_padrao_v1';

export async function lerSenhaPadrao(): Promise<string> {
  try { return (await SecureStore.getItemAsync(KEY_SENHA)) || ''; } catch { return ''; }
}

export async function salvarSenhaPadrao(senha: string) {
  try { await SecureStore.setItemAsync(KEY_SENHA, senha); } catch { /* ok */ }
}

// Data de nascimento da última run do Criar Conta (pré-preenche a próxima, igual a senha).
export type Nasc = { ano: number; mes: number; dia: number };
const KEY_NASC = 'ig_nasc_padrao_v1';

export async function lerNascPadrao(): Promise<Nasc | null> {
  try {
    const n = JSON.parse((await SecureStore.getItemAsync(KEY_NASC)) || 'null');
    return n && n.ano && n.mes && n.dia ? n : null;
  } catch { return null; }
}

export async function salvarNascPadrao(n: Nasc) {
  try { await SecureStore.setItemAsync(KEY_NASC, JSON.stringify(n)); } catch { /* ok */ }
}
