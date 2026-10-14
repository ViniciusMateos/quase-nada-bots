/**
 * Variante WEB do push. Push/notificações são nativos (iPhone/Android) — na web tudo é no-op
 * gracioso, pra o app rodar no navegador sem o expo-notifications.
 */
export async function configurarCanalAndroid(): Promise<void> { /* no-op na web */ }

export async function testarProgresso(): Promise<boolean> { return false; }

export async function registrarPush(): Promise<boolean> { return false; }
