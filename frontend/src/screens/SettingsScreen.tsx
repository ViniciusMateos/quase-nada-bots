import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '@/theme';
import { Aparece, Botao, Card } from '@/ui/components';
import { env } from '@/config/env';
import { api } from '@/lib/api';
import { getServerUrl, getToken, setServerUrl, setToken } from '@/lib/tokenStorage';
import { registrarPush } from '@/lib/push';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function SettingsScreen() {
  const nav = useNavigation<Nav>();
  const [url, setUrl] = useState('');
  const [token, setTok] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    getServerUrl().then((v) => setUrl(v ?? env.apiBaseUrl));
    getToken().then((v) => setTok(v ?? ''));
  }, []);

  async function salvar() {
    setSalvando(true);
    await setServerUrl(url.trim());
    await setToken(token.trim());
    try {
      await api.listBots();
      const push = await registrarPush();   // pede permissão + registra o device (só em build)
      Alert.alert('Conectado!', push
        ? 'Servidor OK e notificações ligadas. 🔔'
        : 'Servidor e token OK. 🤖');
    } catch {
      Alert.alert('Ops', 'Salvei, mas não consegui conectar. Confira a URL e o token.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <View style={styles.tela}>
      <Aparece>
      <Card style={{ gap: 14 }}>
        <View>
          <Text style={styles.label}>URL do servidor</Text>
          <TextInput value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false}
            keyboardType="url" placeholder="http://192.168.0.10:8010" placeholderTextColor={colors.textoFraco}
            style={styles.input} />
        </View>
        <View>
          <Text style={styles.label}>Token</Text>
          <TextInput value={token} onChangeText={setTok} autoCapitalize="none" autoCorrect={false} secureTextEntry
            placeholder="BOTS_API_TOKEN" placeholderTextColor={colors.textoFraco} style={styles.input} />
        </View>
        <Botao title="Salvar e conectar" onPress={salvar} loading={salvando} />
      </Card>
      </Aparece>
      <Text style={styles.dica}>
        No dev, use o IP do seu PC na rede (ex: http://192.168.0.10:8010). Na Oracle, o
        endereço público do backend.
      </Text>

      <Aparece delay={80}>
      <Card style={{ gap: 12 }}>
        <Text style={styles.label}>Instagram</Text>
        <Text style={styles.dica}>
          Loga na sua conta do Instagram uma vez e conecta todos os bots de uma vez.
        </Text>
        <Botao title="🔗 Conectar Instagram" cor={colors.marca} txtCor="#fff"
          onPress={() => nav.navigate('InstagramLogin')} />
      </Card>
      </Aparece>
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.bg, padding: 16, gap: 12 },
  label: { color: colors.textoFraco, fontSize: 12, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase' },
  input: { backgroundColor: colors.card2, color: colors.texto, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border },
  dica: { color: colors.textoFraco, fontSize: 12, lineHeight: 17 },
});
