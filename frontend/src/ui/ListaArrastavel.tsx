import React, { useLayoutEffect, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, PanResponder, View } from 'react-native';

// Lista que reordena SEGURANDO e ARRASTANDO (sem setas): segura ~0,3s → o card levanta
// (cresce + sombra) e segue o dedo; os vizinhos deslizam pra abrir espaço; soltou → encaixa e
// avisa a ordem nova (onReordenar). Toque normal continua abrindo o card.
//
// Histórico: a versão com Reanimated/gesture-handler (worklets) no aparelho NÃO acompanhava o
// dedo (o card só "aparecia" no lugar ao soltar). Esta usa o PanResponder + Animated do próprio
// RN: o card segue o dedo direto, sem depender de worklet. Itens no FLUXO NORMAL — o arraste só
// desloca (translateY); a lista nunca empilha.
// TODAS as animações no driver JS (useNativeDriver: false). Misturar native driver com
// setValue no MESMO valor desincronizava JS×nativo: a cada re-render (rolagem, poll das runs)
// o card alternava de posição e ficava um em cima do outro (OTA 46).
//
// Uso: o `render` recebe `segurar` (→ onLongPress do card) e `dedoSaiu` (→ onPressOut do card).
// `onArrastando(true|false)`
// avisa o pai pra travar/destravar a rolagem enquanto arrasta.

type Props<T> = {
  itens: T[];
  chave: (item: T) => string;
  render: (item: T, index: number, segurar: () => void, dedoSaiu: () => void) => React.ReactNode;
  onReordenar: (novos: T[]) => void;
  onArrastando?: (v: boolean) => void;
  gap?: number;
};

export function ListaArrastavel<T>({ itens, chave, render, onReordenar, onArrastando, gap = 12 }: Props<T>) {
  const n = itens.length;
  const ys = useRef<number[]>([]);
  const hs = useRef<number[]>([]);
  // um deslocamento por POSIÇÃO (índice) — o arrastado segue o dedo; os vizinhos abrem espaço
  const desloc = useRef<Animated.Value[]>([]);
  while (desloc.current.length < n) desloc.current.push(new Animated.Value(0));
  const escala = useRef(new Animated.Value(1)).current;
  const [ativo, setAtivo] = useState(-1);
  const ativoRef = useRef(-1);
  const paraRef = useRef(-1);
  const pegou = useRef(false);   // o PanResponder chegou a pegar o toque (teve arraste)?
  const itensRef = useRef(itens);
  itensRef.current = itens;

  // ordem nova pintou → zera tudo (sem animar), cada item volta pro lugar natural dele
  const idsKey = itens.map(chave).join('|');
  useLayoutEffect(() => {
    desloc.current.forEach((v) => { v.stopAnimation(); v.setValue(0); });
    escala.stopAnimation(); escala.setValue(1);
    const p = pendente.current;
    pendente.current = null;
    if (p && desloc.current[p.idx]) {   // o card solto: sai do ponto do dedo e encaixa no lugar
      desloc.current[p.idx].setValue(p.off);
      Animated.spring(desloc.current[p.idx], { toValue: 0, useNativeDriver: false, friction: 9, tension: 140 }).start();
    }
  }, [idsKey]);   // eslint-disable-line react-hooks/exhaustive-deps

  function vizinhos(de: number, para: number) {
    const passo = (hs.current[de] ?? 0) + gap;
    for (let i = 0; i < n; i++) {
      if (i === de) continue;
      let alvo = 0;
      if (de < i && para >= i) alvo = -passo;
      else if (de > i && para <= i) alvo = passo;
      Animated.timing(desloc.current[i], { toValue: alvo, duration: 140, useNativeDriver: false }).start();
    }
  }

  function alvoDe(de: number, dy: number) {
    const centro = (ys.current[de] ?? 0) + dy + (hs.current[de] ?? 0) / 2;
    let alvo = 0;
    for (let i = 0; i < n; i++) {
      if (centro > (ys.current[i] ?? 0) + (hs.current[i] ?? 0) / 2) alvo = i;
    }
    return alvo;
  }

  // soltou → a ordem nova é COMMITADA NA HORA (não espera animação nenhuma: se esperasse, um
  // re-render no meio — rolagem, poll das runs — pegava a lista em estado intermediário).
  // Visual: a lista já pinta na ordem nova; só o card solto desliza do ponto do dedo até o
  // lugar dele (pendente → aplicado no useLayoutEffect logo depois da ordem nova pintar).
  const ultimoDy = useRef(0);
  const pendente = useRef<{ idx: number; off: number } | null>(null);

  function soltar() {
    const de = ativoRef.current;
    if (de < 0) return;
    const para = paraRef.current < 0 ? de : paraRef.current;
    let alvoY = 0;
    if (para > de) alvoY = (ys.current[para] ?? 0) + (hs.current[para] ?? 0) - (hs.current[de] ?? 0) - (ys.current[de] ?? 0);
    else if (para < de) alvoY = (ys.current[para] ?? 0) - (ys.current[de] ?? 0);
    ativoRef.current = -1; paraRef.current = -1;
    setAtivo(-1);
    onArrastando?.(false);
    if (para !== de) {
      // no slot novo, o card começa onde o dedo largou e desliza até 0
      pendente.current = { idx: para, off: ultimoDy.current - alvoY };
      const arr = [...itensRef.current];
      const [x] = arr.splice(de, 1);
      arr.splice(para, 0, x);
      onReordenar(arr);
    } else {
      // não mudou de lugar: só volta pro lugar dele
      desloc.current.forEach((v, i) => {
        v.stopAnimation();
        Animated.spring(v, { toValue: 0, useNativeDriver: false, friction: 9, tension: 140 }).start();
        if (i === de) escala.setValue(1);
      });
    }
  }

  // o PanResponder só pega o toque DEPOIS do segurar (ativo >= 0): aí ele rouba o gesto do card
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponderCapture: () => ativoRef.current >= 0,
    onMoveShouldSetPanResponderCapture: () => ativoRef.current >= 0,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => { pegou.current = true; },
    onPanResponderMove: (_e, g) => {
      const de = ativoRef.current;
      if (de < 0) return;
      desloc.current[de].setValue(g.dy);
      ultimoDy.current = g.dy;
      const para = alvoDe(de, g.dy);
      if (para !== paraRef.current) { paraRef.current = para; vizinhos(de, para); }
    },
    onPanResponderRelease: () => soltar(),
    onPanResponderTerminate: () => soltar(),
  })).current;

  // o card avisa que o dedo saiu: se segurou e soltou SEM arrastar, o PanResponder nunca pegou
  // o toque → solta aqui (senão o card ficava levantado). Se pegou, quem solta é o release.
  function dedoSaiu() {
    setTimeout(() => { if (ativoRef.current >= 0 && !pegou.current) soltar(); }, 60);
  }

  function segurar(i: number) {
    pegou.current = false;
    ultimoDy.current = 0;
    ativoRef.current = i; paraRef.current = i;
    setAtivo(i);
    onArrastando?.(true);
    Animated.timing(escala, { toValue: 1.035, duration: 140, useNativeDriver: false }).start();
  }

  function medir(i: number, e: LayoutChangeEvent) {
    ys.current[i] = e.nativeEvent.layout.y;
    hs.current[i] = e.nativeEvent.layout.height;
  }

  return (
    <View style={{ gap }} {...pan.panHandlers}>
      {itens.map((it, i) => {
        const eu = ativo === i;
        return (
          <Animated.View key={chave(it)} onLayout={(e) => medir(i, e)}
            style={{
              zIndex: eu ? 10 : 1,
              shadowColor: '#000', shadowRadius: 14, shadowOffset: { width: 0, height: 8 },
              shadowOpacity: eu ? 0.45 : 0,
              transform: [{ translateY: desloc.current[i] }, { scale: eu ? escala : 1 }],
            }}>
            {render(it, i, () => segurar(i), dedoSaiu)}
          </Animated.View>
        );
      })}
    </View>
  );
}
