import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, Proxy } from '@/lib/api';
import { colors } from '@/theme';
import { Aparece, Botao, Card } from '@/ui/components';
import { TelaCarregando } from '@/ui/LoadingDog';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rt = RouteProp<RootStackParamList, 'Proxy'>;

const VAZIO: Proxy = { enabled: false, server: '', username: '', password: '' };

export function ProxyScreen() {
  const nav = useNavigation<Nav>();
  const { botId } = useRoute<Rt>().params;
  const [proxy, setProxy] = useState<Proxy>(VAZIO);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    api.getProxy(botId)
      .then((p) => setProxy({ ...VAZIO, ...p }))
      .catch(() => {})
      .finally(() => setCarregando(false));
  }, [botId]);

  const set = (k: keyof Proxy, v: string | boolean) => setProxy((p) => ({ ...p, [k]: v }));

  async function salvar() {
    if (proxy.enabled && !proxy.server.trim()) {
      Alert.alert('Faltou', 'Preencha o servidor (ex: http://ip:porta) ou desligue o proxy.');
      return;
    }
    setSalvando(true);
    try {
      await api.putProxy(botId, {
        ...proxy, server: proxy.server.trim(), username: proxy.username.trim(),
      });
      Alert.alert('Salvo!', 'Proxy atualizado. Vale a partir da próxima run. 🌐');
      nav.goBack();
    } catch {
      Alert.alert('Ops', 'Não consegui salvar o proxy.');
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) return <TelaCarregando />;

  return (
    <ScrollView style={styles.tela} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Aparece>
      <Card style={{ gap: 16 }}>
        <View style={styles.linhaBool}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Usar proxy</Text>
            <Text style={styles.sub}>Mascara o IP do servidor (recomendado na Oracle).</Text>
          </View>
          <Switch value={proxy.enabled} onValueChange={(v) => set('enabled', v)}
            trackColor={{ true: colors.marca, false: colors.border }} thumbColor="#fff" />
        </View>

        <View>
          <Text style={styles.label}>Servidor</Text>
          <TextInput value={proxy.server} onChangeText={(t) => set('server', t)}
            autoCapitalize="none" autoCorrect={false} keyboardType="url"
            placeholder="http://ip:porta  (ou socks5://ip:porta)" placeholderTextColor={colors.textoFraco}
            style={styles.input} />
        </View>
        <View>
          <Text style={styles.label}>Usuário (opcional)</Text>
          <TextInput value={proxy.username} onChangeText={(t) => set('username', t)}
            autoCapitalize="none" autoCorrect={false}
            placeholder="usuário do proxy" placeholderTextColor={colors.textoFraco} style={styles.input} />
        </View>
        <View>
          <Text style={styles.label}>Senha (opcional)</Text>
          <TextInput value={proxy.password} onChangeText={(t) => set('password', t)}
            autoCapitalize="none" autoCorrect={false} secureTextEntry
            placeholder="senha do proxy" placeholderTextColor={colors.textoFraco} style={styles.input} />
        </View>
      </Card>
      </Aparece>
      <Text style={styles.dica}>
        Formato do servidor: {'http://host:porta'}, {'https://host:porta'} ou {'socks5://host:porta'}.
        Proxy residencial/móvel some com o bloqueio de IP de datacenter.
      </Text>
      <Botao title="Salvar proxy" onPress={salvar} loading={salvando} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.bg },
  label: { color: colors.texto, fontSize: 14, fontWeight: '600' },
  sub: { color: colors.textoFraco, fontSize: 12, marginTop: 2 },
  linhaBool: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  input: { backgroundColor: colors.card2, color: colors.texto, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border, marginTop: 6 },
  dica: { color: colors.textoFraco, fontSize: 12, lineHeight: 17 },
});
