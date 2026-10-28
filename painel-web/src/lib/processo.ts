// Conectar/verificar contas do emulador rodam com bot = "auto-follow" só como VEÍCULO do job (o
// agente do PC é quem loga/confere). NÃO são o Auto Follow: o nome, o ícone e as travas de "já está
// rodando" têm que olhar a AÇÃO (23/10/2026 — aparecia "Auto Follow" ao reconectar conta).
const ACOES_DE_CONTA = ['login', 'verificar'];

export function acaoDe(r: { params?: Record<string, unknown> | null; acao?: string | null }): string | null {
  const a = r.acao ?? (r.params ? (r.params as { acao?: unknown }).acao : null);
  return typeof a === 'string' ? a : null;
}

export function ehProcessoDeConta(r: { params?: Record<string, unknown> | null; acao?: string | null }): boolean {
  const a = acaoDe(r);
  return !!a && ACOES_DE_CONTA.includes(a);
}

/** Nome pra mostrar quando a run não trouxe título (ou trouxe o antigo "Reconectar no app"). */
export function nomeDoProcesso(acao: string | null, titulo?: string | null): string | null {
  if (acao === 'login') return titulo && !titulo.startsWith('Reconectar no app') ? titulo : 'Conectar contas';
  if (acao === 'verificar') return titulo || 'Verificar sessões';
  return titulo ?? null;
}
