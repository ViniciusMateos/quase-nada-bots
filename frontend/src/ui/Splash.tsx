import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, useWindowDimensions, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { SPLASH_URI } from '../assets/imagensBase64';

/**
 * Splash com transição.
 *
 * O splash NATIVO é uma imagem parada — não gira. Então a gente esconde ele assim que este
 * overlay desenha a MESMA imagem por cima, liga o anel girando e faz o fade pro app.
 *
 * ⚠️ A imagem vem como DATA URI (base64, em ../assets/imagensBase64). No build standalone o
 * <Image> com require(png) NÃO renderiza (a pipeline de asset falha — o ícone nativo funciona,
 * então não é o PNG, é o require). Base64 é parte do bundle JS: carrega junto com o código,
 * sem depender da pipeline. Por isso o cachorro volta a aparecer no overlay.
 */

// ── geometria, medida do próprio splash.png ────────────────────────────────
const IMG = { w: 1242, h: 2688 };
const INK = { x: 0.5113, y: 0.4859 };   // centro da tinta do cachorro, fração da imagem
const DOG_S = 0.5032;

const ANEL_F = 0.9;    // meio-termo: 0.82 o dog estourava pra fora, 1.02 o anel ficou longe demais
const STROKE_F = 0.032;
const ANEL_DX = -0.0376;
const ANEL_DY = -0.0644;

const SEGURA_MS = 700;
const FADE_MS = 420;
const ANEL_MS = 220;

SplashScreen.preventAutoHideAsync().catch(() => {});

export function SplashGate({ children }: { children: React.ReactNode }) {
  const { width: SW, height: SH } = useWindowDimensions();
  const [montado, setMontado] = useState(true);
  const fade = useRef(new Animated.Value(1)).current;
  const anelFade = useRef(new Animated.Value(0)).current;
  const giro = useRef(new Animated.Value(0)).current;

  const escala = Math.max(SW / IMG.w, SH / IMG.h);
  const rw = IMG.w * escala;
  const rh = IMG.h * escala;
  const inkX = (SW - rw) / 2 + INK.x * rw;
  const inkY = (SH - rh) / 2 + INK.y * rh;
  const S = DOG_S * rw;
  const anel = ANEL_F * S;

  // esconde o nativo só quando a imagem do overlay PINTAR (onLoad). Fallback em 4s.
  const nativoEscondido = useRef(false);
  const esconderNativo = useCallback(() => {
    if (nativoEscondido.current) return;
    nativoEscondido.current = true;
    SplashScreen.hideAsync().catch(() => {});
  }, []);
  useEffect(() => {
    const t = setTimeout(esconderNativo, 4000);
    return () => clearTimeout(t);
  }, [esconderNativo]);

  useEffect(() => {
    if (!montado) return;
    const spin = Animated.loop(
      Animated.timing(giro, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }),
    );
    spin.start();
    Animated.timing(anelFade, { toValue: 1, duration: ANEL_MS, useNativeDriver: true }).start();

    const t = setTimeout(() => {
      Animated.timing(fade, {
        toValue: 0, duration: FADE_MS, easing: Easing.out(Easing.quad), useNativeDriver: true,
      }).start(({ finished }) => { if (finished) setMontado(false); });
    }, SEGURA_MS);

    return () => { clearTimeout(t); spin.stop(); };
  }, [montado, fade, anelFade, giro]);

  useEffect(() => {
    const t = setTimeout(() => setMontado(false), SEGURA_MS + FADE_MS + 800);
    return () => clearTimeout(t);
  }, []);

  const rotate = giro.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={{ flex: 1 }}>
      {children}
      {montado && (
        <Animated.View
          style={[StyleSheet.absoluteFill, { opacity: fade, backgroundColor: '#8114B0' }]}
          pointerEvents="none"
        >
          <Image
            source={{ uri: SPLASH_URI }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            fadeDuration={0}
            onLoad={esconderNativo}
            onError={esconderNativo}
          />
          <Animated.View
            style={{
              position: 'absolute',
              left: inkX + ANEL_DX * S - anel / 2,
              top: inkY + ANEL_DY * S - anel / 2,
              width: anel,
              height: anel,
              borderRadius: anel / 2,
              borderWidth: Math.max(1, STROKE_F * S),
              borderColor: 'transparent',
              borderTopColor: '#FFFFFF',
              borderRightColor: '#FFFFFF',
              opacity: anelFade,
              transform: [{ rotate }],
            }}
          />
        </Animated.View>
      )}
    </View>
  );
}
