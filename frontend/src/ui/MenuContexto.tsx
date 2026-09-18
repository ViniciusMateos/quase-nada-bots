import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme';

export type ItemMenu = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  cor?: string;
  onPress: () => void;
};

const MENU_W = 184;
const ITEM_H = 48;

// Menu de long-press: aparece com scale+fade a partir do dedo, indo pra DIREITA e pra BAIXO
// (o dedo fica no canto sup-esquerdo do menu). Se não couber, gruda na borda — sempre dentro
// da tela. Some na hora ao tocar fora (animationType none, sem delay).
// Portado do brechó (o esqueleto que o Vinicius gosta), adaptado pro tema estático dos bots.
export function MenuContexto({
  visible, x, y, onClose, itens,
}: { visible: boolean; x: number; y: number; onClose: () => void; itens: ItemMenu[] }) {
  const insets = useSafeAreaInsets();
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.85)).current;
  const [montado, setMontado] = useState(false);
  // snapshot da posição/itens enquanto aberto (pra manter durante a animação de saída)
  const snap = useRef<{ x: number; y: number; itens: ItemMenu[] }>({ x: 0, y: 0, itens: [] });
  if (visible) snap.current = { x, y, itens };

  useEffect(() => {
    if (visible) {
      setMontado(true);
      fade.setValue(0); scale.setValue(0.85);
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: 130, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, tension: 220, friction: 15, useNativeDriver: true }),
      ]).start();
    } else if (montado) {
      Animated.parallel([
        Animated.timing(fade, { toValue: 0, duration: 110, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.9, duration: 110, useNativeDriver: true }),
      ]).start(() => setMontado(false));
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!montado) return null;

  const { x: px, y: py, itens: its } = snap.current;
  const W = Dimensions.get('window').width;
  const H = Dimensions.get('window').height;
  const menuH = its.length * ITEM_H + 8;
  // canto sup-esquerdo do menu no dedo (+4 de respiro): vai pra DIREITA e pra BAIXO. Clampa nas
  // bordas pra nunca sair da tela — se estourar embaixo, sobe só o necessário pra caber.
  const left = Math.min(Math.max(8, px + 4), W - MENU_W - 8);
  const top = Math.min(Math.max(insets.top + 8, py + 4), H - menuH - insets.bottom - 8);

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View style={[styles.menu, { left, top, transform: [{ scale }] }]}>
          {its.map((it, i) => (
            <React.Fragment key={it.label}>
              {i > 0 && <View style={styles.sep} />}
              <TouchableOpacity style={styles.item} onPress={it.onPress} activeOpacity={0.7}>
                <Ionicons name={it.icon} size={19} color={it.cor ?? colors.texto} />
                <Text style={[styles.txt, it.cor ? { color: it.cor } : null]}>{it.label}</Text>
              </TouchableOpacity>
            </React.Fragment>
          ))}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  menu: {
    position: 'absolute', width: MENU_W, backgroundColor: colors.card2, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border, paddingVertical: 4,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 12,
  },
  item: { height: ITEM_H, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  txt: { color: colors.texto, fontSize: 15, fontWeight: '600' },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginHorizontal: 8 },
});
