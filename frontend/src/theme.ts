// Identidade Quase Nada — laranja da marca (#FF8234) em tema escuro.
export const colors = {
  laranja: '#FF8234',
  bg: '#0F0F0F',
  card: '#1A1A1A',
  card2: '#242424',
  border: '#2C2C2C',
  texto: '#F2F2F2',
  textoFraco: '#9A9A9A',
  ok: '#34C759',
  erro: '#FF3B30',
  alerta: '#FFCC00',
};

export const statusCor: Record<string, string> = {
  iniciando: colors.alerta,
  rodando: colors.laranja,
  finalizado: colors.ok,
  parado: colors.textoFraco,
  erro: colors.erro,
};
