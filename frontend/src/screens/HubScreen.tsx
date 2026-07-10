import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { api, Bot, RunInfo } from '@/lib/api';
import { colors, statusCor } from '@/theme';
import { Aparece, BarraProgresso, Card, CartaoTocavel, Pill, Pulsar } from '@/ui/components';
import { TelaCarregando } from '@/ui/LoadingDog';
import { useDogRefresh } from '@/ui/DogRefresh';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function HubScreen() {
  const nav = useNavigation<Nav>();
  const [bots, setBots] = useState<[string, Bot][]>([]);
  const [runs, setRuns] = useState<RunInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true); setErro(null);
    try {
      const [b, r] = await Promise.all([api.listBots(), api.listRuns()]);
      setBots(Object.entries(b));
      setRuns(r);
    } catch {
      setErro('Não consegui conectar no servidor. Confira a URL e o token em Configurações.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  const { scrollProps, dog, spacerEl } = useDogRefresh(carregar);

  const ativos = runs.filter((r) => ['rodando', 'iniciando'].includes(r.status)).reverse();

  if (loading && bots.length === 0 && !erro) return <TelaCarregando />;

  return (
    <View style={styles.tela}>
      {dog}
      <FlatList
        data={bots}
        keyExtractor={([id]) => id}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        {...scrollProps}
        ListHeaderComponent={
          <>
          {spacerEl}
          <View style={{ gap: 12, marginBottom: 4 }}>
            <View style={styles.topo}>
              <Text style={styles.titulo}>Seus bots</Text>
              <View style={styles.topoAcoes}>
                <TouchableOpacity onPress={() => nav.navigate('Historico')} hitSlop={8}>
                  <Ionicons name="time-outline" size={23} color={colors.textoFraco} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => nav.navigate('Settings')} hitSlop={8}>
                  <Ionicons name="settings-outline" size={22} color={colors.textoFraco} />
                </TouchableOpacity>
              </View>
            </View>
            {erro && (
              <Card style={{ borderColor: colors.erro }}>
                <Text style={{ color: colors.erro }}>{erro}</Text>
              </Card>
            )}
            {ativos.length > 0 && (
              <Card>
                <Text style={styles.secao}>Rodando agora</Text>
                {ativos.map((r) => (
                  <TouchableOpacity key={r.id} style={styles.runItem}
                    onPress={() => nav.navigate('Run', { runId: r.id, nome: r.bot })}>
                    <View style={styles.runLinha}>
                      <Text style={styles.runTxt}>{r.bot}</Text>
                      <Pulsar>
                        <Pill texto={r.status} cor={statusCor[r.status] ?? colors.textoFraco} />
                      </Pulsar>
                    </View>
                    {r.progress && r.progress.total > 0 && (
                      <BarraProgresso done={r.progress.done} total={r.progress.total} label={r.progress.label} />
                    )}
                  </TouchableOpacity>
                ))}
              </Card>
            )}
          </View>
          </>
        }
        renderItem={({ item: [id, bot], index }) => (
          <Aparece delay={index * 60}>
            <CartaoTocavel onPress={() => nav.navigate('Bot', { botId: id, nome: bot.nome })}>
              <Text style={styles.botNome}>{bot.nome}</Text>
              <Text style={styles.botDesc}>{bot.descricao}</Text>
            </CartaoTocavel>
          </Aparece>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.bg },
  topo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  topoAcoes: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  titulo: { color: colors.texto, fontSize: 24, fontWeight: '800' },
  secao: { color: colors.textoFraco, fontSize: 12, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase' },
  runItem: { paddingVertical: 8, gap: 8 },
  runLinha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  runTxt: { color: colors.texto, fontSize: 15 },
  botNome: { color: colors.texto, fontSize: 18, fontWeight: '700' },
  botDesc: { color: colors.textoFraco, fontSize: 13, marginTop: 4 },
});
