import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackHeaderBackProps } from '@react-navigation/native-stack';

/**
 * Botão de voltar do header, em JS.
 *
 * WORKAROUND de um bug do react-native-screens no iOS 26 (issues #3294 e #3270): quando
 * a primeira tela da stack usa `headerShown: false` (a aba Emulador), o botão de voltar
 * NATIVO do header TRAVA depois que você mexe/scrolla/abre outra tela — só o gesto de
 * arrastar da borda continua voltando. Como `navigation.goBack()` continua funcionando,
 * trocamos o botão nativo por este, que chama goBack() na mão.
 *
 * É JS puro → vai por OTA, sem precisar de build novo (o fix "de verdade" é subir a versão
 * do react-native-screens, mas isso exige rebuild nativo).
 */
export function BotaoVoltar({ tintColor, label }: NativeStackHeaderBackProps) {
  const nav = useNavigation();
  const cor = tintColor ?? '#ffffff';
  return (
    <Pressable
      onPress={() => { if (nav.canGoBack()) nav.goBack(); }}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 16 }}
      style={({ pressed }) => [styles.wrap, pressed && { opacity: 0.45 }]}
      accessibilityRole="button"
      accessibilityLabel={label || 'Voltar'}>
      <Ionicons name="chevron-back" size={28} color={cor} style={styles.chevron} />
      {label ? <Text style={[styles.txt, { color: cor }]} numberOfLines={1}>{label}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, marginLeft: -6 },
  chevron: { marginRight: -1 },
  txt: { fontSize: 17, fontWeight: '400', maxWidth: 140 },
});
