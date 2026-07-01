import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { colors } from '@/theme';

export function Botao({
  title, onPress, cor = colors.laranja, txtCor = '#0F0F0F', disabled,
}: { title: string; onPress: () => void; cor?: string; txtCor?: string; disabled?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled}
      style={[styles.botao, { backgroundColor: disabled ? colors.border : cor }]}>
      <Text style={[styles.botaoTxt, { color: txtCor }]}>{title}</Text>
    </TouchableOpacity>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Pill({ texto, cor }: { texto: string; cor: string }) {
  return (
    <View style={[styles.pill, { borderColor: cor }]}>
      <Text style={[styles.pillTxt, { color: cor }]}>{texto}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  botao: { paddingVertical: 13, paddingHorizontal: 18, borderRadius: 12, alignItems: 'center' },
  botaoTxt: { fontWeight: '700', fontSize: 15 },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  pillTxt: { fontSize: 12, fontWeight: '700' },
});
