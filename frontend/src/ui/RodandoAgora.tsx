import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { RunInfo } from '@/lib/api';
import { colors, statusCor } from '@/theme';
import { BarraProgresso, Card, Pill, Pulsar } from '@/ui/components';
import { Contagem } from '@/ui/Contagem';

/** "Rodando agora" da tela inicial: cada run com o status, a linha viva do log e a barra. */
export function RodandoAgora({ runs, onAbrir }: { runs: RunInfo[]; onAbrir: (r: RunInfo) => void }) {
  if (!runs.length) return null;
  return (
    <Card>
      <Text style={styles.secao}>Rodando agora</Text>
      {runs.map((r) => (
        <TouchableOpacity key={r.id} style={styles.runItem} onPress={() => onAbrir(r)}>
          <View style={styles.runLinha}>
            {/* titulo é universal: "Reconectar no app", "Auto Follow · lote (7 contas)"… — em vez
                do id cru do bot */}
            <Text style={styles.runTxt} numberOfLines={1}>{r.titulo ?? r.bot}</Text>
            <Pulsar>
              <Pill texto={r.status} cor={statusCor[r.status] ?? colors.textoFraco} />
            </Pulsar>
          </View>
          {/* a LINHA VIVA do log embaixo do nome — o que o bot está fazendo AGORA */}
          {r.espera ? (
            <Contagem espera={r.espera} />
          ) : r.status_log ? (
            <Text style={styles.runLog} numberOfLines={1}>{r.status_log}</Text>
          ) : null}
          {r.progress && r.progress.total > 0 && (
            <BarraProgresso done={r.progress.done} total={r.progress.total} label={r.progress.label} />
          )}
        </TouchableOpacity>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  secao: { color: colors.textoFraco, fontSize: 12, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase' },
  runItem: { paddingVertical: 8, gap: 8 },
  runLinha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  runTxt: { color: colors.texto, fontSize: 15, flex: 1 },
  runLog: { color: colors.textoFraco, fontSize: 12, fontFamily: 'monospace', marginTop: -2 },
});
