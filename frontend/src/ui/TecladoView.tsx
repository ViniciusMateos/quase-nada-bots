import React from 'react';
import { KeyboardAvoidingView, Platform, ViewStyle } from 'react-native';
import { useHeaderHeight } from '@react-navigation/elements';

/**
 * Envolve telas COM input pra o teclado não cobrir os campos.
 * Usa a altura do header como offset (telas com header do navigator).
 * Em modal/tela sem header, passe offset={0}.
 */
export function TecladoView({ children, style, offset }:
  { children: React.ReactNode; style?: ViewStyle; offset?: number }) {
  const headerH = useHeaderHeight();
  return (
    <KeyboardAvoidingView
      style={[{ flex: 1 }, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={offset ?? headerH}>
      {children}
    </KeyboardAvoidingView>
  );
}
