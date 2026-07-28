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
