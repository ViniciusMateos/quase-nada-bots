import React, { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { RouteProp, useFocusEffect, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api, Chat } from '@/lib/api';
import { colors } from '@/theme';
import { Aparece, Botao, Card } from '@/ui/components';
import { TecladoView } from '@/ui/TecladoView';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Rt = RouteProp<RootStackParamList, 'Chats'>;
type Modo = 'thread' | 'nome';

export function ChatsScreen() {
  const { botId } = useRoute<Rt>().params;
  const [chats, setChats] = useState<Chat[]>([]);
  const [modo, setModo] = useState<Modo>('thread');
  const [valor, setValor] = useState('');
  const [adicionando, setAdicionando] = useState(false);

  const carregar = useCallback(() => {
    api.getChats(botId).then(setChats).catch(() => {});
  }, [botId]);
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  async function adicionar() {
    const v = valor.trim();
    if (!v) {
      Alert.alert('Faltou', modo === 'thread' ? 'Cole o thread_id.' : 'Digite o nome do grupo.');
      return;
    }
    setAdicionando(true);
    try {
      // thread → identifica pelo id (rótulo = id até o bot resolver o nome)
      // nome   → identifica pelo nome (thread_id vazio; o bot acha o grupo no inbox)
      await api.addChat(botId, v, modo === 'thread' ? v : '');
      setValor('');
      carregar();
    } catch {
      Alert.alert('Ops', 'Não consegui salvar o chat.');
    } finally {
      setAdicionando(false);
    }
  }

  function remover(c: Chat) {
    Alert.alert('Remover chat', `Remover "${c.nome}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover', style: 'destructive',
        onPress: async () => { try { await api.delChat(botId, c.nome); carregar(); } catch {} },
      },
    ]);
  }

  const ehThread = modo === 'thread';

  return (
    <TecladoView>
    <View style={styles.tela}>
      <Aparece style={{ margin: 16 }}>
      <Card style={{ gap: 12 }}>
        <Text style={styles.label}>Novo chat</Text>

        {/* toggle: identificar por thread_id OU pelo nome do grupo */}
        <View style={styles.seg}>
          {([['thread', 'thread_id', 'keypad'], ['nome', 'nome / @user', 'at']] as [Modo, string, string][]).map(
            ([m, txt, icone]) => (
              <TouchableOpacity key={m} onPress={() => setModo(m)}
                style={[styles.segItem, modo === m && styles.segOn]}>
                <Ionicons name={icone as keyof typeof Ionicons.glyphMap} size={15}
                  color={modo === m ? '#0F0F0F' : colors.textoFraco} />
                <Text style={[styles.segTxt, modo === m && styles.segTxtOn]}>{txt}</Text>
              </TouchableOpacity>
            ))}
        </View>

        <TextInput
          value={valor} onChangeText={setValor}
          placeholder={ehThread ? 'thread_id (só números)' : 'nome do grupo ou @usuário'}
          placeholderTextColor={colors.textoFraco}
          keyboardType={ehThread ? 'numeric' : 'default'}
          autoCapitalize="none" autoCorrect={false}
          style={styles.input} />
        <Botao title="Adicionar chat" onPress={adicionar} loading={adicionando} />

        <View style={styles.dicaBox}>
          {ehThread ? (
            <>
              <Text style={styles.dicaTitulo}>Onde acho o thread_id?</Text>
              <Text style={styles.dica}>Abra a DM/grupo no instagram.com e copie o número da URL:</Text>
              <Text style={styles.dicaMono}>{'instagram.com/direct/t/<ESSE_NÚMERO>/'}</Text>
            </>
          ) : (
            <>
              <Text style={styles.dicaTitulo}>Pelo nome ou @</Text>
              <Text style={styles.dica}>
                Nome exato do grupo, ou o @usuário de uma pessoa. Na hora de rodar, o bot
                acha na sua caixa de DMs e resolve o thread_id sozinho.
              </Text>
            </>
          )}
        </View>
      </Card>
      </Aparece>
      <FlatList
        data={chats}
        keyExtractor={(c) => `${c.nome}|${c.thread_id}`}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={<Text style={styles.vazio}>Nenhum chat salvo ainda.</Text>}
        renderItem={({ item, index }) => (
          <Aparece delay={index * 50}>
            <Card style={styles.linha}>
              <Ionicons name={item.nome.startsWith('@') ? 'person-circle' : 'people-circle'}
                size={26} color={colors.textoFraco} />
              <View style={{ flex: 1 }}>
                <Text style={styles.chatNome} numberOfLines={1}>{item.nome}</Text>
                <Text style={styles.chatId}>{item.thread_id ? item.thread_id : 'busca pelo nome no inbox'}</Text>
              </View>
              <TouchableOpacity onPress={() => remover(item)} hitSlop={10}>
                <Ionicons name="trash-outline" size={20} color={colors.erro} />
              </TouchableOpacity>
            </Card>
          </Aparece>
        )}
      />
    </View>
    </TecladoView>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.bg },
  label: { color: colors.textoFraco, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  seg: { flexDirection: 'row', gap: 8 },
  segItem: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingVertical: 9,
  },
  segOn: { backgroundColor: colors.marca, borderColor: colors.marca },
  segTxt: { color: colors.textoFraco, fontWeight: '600', fontSize: 13 },
  segTxtOn: { color: '#0F0F0F', fontWeight: '700' },
  input: { backgroundColor: colors.card2, color: colors.texto, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border },
  dicaBox: { backgroundColor: colors.card2, borderRadius: 10, padding: 12, gap: 4 },
  dicaTitulo: { color: colors.texto, fontSize: 13, fontWeight: '700' },
  dica: { color: colors.textoFraco, fontSize: 12, lineHeight: 17 },
  dicaMono: { color: colors.texto, fontSize: 12, fontFamily: 'monospace' },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chatNome: { color: colors.texto, fontSize: 16, fontWeight: '600' },
  chatId: { color: colors.textoFraco, fontSize: 12, marginTop: 2 },
  vazio: { color: colors.textoFraco, textAlign: 'center', marginTop: 20 },
});
