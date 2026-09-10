import { requireOptionalNativeModule } from 'expo-modules-core';

type Sub = { remove: () => void };

// null no Expo Go / Android (módulo nativo ausente) — tudo vira no-op gracioso.
const M = requireOptionalNativeModule<{
  disponivel: () => boolean;
  atual: () => string;
  // liga os observadores globais (pushToStartToken + tokens de update). Idempotente.
  observar: () => void;
  // devolve o activityId, ou "" se não conseguiu (String não-opcional — ver o .swift)
  start: (titulo: string) => Promise<string>;
  endAll: () => Promise<void>;
  addListener: (evento: string, cb: (e: { token: string; id?: string }) => void) => Sub;
}>('LiveActivity');

/** true se o device suporta e o usuário deixou Live Activities ligadas. */
export function laDisponivel(): boolean {
  try { return M?.disponivel?.() ?? false; } catch { return false; }
}

/** Id da Live Activity viva agora, ou null. Só existe UMA por app. */
export function laAtual(): string | null {
  try { return M?.atual?.() || null; } catch { return null; }
}

/**
 * Escuta o push token da Live Activity. Chega ~1-3s depois de iniciar e pode ROTACIONAR —
 * por isso um evento, nunca um timeout. Como existe uma activity só, o token que chega é
 * sempre dela; não precisa dizer de quem é.
 */
export function aoReceberTokenLA(cb: (token: string, id?: string) => void): () => void {
  try {
    const sub = M?.addListener?.('onToken', (e) => { if (e?.token) cb(e.token, e.id); });
    return () => { try { sub?.remove(); } catch { /* no-op */ } };
  } catch {
    return () => { /* no-op */ };
  }
}

/** Inicia A Live Activity do app. Devolve o activityId, ou null se não rolou. */
export async function iniciarLiveActivity(titulo: string): Promise<string | null> {
  try {
    const id = await M?.start?.(titulo);
    return id || null;
  } catch { return null; }
}

/** Encerra a Live Activity (usado pra limpar órfã antes de criar outra). */
export async function encerrarTodasLA(): Promise<void> {
  try { await M?.endAll?.(); } catch { /* no-op */ }
}

/** Liga os observadores globais no nativo (pushToStartToken + tokens de update). Idempotente. */
export function observarLA(): void {
  try { M?.observar?.(); } catch { /* no-op */ }
}

/**
 * Escuta o pushToStartToken (iOS 17.2+). Com ele o SERVER inicia a Live Activity sozinho
 * (ex: cronograma auto-rodando o aquecimento, com o app fechado). Chega no boot e pode rotacionar.
 */
export function aoReceberPushToStartToken(cb: (token: string) => void): () => void {
  try {
    const sub = M?.addListener?.('onPushToStart', (e) => { if (e?.token) cb(e.token); });
    return () => { try { sub?.remove(); } catch { /* no-op */ } };
  } catch {
    return () => { /* no-op */ };
  }
}
