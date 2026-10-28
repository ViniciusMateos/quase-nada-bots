/**
 * Roleta de data estilo iPhone (dia / mês / ano), em JS puro (ScrollView com snap) — nada de
 * módulo nativo, então vai por OTA. O item central (sob a faixa) é o selecionado.
 */
import React, { useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import { colors } from '@/theme';

const ALT = 42;                 // altura de cada item
const VIS = 5;                  // itens visíveis (2 acima + centro + 2 abaixo)
const PAD = ALT * Math.floor(VIS / 2);
const ALTURA = ALT * VIS;

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function diasNoMes(mes: number, ano: number) {
  return new Date(ano, mes, 0).getDate();   // mes 1-12 → dias do mês
}

function Coluna({ valores, valor, onValor, fmt, flex }: {
  valores: number[]; valor: number; onValor: (v: number) => void;
  fmt?: (v: number) => string; flex: number;
}) {
  const ref = useRef<ScrollView>(null);
  const idx = Math.max(0, valores.indexOf(valor));
  // a roda ainda está girando (timer do "parou" pendente) — aí não reposiciona por fora
  const parado = useRef<ReturnType<typeof setTimeout> | null>(null);
  const atual = useRef({ valores, valor, onValor });
  atual.current = { valores, valor, onValor };

  // posiciona no valor atual quando ele muda por fora (ex.: dia clampado ao trocar de mês)
  useEffect(() => {
    if (parado.current) return;
    const id = setTimeout(() => ref.current?.scrollTo({ y: idx * ALT, animated: false }), 0);
    return () => clearTimeout(id);
  }, [idx]);

  useEffect(() => () => { if (parado.current) clearTimeout(parado.current); }, []);

  // dedo ainda na roda (segurou parado no meio do giro) → espera soltar (na web não tem esse evento)
  const arrastando = useRef(false);
  // decide o valor só quando a roda PARA de vez (fim do giro + snap). Antes decidia também no soltar
  // do dedo: o scrollTo dali cortava a inércia no meio e a roda travava/pulava ("quebrando", 27/10).
  // Pelo onScroll vale igual no iPhone e na web (na web não existe evento de momentum).
  const aoRolar = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    if (parado.current) clearTimeout(parado.current);
    parado.current = setTimeout(() => {
      parado.current = null;
      if (arrastando.current) return;      // o onScrollEndDrag reagenda
      const { valores: vs, valor: v, onValor: on } = atual.current;
      const c = Math.max(0, Math.min(vs.length - 1, Math.round(y / ALT)));
      if (Math.abs(y - c * ALT) > 1) ref.current?.scrollTo({ y: c * ALT, animated: true });
      if (vs[c] !== v) on(vs[c]);
    }, 160);
  };

  return (
    <ScrollView
      ref={ref}
      style={{ flex }}
      showsVerticalScrollIndicator={false}
      snapToInterval={ALT}
      decelerationRate="fast"
      nestedScrollEnabled
      contentContainerStyle={{ paddingVertical: PAD }}
      onScroll={aoRolar}
      scrollEventThrottle={16}
      onScrollBeginDrag={() => { arrastando.current = true; }}
      onScrollEndDrag={(e) => { arrastando.current = false; aoRolar(e); }}
    >
      {valores.map((v, i) => (
        <View key={v} style={styles.item}>
          <Text style={[styles.itemTxt, i === idx && styles.itemSel]} numberOfLines={1}>
            {fmt ? fmt(v) : String(v)}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

export function RoletaData({ ano, mes, dia, onChange, anoMin, anoMax }: {
  ano: number; mes: number; dia: number;
  onChange: (d: { ano: number; mes: number; dia: number }) => void;
  anoMin?: number; anoMax?: number;
}) {
  const hoje = new Date().getFullYear();
  const aMax = anoMax ?? hoje - 18;            // mínimo de idade pra conta
  const aMin = anoMin ?? hoje - 60;
  const anos = Array.from({ length: aMax - aMin + 1 }, (_, i) => aMax - i);   // decrescente
  const meses = Array.from({ length: 12 }, (_, i) => i + 1);
  const maxDia = diasNoMes(mes, ano);
  const dias = Array.from({ length: maxDia }, (_, i) => i + 1);
  const diaOk = Math.min(dia, maxDia);

  const set = (p: Partial<{ ano: number; mes: number; dia: number }>) => {
    const novo = { ano, mes, dia: diaOk, ...p };
    novo.dia = Math.min(novo.dia, diasNoMes(novo.mes, novo.ano));   // reclampa o dia
    onChange(novo);
  };

  return (
    <View style={styles.wrap}>
      <View pointerEvents="none" style={styles.faixa} />
      <Coluna flex={1} valores={dias} valor={diaOk} onValor={(v) => set({ dia: v })} />
      <Coluna flex={1.3} valores={meses} valor={mes} fmt={(v) => MESES[v - 1]} onValor={(v) => set({ mes: v })} />
      <Coluna flex={1.2} valores={anos} valor={ano} onValor={(v) => set({ ano: v })} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: ALTURA, flexDirection: 'row', backgroundColor: colors.card2,
    borderRadius: 12, overflow: 'hidden', paddingHorizontal: 8,
  },
  faixa: {
    position: 'absolute', left: 8, right: 8, top: PAD, height: ALT,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border,
    backgroundColor: colors.card, borderRadius: 8,
  },
  item: { height: ALT, alignItems: 'center', justifyContent: 'center' },
  itemTxt: { color: colors.textoFraco, fontSize: 18, fontWeight: '600' },
  itemSel: { color: colors.texto, fontSize: 20, fontWeight: '800' },
});
