import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { api, logsWsUrl } from '@/lib/api';
import { colors, statusCor } from '@/theme';
import { Botao, Pill } from '@/ui/components';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Rt = RouteProp<RootStackParamList, 'Run'>;

export function RunScreen() {
  const { runId } = useRoute<Rt>().params;
  const [linhas, setLinhas] = useState<string[]>([]);
  const [status, setStatus] = useState('rodando');
  const scrollRef = useRef<ScrollView>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await api.getRun(runId);
        if (alive) setStatus(d.status);
      } catch {}
      const url = await logsWsUrl(runId);
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onmessage = (e) => { if (alive) setLinhas((prev) => [...prev, String(e.data)]); };
      ws.onclose = async () => {
        try { const d = await api.getRun(runId); if (alive) setStatus(d.status); } catch {}
      };
    })();
    return () => { alive = false; wsRef.current?.close(); };
  }, [runId]);

  async function parar() {
    try { await api.stopRun(runId); setStatus('parado'); } catch {}
  }

  const rodando = ['rodando', 'iniciando'].includes(status);

  return (
    <View style={styles.tela}>
      <View style={styles.topo}>
        <Pill texto={status} cor={statusCor[status] ?? colors.textoFraco} />
        {rodando && <Botao title="✕ Parar" cor={colors.erro} txtCor="#fff" onPress={parar} />}
      </View>
      <ScrollView
        ref={scrollRef}
        style={styles.logBox}
        contentContainerStyle={{ padding: 12 }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
        {linhas.map((l, i) => (
          <Text key={i} style={styles.linha}>{l}</Text>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.bg },
  topo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  logBox: { flex: 1, backgroundColor: '#0A0A0A', marginHorizontal: 12, marginBottom: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  linha: { color: '#D8D8D8', fontFamily: 'monospace', fontSize: 11, lineHeight: 16 },
});
