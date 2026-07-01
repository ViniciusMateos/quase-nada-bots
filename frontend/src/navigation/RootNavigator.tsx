import React from 'react';
import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '@/theme';
import { HubScreen } from '@/screens/HubScreen';
import { BotScreen } from '@/screens/BotScreen';
import { RunScreen } from '@/screens/RunScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';

export type RootStackParamList = {
  Hub: undefined;
  Bot: { botId: string; nome: string };
  Run: { runId: string; nome: string };
  Settings: undefined;
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
      </Stack.Navigator>
    </NavigationContainer>
  );
}
