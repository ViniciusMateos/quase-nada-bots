import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '@/theme';
import { LoadingDog } from '@/ui/LoadingDog';

// ── Botão: gradiente da marca por padrão (ou cor sólida via `cor`), press-scale e
//    loading com o LoadingDog ──
export function Botao({
  title, onPress, cor, txtCor, disabled, loading,
}: { title: string; onPress: () => void; cor?: string; txtCor?: string; disabled?: boolean; loading?: boolean }) {
  const scale = useRef(new Animated.Value(1)).current;
  const anima = (to: number) =>
    Animated.spring(scale, { toValue: to, useNativeDriver: true, friction: 6, tension: 120 }).start();
  const usarGradiente = !cor;
  const corTexto = txtCor ?? (usarGradiente ? '#FFFFFF' : '#0F0F0F');
  const conteudo = loading
    ? <LoadingDog size={26} color={corTexto} />
    : <Text style={[styles.botaoTxt, { color: corTexto }]}>{title}</Text>;
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        activeOpacity={0.9} onPress={onPress} disabled={disabled || loading}
        onPressIn={() => anima(0.96)} onPressOut={() => anima(1)}>
        {usarGradiente ? (
          <LinearGradient
            colors={disabled ? ([colors.border, colors.border] as const) : colors.gradiente}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.botao}>
            {conteudo}
          </LinearGradient>
        ) : (
          <View style={[styles.botao, { backgroundColor: disabled ? colors.border : cor }]}>
            {conteudo}
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

// ── Card tocável com press-scale ──
export function CartaoTocavel({
  children, onPress, style,
}: { children: React.ReactNode; onPress: () => void; style?: ViewStyle }) {
  const scale = useRef(new Animated.Value(1)).current;
  const anima = (to: number) =>
    Animated.spring(scale, { toValue: to, useNativeDriver: true, friction: 6, tension: 120 }).start();
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity activeOpacity={0.9} onPress={onPress}
        onPressIn={() => anima(0.975)} onPressOut={() => anima(1)}>
        <Card style={style}>{children}</Card>
      </TouchableOpacity>
    </Animated.View>
  );
}

export function Pill({ texto, cor }: { texto: string; cor: string }) {
  return (
    <View style={[styles.pill, { borderColor: cor }]}>
      <Text style={[styles.pillTxt, { color: cor }]}>{texto}</Text>
    </View>
  );
}

// ── Entrada suave (fade + subida). `delay` p/ efeito escalonado em listas ──
export function Aparece({
  children, delay = 0, style,
}: { children: React.ReactNode; delay?: number; style?: ViewStyle }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: 320, delay, useNativeDriver: true }).start();
  }, [a, delay]);
  return (
    <Animated.View style={[{
      opacity: a,
      transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
    }, style]}>
      {children}
    </Animated.View>
  );
}

// ── Pulso suave (loop) — pro status "rodando" ──
export function Pulsar({ children, ativo = true }: { children: React.ReactNode; ativo?: boolean }) {
  const a = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!ativo) { a.setValue(1); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 0.45, duration: 750, useNativeDriver: true }),
      Animated.timing(a, { toValue: 1, duration: 750, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [a, ativo]);
  return <Animated.View style={{ opacity: a }}>{children}</Animated.View>;
}

// ── Barra de progresso com gradiente da marca ──
export function BarraProgresso({
  done, total, label,
}: { done: number; total: number; label?: string }) {
  const pct = total > 0 ? Math.min(1, Math.max(0, done / total)) : 0;
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: pct, duration: 350, useNativeDriver: false }).start();
  }, [pct, anim]);
  const largura = anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.barraTopo}>
        <Text style={styles.barraLabel} numberOfLines={1}>{label || 'Progresso'}</Text>
        <Text style={styles.barraNums}>{done}/{total}</Text>
      </View>
      <View style={styles.barraTrilho}>
        <Animated.View style={[styles.barraFill, { width: largura }]}>
          <LinearGradient colors={colors.gradiente} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill} />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  botao: { paddingVertical: 13, paddingHorizontal: 18, borderRadius: 12, alignItems: 'center' },
  barraTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  barraLabel: { color: colors.textoFraco, fontSize: 12, flex: 1 },
  barraNums: { color: colors.texto, fontSize: 12, fontWeight: '700' },
  barraTrilho: { height: 8, backgroundColor: colors.card2, borderRadius: 999, overflow: 'hidden' },
  barraFill: { height: 8, borderRadius: 999, overflow: 'hidden' },
  botaoTxt: { fontWeight: '700', fontSize: 15 },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  pillTxt: { fontSize: 12, fontWeight: '700' },
});
