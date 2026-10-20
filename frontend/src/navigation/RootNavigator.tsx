import React, { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { DarkTheme, NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Notifications from 'expo-notifications';
import { colors } from '@/theme';
import { registrarPush } from '@/lib/push';
import { BarraBotsGlobal } from '@/ui/BarraBotsGlobal';
import { BotaoVoltar } from '@/ui/BotaoVoltar';
import { interacaoBus } from '@/ui/interacaoBus';
import { BotScreen } from '@/screens/BotScreen';
import { RunScreen } from '@/screens/RunScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { ChatsScreen } from '@/screens/ChatsScreen';
import { EditModoScreen } from '@/screens/EditModoScreen';
import { InstagramLoginScreen } from '@/screens/InstagramLoginScreen';
import { CriarContaScreen } from '@/screens/CriarContaScreen';
import { ContasIgScreen } from '@/screens/ContasIgScreen';
import { EmuladorScreen } from '@/screens/EmuladorScreen';
import { CronogramaScreen } from '@/screens/CronogramaScreen';
import { VerificandoContaScreen } from '@/screens/VerificandoContaScreen';
import { HistoricoScreen } from '@/screens/HistoricoScreen';

export type RootStackParamList = {
  Bot: { botId: string; nome: string };
  Run: { runId: string; nome: string };
  Settings: undefined;
  Historico: undefined;
  Chats: { botId: string };
  EditModo: { botId: string; modoNome: string; criar?: boolean };
  ContasIg: undefined;
  Emulador: undefined;
  Cronograma: undefined;
  VerificandoConta: { contaId?: string; label?: string; botId: string; nome: string };
  InstagramLogin: { label?: string; senha?: string } | undefined;
  CriarConta: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

// Roteia o tap numa notificação:
//  - lembrete do cronograma → cai na Home e abre a tela "Verificando conta" (LoadingDog +
//    mensagens): ela valida a sessão e então redireciona pro Bot (sessão viva) ou pro
//    reconectar (sessão caída) — o usuário vê o que está acontecendo em vez de tela parada;
//  - push de run em andamento (runId) → tela da Run.
function aoTocarNotif(data: unknown) {
  const d = (data ?? {}) as {
    runId?: string; bot?: string; titulo?: string; tipo?: string; botId?: string; nome?: string;
    conta?: string; conta_id?: string;
  };
  if (!navigationRef.isReady()) return;
  if (d.tipo === 'cronograma') {
    // começa na Home (base) e empilha a tela de verificação — a validação (e o feedback) vive lá
    navigationRef.reset({ index: 0, routes: [{ name: 'Emulador' }] });
    navigationRef.navigate('VerificandoConta', {
      contaId: d.conta_id, label: d.conta,
      botId: d.botId || 'human-warmup', nome: d.nome || 'Aquecimento Humano',
    });
    return;
  }
  if (d.runId) {
    // usa o título do PROCESSO ("Conectando Instagram" no connect, "Auto Follow" na run) —
    // o id cru do bot deixava "Run — auto-follow" no conectar, que não é universal.
    const nome = d.titulo || (d.bot ? `Run — ${d.bot}` : 'Run');
    navigationRef.navigate('Run', { runId: d.runId, nome });
  }
}

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg, card: colors.card, text: colors.texto,
    primary: colors.laranja, border: colors.border,
  },
};

export function RootNavigator() {
  useEffect(() => {
    if (Platform.OS === 'web') return;   // push/notificações são nativos — na web não rola
    // auto-registra o device pra push (no-op no Expo Go/simulador)
    registrarPush();
    // tocou numa notificação → abre a Run correspondente
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      aoTocarNotif(resp.notification.request.content.data);
    });
    // app aberto por uma notificação (estava fechado)
    Notifications.getLastNotificationResponseAsync().then((resp) => {
      if (resp) aoTocarNotif(resp.notification.request.content.data);
    });
    return () => sub.remove();
  }, []);

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      {/* avisa a barra flutuante que o usuário tocou/scrollou a tela, pra ela se recolher
          em bolha. Retornar false = NÃO vira responder (não rouba o toque de ninguém). */}
      <View
        style={{ flex: 1 }}
        onStartShouldSetResponderCapture={() => { interacaoBus.emitir(); return false; }}>
      <Stack.Navigator
        initialRouteName="Emulador"
        screenOptions={{
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.texto,
          contentStyle: { backgroundColor: colors.bg },
          // Botão de voltar em JS (chama goBack()) no lugar do nativo, que trava no iOS 26
          // — ver BotaoVoltar. Só aparece quando dá pra voltar; o gesto de arrastar segue
          // funcionando normal.
          headerLeft: (props) => (props.canGoBack ? <BotaoVoltar {...props} /> : undefined),
        }}>
        {/* tela inicial = Emulador (sem header nativo: a BarraTopo é a barra de cima). A tela do
            servidor (Hub) saiu em 20/10/2026 — tudo roda no emulador. */}
        <Stack.Screen name="Bot" component={BotScreen} options={({ route }) => ({ title: route.params.nome })} />
        <Stack.Screen name="Run" component={RunScreen} options={({ route }) => ({ title: route.params.nome })} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Configurações' }} />
        <Stack.Screen name="Historico" component={HistoricoScreen} options={{ title: 'Histórico' }} />
        <Stack.Screen name="Chats" component={ChatsScreen} options={{ title: 'Chats salvos' }} />
        <Stack.Screen name="EditModo" component={EditModoScreen}
          options={({ route }) => ({ title: `Modo: ${route.params.modoNome}` })} />
        <Stack.Screen name="ContasIg" component={ContasIgScreen}
          options={{ title: 'Contas do Instagram' }} />
        <Stack.Screen name="Emulador" component={EmuladorScreen}
          options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="Cronograma" component={CronogramaScreen}
          options={{ title: 'Cronograma' }} />
        <Stack.Screen name="VerificandoConta" component={VerificandoContaScreen}
          options={{ title: 'Verificando conta' }} />
        <Stack.Screen name="InstagramLogin" component={InstagramLoginScreen}
          options={{ title: 'Conectar Instagram' }} />
        <Stack.Screen name="CriarConta" component={CriarContaScreen}
          options={{ title: 'Criar Conta' }} />
      </Stack.Navigator>
      </View>
      <BarraBotsGlobal onAbrir={(runId, titulo) => {
        if (navigationRef.isReady()) navigationRef.navigate('Run', { runId, nome: titulo });
      }} />
    </NavigationContainer>
  );
}
