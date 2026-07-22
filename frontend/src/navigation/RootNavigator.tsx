import React, { useEffect } from 'react';
import { View } from 'react-native';
import { DarkTheme, NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Notifications from 'expo-notifications';
import { colors } from '@/theme';
import { registrarPush } from '@/lib/push';
import { BarraBotsGlobal } from '@/ui/BarraBotsGlobal';
import { interacaoBus } from '@/ui/interacaoBus';
import { HubScreen } from '@/screens/HubScreen';
import { BotScreen } from '@/screens/BotScreen';
import { RunScreen } from '@/screens/RunScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { ChatsScreen } from '@/screens/ChatsScreen';
import { EditModoScreen } from '@/screens/EditModoScreen';
import { InstagramLoginScreen } from '@/screens/InstagramLoginScreen';
import { HistoricoScreen } from '@/screens/HistoricoScreen';

export type RootStackParamList = {
  Hub: undefined;
  Bot: { botId: string; nome: string };
  Run: { runId: string; nome: string };
  Settings: undefined;
  Historico: undefined;
  Chats: { botId: string };
  EditModo: { botId: string; modoNome: string; criar?: boolean };
  InstagramLogin: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

// Abre a tela da Run ao tocar numa notificação que carrega runId.
function irParaRun(data: unknown) {
  const d = (data ?? {}) as { runId?: string; bot?: string };
  if (d.runId && navigationRef.isReady()) {
    navigationRef.navigate('Run', { runId: d.runId, nome: d.bot ? `Run — ${d.bot}` : 'Run' });
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
    // auto-registra o device pra push (no-op no Expo Go/simulador)
    registrarPush();
    // tocou numa notificação → abre a Run correspondente
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      irParaRun(resp.notification.request.content.data);
    });
    // app aberto por uma notificação (estava fechado)
    Notifications.getLastNotificationResponseAsync().then((resp) => {
      if (resp) irParaRun(resp.notification.request.content.data);
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
        screenOptions={{
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.texto,
          contentStyle: { backgroundColor: colors.bg },
        }}>
        <Stack.Screen name="Hub" component={HubScreen} options={{ title: 'Quase Nada Bots' }} />
        <Stack.Screen name="Bot" component={BotScreen} options={({ route }) => ({ title: route.params.nome })} />
        <Stack.Screen name="Run" component={RunScreen} options={({ route }) => ({ title: route.params.nome })} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Configurações' }} />
        <Stack.Screen name="Historico" component={HistoricoScreen} options={{ title: 'Histórico' }} />
        <Stack.Screen name="Chats" component={ChatsScreen} options={{ title: 'Chats salvos' }} />
        <Stack.Screen name="EditModo" component={EditModoScreen}
          options={({ route }) => ({ title: `Modo: ${route.params.modoNome}` })} />
        <Stack.Screen name="InstagramLogin" component={InstagramLoginScreen}
          options={{ title: 'Conectar Instagram' }} />
      </Stack.Navigator>
      </View>
      <BarraBotsGlobal onAbrir={(runId, titulo) => {
        if (navigationRef.isReady()) navigationRef.navigate('Run', { runId, nome: titulo });
      }} />
    </NavigationContainer>
  );
}
