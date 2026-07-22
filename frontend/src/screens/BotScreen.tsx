import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { api, Chat, RunInfo } from '@/lib/api';
import { garantirLA } from '@/lib/la';
import { colors } from '@/theme';
import { Aparece, Botao, Card, CartaoTocavel } from '@/ui/components';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rt = RouteProp<RootStackParamList, 'Bot'>;

export function BotScreen() {
  const nav = useNavigation<Nav>();
  const { botId, nome } = useRoute<Rt>().params;
  const [modos, setModos] = useState<string[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [modo, setModo] = useState('padrao');
  const [chat, setChat] = useState<string | null>(null);
  const [iniciando, setIniciando] = useState(false);
  const [runAtiva, setRunAtiva] = useState<RunInfo | null>(null);

  const temChats = botId === 'auto-follow';
  const precisaChat = temChats && chats.length === 0;

  // checagem leve (só as runs) — usada no polling pra atualizar o botão ao vivo
  const checarRun = useCallback(() => {
    api.listRuns().then((rs) => {
      const a = rs.find((r) => r.bot === botId && ['rodando', 'iniciando'].includes(r.status)
        && !(r.params as { import_cookies?: unknown })?.import_cookies) ?? null;
      setRunAtiva(a);
    }).catch(() => {});
  }, [botId]);

  const carregar = useCallback(() => {
    api.getModos(botId).then((m) => setModos(Object.keys(m))).catch(() => {});
    checarRun();
    if (temChats) {
      api.getChats(botId).then((c) => {
        setChats(c);
        setChat((atual) => (atual && c.some((x) => x.nome === atual) ? atual : c[0]?.nome ?? null));
      }).catch(() => {});
    }
  }, [botId, temChats, checarRun]);

  useFocusEffect(useCallback(() => {
    carregar();
    const id = setInterval(checarRun, 2500);   // atualiza o "Já está rodando" ao vivo
    return () => clearInterval(id);
  }, [carregar, checarRun]));

  async function rodar(dry: boolean) {
    if (runAtiva) return;
    setIniciando(true);
    try {
      const params: Record<string, unknown> = { dry_run: dry };
      if (modos.length) params.modo = modo;
      if (temChats && chat) params.chat = chat;
      const run = await api.startRun(botId, params);
      setRunAtiva(run);                       // trava o botão na hora
      // barra viva no lock screen (no-op no Expo Go). Vale também no dry-run: o dry agora é
      // uma simulação FIEL (mesma navegação), então dá pra testar a LA sem seguir/mandar DM.
      garantirLA(nome);
      nav.navigate('Run', { runId: run.id, nome: botId });
    } catch (e) {
      setIniciando(false);
      carregar();   // atualiza o estado (pode já ter começado a rodar)
      if ((e as { response?: { status?: number } })?.response?.status === 409) {
        Alert.alert('Já está rodando', 'Esse bot já tem uma execução em andamento. Abre ela pra acompanhar.');
      }
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
          <View style={styles.linksRow}>
            <TouchableOpacity onPress={() => nav.navigate('EditModo', { botId, modoNome: modo })} style={styles.link}>
              <Ionicons name="create-outline" size={15} color={colors.marca} />
              <Text style={styles.linkTxt}>Editar "{modo}"</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => nav.navigate('EditModo', { botId, modoNome: modo, criar: true })} style={styles.link}>
              <Ionicons name="add-circle-outline" size={16} color={colors.marca} />
              <Text style={styles.linkTxt}>Novo modo</Text>
            </TouchableOpacity>
          </View>
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
          <TouchableOpacity onPress={() => nav.navigate('Chats', { botId })} style={styles.link}>
            <Ionicons name="add-circle-outline" size={16} color={colors.marca} />
            <Text style={styles.linkTxt}>Gerenciar chats</Text>
          </TouchableOpacity>
        </Card>
        </Aparece>
      )}
      <View style={{ gap: 10 }}>
        {precisaChat ? (
          <Botao title="Configurar um chat primeiro" onPress={() => nav.navigate('Chats', { botId })} />
        ) : runAtiva ? (
          <>
            <Botao title="Já está rodando" disabled onPress={() => {}} />
            <Botao title="Ver execução" cor={colors.card2} txtCor={colors.texto}
              onPress={() => nav.navigate('Run', { runId: runAtiva.id, nome: botId })} />
          </>
        ) : (
          <>
            <Botao title="Rodar" onPress={() => rodar(false)} loading={iniciando} />
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
  linksRow: { flexDirection: 'row', gap: 18 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 12 },
  linkTxt: { color: colors.marca, fontWeight: '600', fontSize: 14 },
  aviso: { color: colors.textoFraco, fontSize: 13, lineHeight: 19 },
});
