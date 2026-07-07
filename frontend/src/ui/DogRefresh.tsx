import React, { useCallback, useRef, useState } from 'react';
import { Animated, NativeScrollEvent, NativeSyntheticEvent, StyleSheet } from 'react-native';
import { LoadingDog } from '@/ui/LoadingDog';

// Pull-to-refresh com o LoadingDog no lugar do spinner nativo da Apple.
// Uso: const { refreshing, scrollProps, dog, spacerEl } = useDogRefresh(carregar);
//   - {dog} vai como irmão do FlatList, dentro de uma View com position relative;
//   - {spacerEl} vai no topo do ListHeaderComponent (abre espaço enquanto atualiza);
//   - {...scrollProps} vai no FlatList/ScrollView.
const THRESH = 70;

export function useDogRefresh(onRefresh: () => Promise<unknown>) {
  const pull = useRef(new Animated.Value(0)).current;
  const spacer = useRef(new Animated.Value(0)).current;
  const puxa = useRef(0);
  const ativoRef = useRef(false);
  const [refreshing, setRefreshing] = useState(false);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (ativoRef.current) return;
    const y = e.nativeEvent.contentOffset.y;
    const d = y < 0 ? -y : 0;
    puxa.current = d;
    pull.setValue(d);
  }, [pull]);

  const onScrollEndDrag = useCallback(() => {
    if (ativoRef.current) return;
    if (puxa.current >= THRESH) {
      ativoRef.current = true;
      setRefreshing(true);
      Animated.spring(pull, { toValue: THRESH, useNativeDriver: false, friction: 8 }).start();
      Animated.spring(spacer, { toValue: THRESH, useNativeDriver: false, friction: 8 }).start();
      Promise.resolve(onRefresh()).finally(() => {
        ativoRef.current = false;
        setRefreshing(false);
        Animated.timing(pull, { toValue: 0, duration: 250, useNativeDriver: false }).start();
        Animated.timing(spacer, { toValue: 0, duration: 250, useNativeDriver: false }).start();
      });
    } else {
      Animated.timing(pull, { toValue: 0, duration: 150, useNativeDriver: false }).start();
    }
  }, [onRefresh, pull, spacer]);

  const dog = (
    <Animated.View pointerEvents="none" style={[styles.dogWrap, {
      opacity: pull.interpolate({ inputRange: [0, THRESH * 0.4, THRESH], outputRange: [0, 0.35, 1], extrapolate: 'clamp' }),
      transform: [{ scale: pull.interpolate({ inputRange: [0, THRESH], outputRange: [0.6, 1], extrapolate: 'clamp' }) }],
    }]}>
      <LoadingDog size={40} />
    </Animated.View>
  );

  const spacerEl = <Animated.View style={{ height: spacer }} />;

  return {
    refreshing,
    scrollProps: { onScroll, onScrollEndDrag, scrollEventThrottle: 16, alwaysBounceVertical: true as const },
    dog,
    spacerEl,
  };
}

const styles = StyleSheet.create({
  dogWrap: { position: 'absolute', top: 10, left: 0, right: 0, alignItems: 'center', zIndex: 5 },
});
