// Helpers de data compartilhados (Histórico e "últimas runs" na tela do bot).

// Cabeçalho de data: Hoje / Ontem / N dias atrás (até 6) / Semana 2, 3… (por semana).
export function bucketData(epoch: number | null): string {
  if (!epoch) return 'Sem data';
  const h = new Date();
  const inicioHoje = new Date(h.getFullYear(), h.getMonth(), h.getDate()).getTime();
  const d = new Date(epoch * 1000);
  const inicioDia = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dias = Math.round((inicioHoje - inicioDia) / 86400000);
  if (dias <= 0) return 'Hoje';
  if (dias === 1) return 'Ontem';
  if (dias <= 6) return `${dias} dias atrás`;
  return `Semana ${Math.floor(dias / 7) + 1}`;
}

// Hora curta HH:MM.
export function fmtHora(epoch: number | null): string {
  if (!epoch) return '—';
  const d = new Date(epoch * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
