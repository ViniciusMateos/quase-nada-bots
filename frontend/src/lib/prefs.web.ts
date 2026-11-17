// Preferências pequenas do app na WEB: localStorage (o SecureStore não existe no navegador). Ver prefs.ts.

export async function lerPref(chave: string): Promise<string | null> {
  try { return window.localStorage.getItem(chave); } catch { return null; }
}

export async function gravarPref(chave: string, valor: string): Promise<void> {
  try { window.localStorage.setItem(chave, valor); } catch { /* modo privado etc.: segue */ }
}
