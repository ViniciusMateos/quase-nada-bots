import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, Chat } from '@/lib/api';
import { colors } from '@/theme';
import { Aparece, Botao, Card, CartaoTocavel } from '@/ui/components';
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
  const precisaChat = temChats && chats.length === 0;

  const carregar = useCallback(() => {
    api.getModos(botId).then((m) => setModos(Object.keys(m))).catch(() => {});
    if (temChats) {
      api.getChats(botId).then((c) => {
        setChats(c);
        setChat((atual) => (atual && c.some((x) => x.nome === atual) ? atual : c[0]?.nome ?? null));
      }).catch(() => {});
    }
  }, [botId, temChats]);
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

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
        <Aparece>
        <Card>
          <Text style={styles.label}>Modo</Text>
          <View style={styles.chips}>
            {modos.map((m) => (
              <TouchableOpacity key={m} onPress={() => setModo(m)} style={[styles.chip, modo === m && styles.chipOn]}>
                <Text style={[styles.chipTxt, modo === m && styles.chipTxtOn]}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity onPress={() => nav.navigate('EditModo', { botId, modoNome: modo })} style={styles.linkBtn}>
            <Text style={styles.linkTxt}>✎ Editar tempos/limites de "{modo}"</Text>
          </TouchableOpacity>
        </Card>
        </Aparece>
      )}
      {temChats && (
        <Aparece delay={80}>
        <Card>
          <Text style={styles.label}>Chat</Text>
          {chats.length > 0 ? (
            <View style={styles.chips}>
              {chats.map((c) => (
                <TouchableOpacity key={c.thread_id} onPress={() => setChat(c.nome)}
                  style={[styles.chip, chat === c.nome && styles.chipOn]}>
                  <Text style={[styles.chipTxt, chat === c.nome && styles.chipTxtOn]}>{c.nome}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <Text style={styles.aviso}>
              Nenhum chat configurado ainda. Adicione o grupo (ou a @pessoa) que o bot vai
              varrer antes de rodar.
            </Text>
          )}
          <TouchableOpacity onPress={() => nav.navigate('Chats', { botId })} style={styles.linkBtn}>
            <Text style={styles.linkTxt}>＋ Gerenciar chats</Text>
          </TouchableOpacity>
        </Card>
        </Aparece>
      )}
      <Aparece delay={160}>
      <Card>
        <TouchableOpacity onPress={() => nav.navigate('Proxy', { botId })} style={styles.proxyLinha}>
          <View style={{ flex: 1 }}>
            <Text style={styles.proxyTxt}>🌐 Proxy</Text>
            <Text style={styles.proxySub}>Mascarar o IP do servidor (Oracle)</Text>
          </View>
          <Text style={styles.linkTxt}>configurar ›</Text>
        </TouchableOpacity>
      </Card>
      </Aparece>
      <View style={{ gap: 10 }}>
        {precisaChat ? (
          <Botao title="Configurar um chat primeiro" onPress={() => nav.navigate('Chats', { botId })} />
        ) : (
          <>
            <Botao title="▶  Rodar" onPress={() => rodar(false)} loading={iniciando} />
            <Botao title="Simular (dry-run)" cor={colors.card2} txtCor={colors.texto}
              onPress={() => rodar(true)} disabled={iniciando} />
          </>
        )}
      </View>
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
  linkBtn: { marginTop: 12 },
  linkTxt: { color: colors.laranja, fontWeight: '600', fontSize: 14 },
  aviso: { color: colors.textoFraco, fontSize: 13, lineHeight: 19 },
  proxyLinha: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  proxyTxt: { color: colors.texto, fontSize: 16, fontWeight: '600' },
  proxySub: { color: colors.textoFraco, fontSize: 12, marginTop: 2 },
  dashTitulo: { color: colors.texto, fontSize: 17, fontWeight: '700' },
  dashSub: { color: colors.textoFraco, fontSize: 13, marginTop: 4 },
});
