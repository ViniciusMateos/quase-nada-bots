import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '@/lib/api';
import { colors } from '@/theme';
import { Aparece, Botao, Card } from '@/ui/components';
import { TecladoView } from '@/ui/TecladoView';
import { TelaCarregando } from '@/ui/LoadingDog';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rt = RouteProp<RootStackParamList, 'EditModo'>;
type Modos = Record<string, Record<string, unknown>>;

// rótulos amigáveis (auto-like + dm); cai no próprio nome se não achar
const LABELS: Record<string, string> = {
  aplicar_caps: 'Aplicar limites (caps)',
  max_follows_dia: 'Máx. follows por dia',
  max_follows_hora: 'Máx. follows por hora',
  max_posts_por_run: 'Máx. posts por run',
  limite_follows_run: 'Limite de follows reais/run (0 = sem)',
  delay_follow: 'Delay entre follows (s)',
  delay_post: 'Delay entre posts (s)',
  delay_acao_ui: 'Delay de navegação/UI (s)',
  pausa_longa_cada: 'Pausa longa a cada N follows',
  pausa_longa: 'Duração da pausa longa (s)',
  usar_delay_entre_chats: 'Esperar entre chats',
  delay_entre_chats: 'Delay entre chats (s)',
  active_hours: 'Janela de horário (h, 0–23)',
  pular_ja_seguidos: 'Pular já seguidos',
  pular_pendentes: 'Pular pedidos pendentes',
  seguir_privados: 'Seguir privados',
  start_from_oldest_se_vazio: 'Começar do mais antigo se vazio',
  max_dms_dia: 'Máx. DMs por dia',
  max_dms_hora: 'Máx. DMs por hora',
  max_dms_por_run: 'Máx. DMs por run',
  delay_dm: 'Delay entre DMs (s)',
};

function num(t: string): number {
  const n = parseFloat(t.replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

export function EditModoScreen() {
  const nav = useNavigation<Nav>();
  const { botId, modoNome, criar } = useRoute<Rt>().params;
  const [todos, setTodos] = useState<Modos>({});
  const [modo, setModo] = useState<Record<string, unknown>>({});
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    api.getModos(botId)
      .then((m) => {
        setTodos(m);
        // criar do zero: parte do template 'padrao' (ou o 1º modo) só pra ter os campos
        const base = criar ? (m['padrao'] ?? Object.values(m)[0] ?? {}) : (m[modoNome] ?? {});
        setModo({ ...base });
      })
      .catch(() => {})
      .finally(() => setCarregando(false));
  }, [botId, modoNome, criar]);

  const setCampo = (k: string, v: unknown) => setModo((prev) => ({ ...prev, [k]: v }));

  async function salvar(nome: string) {
    try {
      await api.putModos(botId, { ...todos, [nome]: modo });
      Alert.alert('Salvo!', `Modo "${nome}" salvo.`);
      nav.goBack();
    } catch {
      Alert.alert('Ops', 'Não consegui salvar.');
    }
  }

  function salvarComo(titulo: string) {
    Alert.prompt(titulo, 'Nome do modo (ex: turbo, seguro):', (nome) => {
      const n = (nome || '').trim();
      if (!n) return;
      if (todos[n] && n !== modoNome) {
        Alert.alert('Já existe', `Já tem um modo "${n}". Escolha outro nome.`);
        return;
      }
      salvar(n);
    });
  }

  if (carregando) return <TelaCarregando />;

  return (
    <TecladoView>
    <ScrollView style={styles.tela} contentContainerStyle={{ padding: 16, gap: 12 }}
      keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      {criar && <Text style={styles.info}>Novo modo a partir do "padrao" — ajuste os valores e dê um nome.</Text>}
      <Aparece>
      <Card style={{ gap: 16 }}>
        {Object.entries(modo).map(([k, v]) => (
          <Campo key={k} label={LABELS[k] ?? k} valor={v} onChange={(nv) => setCampo(k, nv)} />
        ))}
      </Card>
      </Aparece>
      {criar ? (
        <Botao title="Criar modo" onPress={() => salvarComo('Criar modo')} />
      ) : (
        <>
          <Botao title={`Salvar "${modoNome}"`} onPress={() => salvar(modoNome)} />
          <Botao title="Salvar como novo modo…" cor={colors.card2} txtCor={colors.texto}
            onPress={() => salvarComo('Salvar como novo modo')} />
        </>
      )}
    </ScrollView>
    </TecladoView>
  );
}

function Campo({ label, valor, onChange }: { label: string; valor: unknown; onChange: (v: unknown) => void }) {
  if (typeof valor === 'boolean') {
    return (
      <View style={styles.linhaBool}>
        <Text style={styles.label}>{label}</Text>
        <Switch value={valor} onValueChange={onChange}
          trackColor={{ true: colors.laranja, false: colors.border }} thumbColor="#fff" />
      </View>
    );
  }
  if (Array.isArray(valor) && valor.length === 2) {
    const arr = valor as number[];
    return (
      <View>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.range}>
          <TextInput style={styles.inputNum} keyboardType="numeric" value={String(arr[0])}
            onChangeText={(t) => onChange([num(t), arr[1]])} />
          <Text style={styles.ate}>até</Text>
          <TextInput style={styles.inputNum} keyboardType="numeric" value={String(arr[1])}
            onChangeText={(t) => onChange([arr[0], num(t)])} />
        </View>
      </View>
    );
  }
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} keyboardType="numeric" value={String(valor)}
        onChangeText={(t) => onChange(num(t))} />
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.bg },
  info: { color: colors.textoFraco, padding: 16 },
  label: { color: colors.textoFraco, fontSize: 13, fontWeight: '600', marginBottom: 6 },
  linhaBool: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  input: { backgroundColor: colors.card2, color: colors.texto, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: colors.border },
  range: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  inputNum: { flex: 1, backgroundColor: colors.card2, color: colors.texto, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: colors.border, textAlign: 'center' },
  ate: { color: colors.textoFraco },
});
