import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, Chat } from '@/lib/api';
import { colors } from '@/theme';
import { Botao, Card } from '@/ui/components';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rt = RouteProp<RootStackParamList, 'Bot'>;

export function BotScreen() {
  const nav = useNavigation<Nav>();
  const { botId } = useRoute<Rt>().params;
  const [modos, setModos] = useState<string[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [modo, setModo] = useState('padrao');
  const [chat, setChat] = useState<string | null>(null);
  const [iniciando, setIniciando] = useState(false);

  const temChats = botId === 'auto-like';

  useEffect(() => {
    api.getModos(botId).then((m) => setModos(Object.keys(m))).catch(() => {});
    if (temChats) {
      api.getChats(botId).then((c) => { setChats(c); if (c[0]) setChat(c[0].nome); }).catch(() => {});
    }
  }, [botId, temChats]);

  async function rodar(dry: boolean) {
    setIniciando(true);
    try {
      const params: Record<string, unknown> = { dry_run: dry };
      if (modos.length) params.modo = modo;
      if (temChats && chat) params.chat = chat;
      const run = await api.startRun(botId, params);
      nav.replace('Run', { runId: run.id, nome: botId });
    } catch {
      setIniciando(false);
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, gap: 16 }}>
      {modos.length > 0 && (
        <Card>
          <Text style={styles.label}>Modo</Text>
          <View style={styles.chips}>
            {modos.map((m) => (
              <TouchableOpacity key={m} onPress={() => setModo(m)} style={[styles.chip, modo === m && styles.chipOn]}>
                <Text style={[styles.chipTxt, modo === m && styles.chipTxtOn]}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>
      )}
      {temChats && chats.length > 0 && (
        <Card>
          <Text style={styles.label}>Chat</Text>
          <View style={styles.chips}>
            {chats.map((c) => (
              <TouchableOpacity key={c.thread_id} onPress={() => setChat(c.nome)}
                style={[styles.chip, chat === c.nome && styles.chipOn]}>
                <Text style={[styles.chipTxt, chat === c.nome && styles.chipTxtOn]}>{c.nome}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>
      )}
      {iniciando ? (
        <ActivityIndicator color={colors.laranja} style={{ marginTop: 12 }} />
      ) : (
        <View style={{ gap: 10 }}>
          <Botao title="▶  Rodar" onPress={() => rodar(false)} />
          <Botao title="Simular (dry-run)" cor={colors.card2} txtCor={colors.texto} onPress={() => rodar(true)} />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.textoFraco, fontSize: 12, fontWeight: '700', marginBottom: 10, textTransform: 'uppercase' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  chipOn: { backgroundColor: colors.laranja, borderColor: colors.laranja },
  chipTxt: { color: colors.texto },
  chipTxtOn: { color: '#0F0F0F', fontWeight: '700' },
});
