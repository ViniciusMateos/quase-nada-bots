import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleProp, View, ViewStyle } from 'react-native';
import { colors } from '@/theme';

/**
 * Loader oficial do Quase Nada: o cachorro da marca + anel girando em volta.
 * Usado em TODOS os loadings do app (botões, telas, etc). Tinge na cor passada.
 */
export function LoadingDog({
  size = 56, color = colors.rosa, style,
}: { size?: number; color?: string; style?: StyleProp<ViewStyle> }) {
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let mounted = true;
    let anim: Animated.CompositeAnimation | undefined;
    const spin = () => {
      rotation.setValue(0);
      anim = Animated.timing(rotation, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true });
      anim.start(({ finished }) => { if (finished && mounted) spin(); });
    };
    spin();
    return () => { mounted = false; anim?.stop(); };
  }, [rotation]);

  const rotate = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const ring = Math.round(size * 0.82);
  const imageSize = Math.round(size * 0.82);
  const stroke = Math.max(1, size * 0.032);

  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Animated.View
        style={{
          position: 'absolute', width: ring, height: ring, borderRadius: ring / 2,
          borderWidth: stroke, borderColor: 'transparent', borderTopColor: color, borderRightColor: color,
          transform: [{ translateX: size * -0.013 }, { translateY: size * -0.039 }, { rotate }],
        }}
      />
      <Image
        source={require('../assets/apenas-cachorro.png')}
        style={{ width: imageSize, height: imageSize, resizeMode: 'contain', tintColor: color }}
      />
    </View>
  );
}

// Loader de tela cheia (carregamento inicial de telas)
export function TelaCarregando() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
      <LoadingDog size={64} />
    </View>
  );
}
