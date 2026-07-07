// Identidade Quase Nada Bots — gradiente da marca (do ícone): roxo → rosa → amarelo.
const roxo = '#8114B0';
const rosa = '#F63F93';
const amarelo = '#F7FF3C';

export const colors = {
  roxo,
  rosa,
  amarelo,
  marca: rosa,                          // accent sólido (o meio do gradiente)
  laranja: rosa,                        // (compat) usos antigos passam a usar o rosa da marca
  gradiente: [roxo, rosa, amarelo] as const,
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
  rodando: colors.rosa,
  finalizado: colors.ok,
  parado: colors.textoFraco,
  erro: colors.erro,
};
