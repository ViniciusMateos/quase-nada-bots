import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

// Barra de cima da tela inicial: título + histórico + configurações. Antes era o toggle
// Emulador ↔ Servidor; desde 20/10/2026 tudo roda no emulador e a tela do servidor saiu.
export function BarraTopo() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
      <Text style={styles.titulo}>Quase Nada Bots</Text>
      <View style={styles.acoes}>
        <TouchableOpacity onPress={() => nav.navigate('Historico')} hitSlop={8}>
          <Ionicons name="time-outline" size={22} color={colors.textoFraco} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => nav.navigate('Settings')} hitSlop={8}>
          <Ionicons name="settings-outline" size={21} color={colors.textoFraco} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingBottom: 10,
    backgroundColor: colors.bg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  titulo: { flex: 1, color: colors.texto, fontSize: 20, fontWeight: '800' },
  acoes: { flexDirection: 'row', alignItems: 'center', gap: 18 },
});
