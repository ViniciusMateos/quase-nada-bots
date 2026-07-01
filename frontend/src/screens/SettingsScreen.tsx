import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '@/theme';
import { Botao, Card } from '@/ui/components';
import { env } from '@/config/env';
import { api } from '@/lib/api';
import { getServerUrl, getToken, setServerUrl, setToken } from '@/lib/tokenStorage';

export function SettingsScreen() {
  const [url, setUrl] = useState('');
  const [token, setTok] = useState('');

  useEffect(() => {
    getServerUrl().then((v) => setUrl(v ?? env.apiBaseUrl));
    getToken().then((v) => setTok(v ?? ''));
  }, []);

  async function salvar() {
    await setServerUrl(url.trim());
    await setToken(token.trim());
    try {
      await api.listBots();
      Alert.alert('Conectado!', 'Servidor e token OK. 🤖');
    } catch {
      Alert.alert('Ops', 'Salvei, mas não consegui conectar. Confira a URL e o token.');
    }
  }

  return (
    <View style={styles.tela}>
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
        <Botao title="Salvar e conectar" onPress={salvar} />
      </Card>
      <Text style={styles.dica}>
        No dev, use o IP do seu PC na rede (ex: http://192.168.0.10:8010). Na Oracle, o
        endereço público do backend.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.bg, padding: 16, gap: 12 },
  label: { color: colors.textoFraco, fontSize: 12, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase' },
  input: { backgroundColor: colors.card2, color: colors.texto, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border },
  dica: { color: colors.textoFraco, fontSize: 12, lineHeight: 17 },
});
