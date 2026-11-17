import React, { useState } from 'react';
import { LayoutAnimation, Platform, StyleSheet, Text, TouchableOpacity, UIManager, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme';
import { Card } from '@/ui/components';

// "Sobre o bot" no topo da tela do bot (13/11/2026): no hub em grade a descrição é cortada em 3 linhas pro
// card caber — aqui ela aparece inteira. Começa recolhida (3 linhas) com "ver mais" quando é longa.

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const LINHAS = 3;

export function SobreBot({ texto }: { texto?: string | null }) {
  const [aberto, setAberto] = useState(false);
  // na web o onTextLayout não conta linhas: decide pelo tamanho do texto
  const [longo, setLongo] = useState(Platform.OS === 'web' ? (texto?.length ?? 0) > 120 : false);
  if (!texto) return null;
  const alternar = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setAberto((v) => !v);
  };
  return (
    <Card>
      <View style={styles.head}>
        <Ionicons name="information-circle-outline" size={16} color={colors.marca} />
        <Text style={styles.titulo}>Sobre o bot</Text>
      </View>
      <Text style={styles.texto} numberOfLines={aberto ? undefined : LINHAS}
        onTextLayout={(e) => { if (!aberto && e.nativeEvent.lines.length >= LINHAS) setLongo(true); }}>
        {texto}
      </Text>
      {longo ? (
        <TouchableOpacity onPress={alternar} hitSlop={8} style={styles.verMais}>
          <Text style={styles.verMaisTxt}>{aberto ? 'ver menos' : 'ver mais'}</Text>
          <Ionicons name={aberto ? 'chevron-up' : 'chevron-down'} size={13} color={colors.marca} />
        </TouchableOpacity>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  titulo: { color: colors.textoFraco, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  texto: { color: colors.texto, fontSize: 14, lineHeight: 20 },
  verMais: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, alignSelf: 'flex-start' },
  verMaisTxt: { color: colors.marca, fontSize: 13, fontWeight: '700' },
});
