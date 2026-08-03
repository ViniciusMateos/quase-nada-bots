import React, { useCallback, useState } from 'react';
import { StyleSheet, Switch, Text, TouchableOpacity, View, ScrollView } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { api, Cronograma, CronTarefa } from '@/lib/api';
import { colors } from '@/theme';
import { Aparece, Card } from '@/ui/components';
import { TelaCarregando } from '@/ui/LoadingDog';
import { useDogRefresh } from '@/ui/DogRefresh';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const NOME_BOT: Record<string, string> = {
  'auto-follow': 'Auto Follow', 'dm-followers': 'DM Followers', 'human-warmup': 'Aquecimento Humano',
};
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function fmtData(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${DIAS[dt.getDay()]}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}
const hhmm = (t: CronTarefa) => `${String(t.hora).padStart(2, '0')}:${String(t.min).padStart(2, '0')}`;

export function CronogramaScreen() {
  const nav = useNavigation<Nav>();
  const [cron, setCron] = useState<Cronograma | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    const c = await api.getCronograma().catch(() => null);
    setCron(c);
  }, []);
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));
  const { scrollProps, dog, spacerEl } = useDogRefresh(carregar);

  async function toggle(v: boolean) {
    if (!cron) return;
    setCron({ ...cron, ativo: v });   // otimista
    setSalvando(true);
    try { await api.setCronograma(v); } catch { setCron({ ...cron, ativo: !v }); }
    finally { setSalvando(false); }
  }

  if (!cron) return <TelaCarregando />;

  const drop = cron.tipo === 'drop';
  const corSemana = drop ? colors.marca : colors.textoFraco;

  return (
    <View style={styles.tela}>
      {dog}
      <ScrollView style={styles.tela} contentContainerStyle={{ padding: 16, gap: 12 }} {...scrollProps}>
        {spacerEl}

        <Aparece>
          <Card style={{ gap: 12 }}>
            <View style={styles.linha}>
              <View style={{ flex: 1 }}>
                <Text style={styles.titulo}>Lembretes de rodar</Text>
                <Text style={styles.sub}>Um push na hora certa te avisa qual bot rodar em qual conta.</Text>
              </View>
              <Switch value={cron.ativo} onValueChange={toggle} disabled={salvando}
                trackColor={{ true: colors.marca, false: colors.border }} thumbColor="#fff" />
            </View>
          </Card>
        </Aparece>

        <Aparece delay={60}>
          <View style={styles.hojeRow}>
            <Text style={styles.hoje}>{fmtData(cron.data)}</Text>
            <View style={[styles.badge, { borderColor: corSemana }]}>
              <View style={[styles.badgeDot, { backgroundColor: corSemana }]} />
              <Text style={[styles.badgeTxt, { color: corSemana }]}>
                {drop ? 'SEMANA DE DROP' : 'SEMANA DE DESCANSO'}
              </Text>
            </View>
          </View>
        </Aparece>

        {!cron.ativo ? (
          <Text style={styles.vazio}>Lembretes desligados. Liga aí em cima pra receber os pushes.</Text>
        ) : cron.tarefas.length === 0 ? (
          <Text style={styles.vazio}>Nada agendado pra hoje. Aproveita e descansa as contas.</Text>
        ) : cron.tarefas.map((t, i) => (
          <Aparece key={`${t.conta}-${t.hora}-${t.min}-${i}`} delay={Math.min(i, 8) * 40}>
            <TouchableOpacity activeOpacity={0.7}
              onPress={() => nav.navigate('ContasIg')}>
              <Card style={styles.tarefa}>
                <View style={[styles.hora, t.enviado && { opacity: 0.5 }]}>
                  <Text style={styles.horaTxt}>{hhmm(t)}</Text>
                  {t.enviado ? <Ionicons name="checkmark-done" size={13} color={colors.ok} />
                    : <Ionicons name="time-outline" size={13} color={colors.textoFraco} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tarefaBot}>{NOME_BOT[t.bot] || t.bot} · @{t.conta}</Text>
                  <Text style={styles.tarefaSub}>modo "{t.modo}" — {t.desc}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textoFraco} />
              </Card>
            </TouchableOpacity>
          </Aparece>
        ))}

        <Text style={styles.rodapeDica}>
          Os horários são sorteados todo dia (sem padrão) e nunca caem duas contas na mesma faixa —
          é uma conta por vez, pra não juntar tudo no mesmo IP.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.bg },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titulo: { color: colors.texto, fontSize: 16, fontWeight: '800' },
  sub: { color: colors.textoFraco, fontSize: 12, lineHeight: 17, marginTop: 3 },
  hojeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  hoje: { color: colors.texto, fontSize: 15, fontWeight: '700', textTransform: 'capitalize' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeDot: { width: 7, height: 7, borderRadius: 999 },
  badgeTxt: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  vazio: { color: colors.textoFraco, textAlign: 'center', marginVertical: 24, lineHeight: 20 },
  tarefa: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  hora: { alignItems: 'center', gap: 3, width: 52 },
  horaTxt: { color: colors.texto, fontSize: 15, fontWeight: '800' },
  tarefaBot: { color: colors.texto, fontSize: 14, fontWeight: '700' },
  tarefaSub: { color: colors.textoFraco, fontSize: 12, marginTop: 2 },
  rodapeDica: { color: colors.textoFraco, fontSize: 11, lineHeight: 16, marginTop: 8, opacity: 0.8 },
});
