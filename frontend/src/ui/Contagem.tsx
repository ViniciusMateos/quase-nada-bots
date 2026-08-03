import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme';
import type { Espera } from '@/lib/api';

// mm:ss a partir de segundos
function mmss(seg: number): string {
  const s = Math.max(0, Math.round(seg));
  const m = Math.floor(s / 60), r = s % 60;
  return m ? `${m}m ${String(r).padStart(2, '0')}s` : `${r}s`;
}

/** Contagem regressiva de uma pausa. Ticka localmente (1s) em cima do `ate` (epoch em
 * segundos) que o backend mandou — então anda suave mesmo entre os polls. */
export function Contagem({ espera, compact }: { espera: Espera; compact?: boolean }) {
  const [restam, setRestam] = useState(() => Math.max(0, espera.ate - Date.now() / 1000));
  useEffect(() => {
    const calc = () => setRestam(Math.max(0, espera.ate - Date.now() / 1000));
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [espera.ate]);

  const txt = restam > 0 ? `pausa · faltam ${mmss(restam)}` : 'voltando…';
  const mot = espera.motivo ? ` (${espera.motivo})` : '';

  if (compact) {
    return <Text style={styles.compact} numberOfLines={1}>{txt}{mot}</Text>;
  }
  return (
    <View style={styles.wrap}>
      <Ionicons name="pause-circle-outline" size={16} color={colors.alerta} />
      <Text style={styles.txt} numberOfLines={1}>{txt}{mot}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  txt: { color: colors.alerta, fontSize: 13, fontWeight: '700', flex: 1 },
  compact: { color: colors.alerta, fontSize: 12, fontWeight: '600', fontFamily: 'monospace' },
});
