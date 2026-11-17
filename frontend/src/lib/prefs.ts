import * as SecureStore from 'expo-secure-store';

// Preferências pequenas do app guardadas NO APARELHO (13/11/2026: ordem dos bots no hub). No iPhone fica
// no SecureStore; na web, no localStorage (prefs.web.ts). Nunca levanta: sem nada salvo = null.

export async function lerPref(chave: string): Promise<string | null> {
  try { return await SecureStore.getItemAsync(chave); } catch { return null; }
}

export async function gravarPref(chave: string, valor: string): Promise<void> {
  try { await SecureStore.setItemAsync(chave, valor); } catch { /* sem onde guardar: segue */ }
}
