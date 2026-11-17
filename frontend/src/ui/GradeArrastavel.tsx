import React, { useLayoutEffect, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, PanResponder, View } from 'react-native';

// GRADE que reordena SEGURANDO e ARRASTANDO (13/11/2026, hub dos bots em 2 colunas). Mesma receita da
// ListaArrastavel (que é a que funcionou no aparelho — ver o histórico lá): PanResponder + Animated do
// próprio RN, TUDO no driver JS (misturar native driver com setValue no mesmo valor desincroniza).
// Segura ~0,3 s → o card levanta (borda, sombra e cresce de leve) e segue o dedo em X e Y; os outros
// deslizam pros lugares novos; soltou → a ordem nova é commitada na hora e só o card solto desliza do
// ponto do dedo até o lugar dele. Itens com ALTURA FIXA (`altura`) e posição absoluta na grade.
//
// O `render` recebe `segurar` (→ onLongPress do card), `dedoSaiu` (→ onPressOut) e `erguido`.
// `onArrastando(true|false)` avisa o pai pra travar/destravar a rolagem.

type Ajuda = { segurar: () => void; dedoSaiu: () => void; erguido: boolean; topo: number };

type Props<T> = {
  itens: T[];
  chave: (item: T) => string;
  render: (item: T, index: number, ajuda: Ajuda) => React.ReactNode;
  onReordenar: (novos: T[]) => void;
  onArrastando?: (v: boolean) => void;
  altura: number;
  colunas?: number;
  gap?: number;
};

export function GradeArrastavel<T>({
  itens, chave, render, onReordenar, onArrastando, altura, colunas = 2, gap = 12,
}: Props<T>) {
  const n = itens.length;
  const linhas = Math.ceil(n / colunas);
  const [larg, setLarg] = useState(0);
  const largRef = useRef(0);
  largRef.current = larg;
  const w = larg ? (larg - gap * (colunas - 1)) / colunas : 0;

  const slot = (i: number) => {
    const ww = largRef.current ? (largRef.current - gap * (colunas - 1)) / colunas : 0;
    return { x: (i % colunas) * (ww + gap), y: Math.floor(i / colunas) * (altura + gap) };
  };

  const desloc = useRef<Animated.ValueXY[]>([]);
  while (desloc.current.length < n) desloc.current.push(new Animated.ValueXY({ x: 0, y: 0 }));
  const escala = useRef(new Animated.Value(1)).current;
  const [ativo, setAtivo] = useState(-1);
  const ativoRef = useRef(-1);
  const paraRef = useRef(-1);
  const pegou = useRef(false);
  const ultimo = useRef({ x: 0, y: 0 });
  const pendente = useRef<{ idx: number; off: { x: number; y: number } } | null>(null);
  const itensRef = useRef(itens);
  itensRef.current = itens;

  // ordem nova pintou → zera tudo; o card solto sai do ponto do dedo e encaixa no lugar dele
  const idsKey = itens.map(chave).join('|');
  useLayoutEffect(() => {
    desloc.current.forEach((v) => { v.stopAnimation(); v.setValue({ x: 0, y: 0 }); });
    escala.stopAnimation(); escala.setValue(1);
    const p = pendente.current;
    pendente.current = null;
    if (p && desloc.current[p.idx]) {
      desloc.current[p.idx].setValue(p.off);
      Animated.spring(desloc.current[p.idx], { toValue: { x: 0, y: 0 }, useNativeDriver: false, friction: 8, tension: 130 }).start();
    }
  }, [idsKey]);   // eslint-disable-line react-hooks/exhaustive-deps

  // 13/11: o card erguido NÃO gira nem cresce (girar/escalar a camada pixelava texto e ícone só nele, e a
  // sombra numa camada SEM fundo faz o iOS renderizar fora da tela a cada quadro). Quem desenha o
  // destaque (borda + sombra no card, que tem fundo) é o `render`, pelo `erguido`.
  function novoIndice(i: number, de: number, para: number) {
    if (i === de) return para;
    if (de < para && i > de && i <= para) return i - 1;
    if (de > para && i >= para && i < de) return i + 1;
    return i;
  }

  function vizinhos(de: number, para: number) {
    for (let i = 0; i < n; i++) {
      if (i === de) continue;
      const a = slot(i), b = slot(novoIndice(i, de, para));
      Animated.spring(desloc.current[i], {
        toValue: { x: b.x - a.x, y: b.y - a.y }, useNativeDriver: false, friction: 9, tension: 160,
      }).start();
    }
  }

  function alvoDe(de: number, dx: number, dy: number) {
    const s = slot(de);
    const ww = largRef.current ? (largRef.current - gap * (colunas - 1)) / colunas : 1;
    const cx = s.x + ww / 2 + dx, cy = s.y + altura / 2 + dy;
    const col = Math.max(0, Math.min(colunas - 1, Math.floor(cx / (ww + gap))));
    const lin = Math.max(0, Math.min(linhas - 1, Math.floor(cy / (altura + gap))));
    return Math.min(n - 1, lin * colunas + col);
  }

  function soltar() {
    const de = ativoRef.current;
    if (de < 0) return;
    const para = paraRef.current < 0 ? de : paraRef.current;
    ativoRef.current = -1; paraRef.current = -1;
    setAtivo(-1);
    onArrastando?.(false);
    if (para !== de) {
      const a = slot(de), b = slot(para);
      pendente.current = { idx: para, off: { x: ultimo.current.x - (b.x - a.x), y: ultimo.current.y - (b.y - a.y) } };
      const arr = [...itensRef.current];
      const [x] = arr.splice(de, 1);
      arr.splice(para, 0, x);
      onReordenar(arr);
    } else {
      desloc.current.forEach((v) => {
        v.stopAnimation();
        Animated.spring(v, { toValue: { x: 0, y: 0 }, useNativeDriver: false, friction: 8, tension: 130 }).start();
      });
      Animated.spring(escala, { toValue: 1, useNativeDriver: false, friction: 6, tension: 140 }).start();
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
      desloc.current[de].setValue({ x: g.dx, y: g.dy });
      ultimo.current = { x: g.dx, y: g.dy };
      const para = alvoDe(de, g.dx, g.dy);
      if (para !== paraRef.current) { paraRef.current = para; vizinhos(de, para); }
    },
    onPanResponderRelease: () => soltar(),
    onPanResponderTerminate: () => soltar(),
  })).current;

  function dedoSaiu() {
    setTimeout(() => { if (ativoRef.current >= 0 && !pegou.current) soltar(); }, 60);
  }

  function segurar(i: number) {
    pegou.current = false;
    ultimo.current = { x: 0, y: 0 };
    ativoRef.current = i; paraRef.current = i;
    setAtivo(i);
    onArrastando?.(true);
    escala.setValue(1);
  }

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setLarg(e.nativeEvent.layout.width)}
      style={{ height: linhas ? linhas * altura + (linhas - 1) * gap : 0 }}
      {...pan.panHandlers}>
      {w > 0 && itens.map((it, i) => {
        const eu = ativo === i;
        const s = slot(i);
        return (
          <Animated.View key={chave(it)}
            style={{
              position: 'absolute', left: s.x, top: s.y, width: w, height: altura,
              zIndex: eu ? 10 : 1,
              transform: [
                { translateX: desloc.current[i].x }, { translateY: desloc.current[i].y },
              ],
            }}>
            {render(it, i, { segurar: () => segurar(i), dedoSaiu, erguido: eu, topo: s.y })}
          </Animated.View>
        );
      })}
    </View>
  );
}
