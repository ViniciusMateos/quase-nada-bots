import React, { useEffect } from 'react';
import { Animated, DimensionValue, View, ViewStyle } from 'react-native';
import { colors } from '@/theme';
import { Card } from '@/ui/components';

// ── Skeleton (placeholder de carregamento) ──
// Blocos cinza no FORMATO do conteúdo real, com um pulso sutil de opacidade. Servem pra tela
// não parecer vazia enquanto os dados chegam e pra transição suave quando eles chegam (nada
// "brota do nada"). Tudo em RN `Animated` puro — SEM dependência nova.

// Pulso COMPARTILHADO: um único loop global comanda TODOS os esqueletos ao mesmo tempo. Se cada
// bloco animasse sozinho eles piscariam fora de sincronia (feio) e seriam N timers; com um driver
// só fica suave e barato. Conta-referência liga no 1º esqueleto montado e desliga quando o último
// some — assim não fica um loop rodando à toa com a tela sem nenhum skeleton.
const pulso = new Animated.Value(1);
let ativos = 0;
let loop: Animated.CompositeAnimation | null = null;
function ligarPulso() {
  ativos += 1;
  if (loop) return;
  loop = Animated.loop(Animated.sequence([
    Animated.timing(pulso, { toValue: 0.5, duration: 650, useNativeDriver: true }),
    Animated.timing(pulso, { toValue: 1, duration: 650, useNativeDriver: true }),
  ]));
  loop.start();
}
function desligarPulso() {
  ativos = Math.max(0, ativos - 1);
  if (ativos === 0) { loop?.stop(); loop = null; pulso.setValue(1); }
}

// Bloco animado base. `colors.card2` é a cor dos "buracos" do tema (trilho de barra, inputs),
// então o skeleton já combina com os cards por cima deles.
export function Esqueleto({
  width = '100%', height = 14, radius = 8, style,
}: { width?: DimensionValue; height?: DimensionValue; radius?: number; style?: ViewStyle }) {
  useEffect(() => { ligarPulso(); return desligarPulso; }, []);
  return (
    <Animated.View
      style={[{ width, height, borderRadius: radius, backgroundColor: colors.card2, opacity: pulso }, style]}
    />
  );
}

// Linha de texto: um Esqueleto baixinho e com cantos miúdos (parece uma linha de fonte).
export function EsqueletoLinha({
  width = '100%', height = 12, style,
}: { width?: DimensionValue; height?: number; style?: ViewStyle }) {
  return <Esqueleto width={width} height={height} radius={6} style={style} />;
}

// Círculo: avatar, dot de status, ícone redondo. `size` vale pros dois lados.
export function EsqueletoCirculo({ size, style }: { size: number; style?: ViewStyle }) {
  return <Esqueleto width={size} height={size} radius={size / 2} style={style} />;
}

// Card fake no estilo do `Card` existente: uma linha de "título" mais larga + N linhas de corpo
// (a última mais curta, como um parágrafo de verdade termina). Bom pros cartões de lista.
export function EsqueletoCartao({
  linhas = 2, style,
}: { linhas?: number; style?: ViewStyle }) {
  return (
    <Card style={style}>
      <View style={{ gap: 10 }}>
        <Esqueleto width="55%" height={16} radius={7} />
        {Array.from({ length: linhas }).map((_, i) => (
          <EsqueletoLinha key={i} width={i === linhas - 1 ? '70%' : '100%'} />
        ))}
      </View>
    </Card>
  );
}
