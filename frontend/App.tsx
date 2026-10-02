import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { RootNavigator } from '@/navigation/RootNavigator';
import { SplashGate } from '@/ui/Splash';
import { initLA } from '@/lib/la';

export default function App() {
  // Live Activity automática (push-to-start): registra os tokens no server já no boot, pra o
  // cronograma poder LIGAR a barra sozinho mesmo com o app fechado. No-op fora do iOS 17.2+.
  useEffect(() => { initLA(); }, []);
  // GestureHandlerRootView: raiz dos gestos (segurar-e-arrastar pra reordenar os bots)
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <SplashGate>
          <RootNavigator />
        </SplashGate>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
