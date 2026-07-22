/**
 * Bus simples pra avisar que o usuário tocou/scrollou na tela (fora do widget flutuante).
 * O RootNavigator emite via onStartShouldSetResponderCapture (que NÃO rouba o toque),
 * e a barra flutuante ouve pra se recolher em bolha quando o usuário mexe na tela.
 */
type Fn = () => void;
const subs = new Set<Fn>();

export const interacaoBus = {
  emitir() {
    subs.forEach((f) => { try { f(); } catch { /* no-op */ } });
  },
  ouvir(f: Fn) {
    subs.add(f);
    return () => { subs.delete(f); };
  },
};
