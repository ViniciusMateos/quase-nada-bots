import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '@/theme';
import { Aparece, Botao, Card } from '@/ui/components';
import { env } from '@/config/env';
import { registrarPush } from '@/lib/push';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function SettingsScreen() {
  const nav = useNavigation<Nav>();
  const [ativando, setAtivando] = useState(false);

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
    <ScrollView style={styles.tela} contentContainerStyle={styles.conteudo}
      showsVerticalScrollIndicator={false}>
      <Aparece>
        <Card style={{ gap: 12 }}>
          <Text style={styles.label}>Instagram</Text>
          <Text style={styles.dica}>Conecte uma ou mais contas e escolha qual fica ativa (a que os bots rodam). Dá pra trocar num toque, sem relogar.</Text>
          <Botao title="Contas do Instagram" cor={colors.marca} txtCor="#fff"
            onPress={() => nav.navigate('ContasIg')} />
        </Card>
      </Aparece>

      <Aparece delay={80}>
        <Card style={{ gap: 12 }}>
          <Text style={styles.label}>Notificações</Text>
          <Text style={styles.dica}>Push com a barrinha de progresso enquanto a run roda, e um aviso quando termina.</Text>
          <Botao title="Ativar notificações" onPress={ativarNotificacoes} loading={ativando} />
        </Card>
      </Aparece>

      <Aparece delay={160}>
        <Card style={{ gap: 6 }}>
          <Text style={styles.label}>Servidor</Text>
          <Text style={styles.dica}>Conectado em {env.apiBaseUrl}</Text>
        </Card>
      </Aparece>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.bg },
  conteudo: { padding: 16, gap: 12, paddingBottom: 48 },
  label: { color: colors.textoFraco, fontSize: 12, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase' },
  dica: { color: colors.textoFraco, fontSize: 12, lineHeight: 17 },
});
