import React, { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { RouteProp, useFocusEffect, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api, Chat } from '@/lib/api';
import { colors } from '@/theme';
import { Aparece, Botao, Card } from '@/ui/components';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Rt = RouteProp<RootStackParamList, 'Chats'>;
type Tipo = 'grupo' | 'pessoa';

export function ChatsScreen() {
  const { botId } = useRoute<Rt>().params;
  const [chats, setChats] = useState<Chat[]>([]);
  const [tipo, setTipo] = useState<Tipo>('grupo');
  const [nome, setNome] = useState('');
  const [tid, setTid] = useState('');
  const [adicionando, setAdicionando] = useState(false);

  const carregar = useCallback(() => {
    api.getChats(botId).then(setChats).catch(() => {});
  }, [botId]);
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  // pessoa → guarda com @ na frente (rótulo); grupo → nome puro
  function nomeFinal() {
    const n = nome.trim();
    if (tipo === 'pessoa') return n.startsWith('@') ? n : `@${n}`;
    return n;
  }

  async function adicionar() {
    if (!nome.trim() || !tid.trim()) {
      Alert.alert('Faltou', `Preencha o ${tipo === 'pessoa' ? '@usuário' : 'nome'} e o thread_id.`);
      return;
    }
    setAdicionando(true);
    try {
      await api.addChat(botId, nomeFinal(), tid.trim());
      setNome(''); setTid(''); carregar();
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

  const ehPessoa = tipo === 'pessoa';

  return (
    <View style={styles.tela}>
      <Aparece style={{ margin: 16 }}>
      <Card style={{ gap: 12 }}>
        <Text style={styles.label}>Novo chat</Text>

        {/* Grupo x Pessoa */}
        <View style={styles.seg}>
          {(['grupo', 'pessoa'] as Tipo[]).map((t) => (
            <TouchableOpacity key={t} onPress={() => setTipo(t)}
              style={[styles.segItem, tipo === t && styles.segOn]}>
              <Ionicons name={t === 'grupo' ? 'people' : 'person'} size={15}
                color={tipo === t ? '#0F0F0F' : colors.textoFraco} />
              <Text style={[styles.segTxt, tipo === t && styles.segTxtOn]}>
                {t === 'grupo' ? 'Grupo' : 'Pessoa'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TextInput
          value={nome} onChangeText={setNome}
          placeholder={ehPessoa ? '@usuario' : 'Nome do grupo (ex: vaitomanoquasenada)'}
          placeholderTextColor={colors.textoFraco}
          autoCapitalize="none" autoCorrect={false}
          style={styles.input} />
        <TextInput value={tid} onChangeText={setTid} placeholder="thread_id (só números)"
          placeholderTextColor={colors.textoFraco} keyboardType="numeric" style={styles.input} />
        <Botao title="Adicionar chat" onPress={adicionar} loading={adicionando} />

        <View style={styles.dicaBox}>
          <Text style={styles.dicaTitulo}>Onde acho o thread_id?</Text>
          <Text style={styles.dica}>
            {ehPessoa
              ? 'Abra a DM da pessoa no instagram.com e copie o número que aparece na URL:'
              : 'Abra o grupo no instagram.com e copie o número que aparece na URL:'}
          </Text>
          <Text style={styles.dicaMono}>{'instagram.com/direct/t/<ESSE_NÚMERO>/'}</Text>
          <Text style={styles.dicaObs}>
            Funciona igual pra grupo ou pessoa — o que muda é só o @ no nome. Adicionar só
            pelo @ (sem thread_id) vem quando o login do Instagram estiver plugado.
          </Text>
        </View>
      </Card>
      </Aparece>
      <FlatList
        data={chats}
        keyExtractor={(c) => c.thread_id}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 24 }}
        ListEmptyComponent={<Text style={styles.vazio}>Nenhum chat salvo ainda.</Text>}
        renderItem={({ item, index }) => (
          <Aparece delay={index * 50}>
            <Card style={styles.linha}>
              <Ionicons name={item.nome.startsWith('@') ? 'person-circle' : 'people-circle'}
                size={26} color={colors.textoFraco} />
              <View style={{ flex: 1 }}>
                <Text style={styles.chatNome}>{item.nome}</Text>
                <Text style={styles.chatId}>{item.thread_id}</Text>
              </View>
              <TouchableOpacity onPress={() => remover(item)} hitSlop={10}>
                <Ionicons name="trash-outline" size={20} color={colors.erro} />
              </TouchableOpacity>
            </Card>
          </Aparece>
        )}
      />
    </View>
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
  segTxt: { color: colors.textoFraco, fontWeight: '600' },
  segTxtOn: { color: '#0F0F0F', fontWeight: '700' },
  input: { backgroundColor: colors.card2, color: colors.texto, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border },
  dicaBox: { backgroundColor: colors.card2, borderRadius: 10, padding: 12, gap: 4 },
  dicaTitulo: { color: colors.texto, fontSize: 13, fontWeight: '700' },
  dica: { color: colors.textoFraco, fontSize: 12, lineHeight: 17 },
  dicaMono: { color: colors.texto, fontSize: 12, fontFamily: 'monospace' },
  dicaObs: { color: colors.textoFraco, fontSize: 11, lineHeight: 16, marginTop: 4, fontStyle: 'italic' },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chatNome: { color: colors.texto, fontSize: 16, fontWeight: '600' },
  chatId: { color: colors.textoFraco, fontSize: 12, marginTop: 2 },
  vazio: { color: colors.textoFraco, textAlign: 'center', marginTop: 20 },
});
