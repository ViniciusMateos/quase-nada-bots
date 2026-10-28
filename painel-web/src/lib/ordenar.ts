// Ordenação "natural" pra TODA listagem do app: alfabética, mas com os números na ordem
// numérica (segue2 antes de segue10, não depois). Regra do Vinicius: sempre listar ordenado,
// do menor pro maior quando muda só o número.
export const cmpTexto = (a: string, b: string): number =>
  (a || '').localeCompare(b || '', 'pt-BR', { numeric: true, sensitivity: 'base' });

// ordena uma cópia do array por uma chave de texto (não muta o original)
export function ordenarPor<T>(arr: T[], chave: (x: T) => string): T[] {
  return [...arr].sort((a, b) => cmpTexto(chave(a), chave(b)));
}
