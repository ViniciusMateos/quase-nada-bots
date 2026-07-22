import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '@/theme';
import { Aparece, Botao, Card } from '@/ui/components';
import { LoadingDog } from '@/ui/LoadingDog';
import { env } from '@/config/env';
import { api } from '@/lib/api';
import { garantirLA, encerrarLA } from '@/lib/la';
import { registrarPush, testarProgresso } from '@/lib/push';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function SettingsScreen() {
  const nav = useNavigation<Nav>();
  const [ativando, setAtivando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [laBusy, setLaBusy] = useState<number | null>(null);   // 0 = encerrar, 1-4 = simular

  async function simularLA(n: number) {
    setLaBusy(n);
    try {
      await garantirLA('Teste LA');            // cria a LA + registra o token (idempotente)
      let r = await api.testLiveActivity(n);
      if (!r?.ok) { await espera(2200); r = await api.testLiveActivity(n); }   // token acordando
      if (!r?.ok) {
        Alert.alert('A barra tá acordando', 'A Live Activity ainda tá sendo criada — toca de novo daqui uns 2s.');
      }
    } catch {
      Alert.alert('Ops', 'Não consegui simular a Live Activity.');
    } finally {
      setLaBusy(null);
    }
  }

  async function encerrarLATeste() {
    setLaBusy(0);
    try { await api.testLiveActivity(0); await encerrarLA(); } catch { /* ok */ }
    finally { setLaBusy(null); }
  }

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
    <ScrollView style={styles.tela} contentContainerStyle={styles.conteudo}
      showsVerticalScrollIndicator={false}>
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
        <Card style={{ gap: 12 }}>
          <Text style={styles.label}>Testes da Live Activity</Text>
          <Text style={styles.dica}>Simula a barra viva com N bots pra ver como renderiza — sem esperar bot de verdade. Toca num número, trava o celular e olha o lock screen / Dynamic Island.</Text>
          <View style={styles.laLinha}>
            {[1, 2, 3, 4].map((n) => (
              <TouchableOpacity key={n} activeOpacity={0.85}
                style={[styles.laBtn, laBusy === n && styles.laBtnBusy]}
                disabled={laBusy !== null} onPress={() => simularLA(n)}>
                {laBusy === n
                  ? <LoadingDog size={22} color={colors.marca} />
                  : <Text style={styles.laBtnTxt}>{n}</Text>}
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.dicaMini}>1 = view de um bot · 2 a 4 = uma barrinha por bot</Text>
          <Botao title="Encerrar LA de teste" cor={colors.card2} txtCor={colors.texto}
            onPress={encerrarLATeste} loading={laBusy === 0} />
          <Text style={styles.dica}>Rode com os bots parados — senão o progresso real sobrescreve o teste em segundos.</Text>
        </Card>
      </Aparece>

      <Aparece delay={240}>
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
  dicaMini: { color: colors.textoFraco, fontSize: 11, marginTop: -4, opacity: 0.8 },
  laLinha: { flexDirection: 'row', gap: 10 },
  laBtn: {
    flex: 1, height: 52, borderRadius: 14, backgroundColor: colors.card2,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  laBtnBusy: { opacity: 0.55 },
  laBtnTxt: { color: colors.texto, fontSize: 22, fontWeight: '800' },
});
