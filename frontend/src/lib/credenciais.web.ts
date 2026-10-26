/**
 * Variante WEB das credenciais. No app nativo ficam no Keychain (expo-secure-store), que não
 * existe na web — aqui usamos localStorage. Mesmas funções, pra pré-preencher o login.
 * (Credencial só pré-preenche o login; a sessão continua sendo capturada no login.)
 */
export type Credencial = { usuario: string; senha: string };

const KEY = 'ig_credenciais_v1';

function ler(): Credencial[] {
  try {
    const s = localStorage.getItem(KEY);
    const arr = s ? JSON.parse(s) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function gravar(list: Credencial[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* sem storage */ }
}

export async function lerCredenciais(): Promise<Credencial[]> {
  return ler();
}

export async function salvarCredencial(c: Credencial) {
  const u = c.usuario.trim().replace(/^@/, '');
  const resto = ler().filter((x) => x.usuario.toLowerCase() !== u.toLowerCase());
  resto.push({ usuario: u, senha: c.senha });
  gravar(resto);
}

export async function removerCredencial(usuario: string) {
  gravar(ler().filter((x) => x.usuario.toLowerCase() !== usuario.trim().toLowerCase()));
}

// Senha PADRÃO do Criar Conta (ver credenciais.ts): na web vive no localStorage.
const KEY_SENHA = 'ig_senha_padrao_v1';

export async function lerSenhaPadrao(): Promise<string> {
  try { return localStorage.getItem(KEY_SENHA) || ''; } catch { return ''; }
}

export async function salvarSenhaPadrao(senha: string) {
  try { localStorage.setItem(KEY_SENHA, senha); } catch { /* sem storage */ }
}
