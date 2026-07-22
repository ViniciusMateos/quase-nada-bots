import 'react-native-gesture-handler';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from '@/navigation/RootNavigator';
import { SplashGate } from '@/ui/Splash';

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SplashGate>
        <RootNavigator />
      </SplashGate>
    </SafeAreaProvider>
  );
}
