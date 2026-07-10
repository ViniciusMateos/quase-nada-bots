import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '@/theme';
import { Aparece, Botao, Card } from '@/ui/components';
import { env } from '@/config/env';
import { registrarPush, testarProgresso } from '@/lib/push';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function SettingsScreen() {
  const nav = useNavigation<Nav>();
  const [ativando, setAtivando] = useState(false);
  const [testando, setTestando] = useState(false);

  async function testar() {
    setTestando(true);
    try {
      const ok = await testarProgresso();
      if (!ok) Alert.alert('Ops', 'Precisa permitir as notificações.');
    } finally {
      setTestando(false);
    }
  }

  async function ativarNotificacoes() {
    setAtivando(true);
    try {
      const ok = await registrarPush();   // pede permissão + registra o device (só em build)
      Alert.alert(ok ? 'Notificações ligadas' : 'Ops', ok
        ? 'Você vai receber um push quando uma run terminar.'
        : 'Não consegui registrar (precisa de dev build e permissão).');
    } catch {
      Alert.alert('Ops', 'Não consegui ativar as notificações.');
    } finally {
      setAtivando(false);
    }
  }

  return (
    <View style={styles.tela}>
      <Aparece>
        <Card style={{ gap: 12 }}>
          <Text style={styles.label}>Instagram</Text>
          <Text style={styles.dica}>Loga na sua conta do Instagram uma vez e conecta todos os bots de uma vez.</Text>
          <Botao title="Conectar Instagram" cor={colors.marca} txtCor="#fff"
            onPress={() => nav.navigate('InstagramLogin')} />
        </Card>
      </Aparece>

      <Aparece delay={80}>
        <Card style={{ gap: 12 }}>
          <Text style={styles.label}>Notificações</Text>
          <Text style={styles.dica}>Push com a barrinha de progresso enquanto a run roda, e um aviso quando termina.</Text>
          <Botao title="Ativar notificações" onPress={ativarNotificacoes} loading={ativando} />
          <Botao title="Testar barrinha (local)" cor={colors.card2} txtCor={colors.texto}
            onPress={testar} loading={testando} />
          <Text style={styles.dica}>O teste roda até no Expo Go. Toca e trava o celular pra ver a barrinha atualizando no lock screen.</Text>
        </Card>
      </Aparece>

      <Aparece delay={160}>
        <Card style={{ gap: 6 }}>
          <Text style={styles.label}>Servidor</Text>
          <Text style={styles.dica}>Conectado em {env.apiBaseUrl}</Text>
        </Card>
      </Aparece>
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.bg, padding: 16, gap: 12 },
  label: { color: colors.textoFraco, fontSize: 12, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase' },
  dica: { color: colors.textoFraco, fontSize: 12, lineHeight: 17 },
});
