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

// Senha de conta ainda EM CRIAÇÃO (ver credenciais.ts): só vira credencial quando a conta existir.
const KEY_PEND = 'ig_credenciais_pendentes_v1';

function lerPendentes(): Credencial[] {
  try {
    const s = localStorage.getItem(KEY_PEND);
    const arr = s ? JSON.parse(s) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function gravarPendentes(list: Credencial[]) {
  try { localStorage.setItem(KEY_PEND, JSON.stringify(list)); } catch { /* sem storage */ }
}

export async function salvarCredencialPendente(c: Credencial) {
  const u = c.usuario.trim().replace(/^@/, '');
  const resto = lerPendentes().filter((x) => x.usuario.toLowerCase() !== u.toLowerCase());
  resto.push({ usuario: u, senha: c.senha });
  gravarPendentes(resto);
}

export async function promoverPendentes(labels: string[]): Promise<number> {
  const pend = lerPendentes();
  if (!pend.length) return 0;
  const existe = new Set(labels.map((l) => (l || '').toLowerCase()));
  const prontas = pend.filter((p) => existe.has(p.usuario.toLowerCase()));
  if (!prontas.length) return 0;
  for (const p of prontas) await salvarCredencial(p);
  gravarPendentes(pend.filter((p) => !existe.has(p.usuario.toLowerCase())));
  return prontas.length;
}

// Senha PADRÃO do Criar Conta (ver credenciais.ts): na web vive no localStorage.
const KEY_SENHA = 'ig_senha_padrao_v1';

export async function lerSenhaPadrao(): Promise<string> {
  try { return localStorage.getItem(KEY_SENHA) || ''; } catch { return ''; }
}

export async function salvarSenhaPadrao(senha: string) {
  try { localStorage.setItem(KEY_SENHA, senha); } catch { /* sem storage */ }
}

// Data de nascimento da última run do Criar Conta (ver credenciais.ts).
export type Nasc = { ano: number; mes: number; dia: number };
const KEY_NASC = 'ig_nasc_padrao_v1';

export async function lerNascPadrao(): Promise<Nasc | null> {
  try {
    const n = JSON.parse(localStorage.getItem(KEY_NASC) || 'null');
    return n && n.ano && n.mes && n.dia ? n : null;
  } catch { return null; }
}

export async function salvarNascPadrao(n: Nasc) {
  try { localStorage.setItem(KEY_NASC, JSON.stringify(n)); } catch { /* sem storage */ }
}
