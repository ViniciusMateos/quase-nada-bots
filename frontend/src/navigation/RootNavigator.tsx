import React from 'react';
import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '@/theme';
import { HubScreen } from '@/screens/HubScreen';
import { BotScreen } from '@/screens/BotScreen';
import { RunScreen } from '@/screens/RunScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { ChatsScreen } from '@/screens/ChatsScreen';
import { EditModoScreen } from '@/screens/EditModoScreen';
import { InstagramLoginScreen } from '@/screens/InstagramLoginScreen';
import { ProxyScreen } from '@/screens/ProxyScreen';

export type RootStackParamList = {
  Hub: undefined;
  Bot: { botId: string; nome: string };
  Run: { runId: string; nome: string };
  Settings: undefined;
  Chats: { botId: string };
  EditModo: { botId: string; modoNome: string };
  InstagramLogin: undefined;
  Proxy: { botId: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg, card: colors.card, text: colors.texto,
    primary: colors.laranja, border: colors.border,
  },
};

export function RootNavigator() {
  return (
    <NavigationContainer theme={navTheme}>
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
        <Stack.Screen name="Chats" component={ChatsScreen} options={{ title: 'Chats salvos' }} />
        <Stack.Screen name="EditModo" component={EditModoScreen}
          options={({ route }) => ({ title: `Modo: ${route.params.modoNome}` })} />
        <Stack.Screen name="InstagramLogin" component={InstagramLoginScreen}
          options={{ title: 'Conectar Instagram' }} />
        <Stack.Screen name="Proxy" component={ProxyScreen} options={{ title: 'Proxy' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
