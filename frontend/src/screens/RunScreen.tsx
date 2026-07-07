import React, { useEffect, useRef, useState } from 'react';
import {
  Animated, NativeScrollEvent, NativeSyntheticEvent,
  ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, logsWsUrl } from '@/lib/api';
import { colors, statusCor } from '@/theme';
import { BarraProgresso, Botao, Pill, Pulsar } from '@/ui/components';
import { LoadingDog } from '@/ui/LoadingDog';
import type { Progresso } from '@/lib/api';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Rt = RouteProp<RootStackParamList, 'Run'>;

// Log inteligente: detecta arte de terminal e renderiza como UI adaptável ao celular.
type Parsed =
  | { tipo: 'divisor' }
  | { tipo: 'titulo'; texto: string }
  | { tipo: 'kv'; label: string; valor: string }
  | { tipo: 'texto'; hora: string; texto: string; cor: string; forte: boolean };

function corEvento(nivel: string, low: string): { cor: string; forte: boolean } {
  let cor = '#D8D8D8';
  let forte = false;
  if (nivel === 'ERROR' || low.includes('bloque') || low.includes('⛔') || low.includes('checkpoint')) {
    cor = colors.erro; forte = true;
  } else if (low.includes('seguiu @') || low.includes('+ seguiu')) {
    cor = colors.ok;
  } else if (low.includes('pedido')) {
    cor = colors.laranja;
  } else if (low.includes('pulou') || low.includes('pulad') || low.includes('já seguid') || low.includes('já seguia')) {
    cor = colors.textoFraco;
  } else if (nivel === 'WARNING' || nivel === 'WARN' || low.includes('transitório')) {
    cor = colors.alerta;
  }
  return { cor, forte };
}

function parseLinha(raw: string): Parsed {
  if (raw.startsWith('[backend]')) {
    return { tipo: 'texto', hora: '', texto: raw.replace(/^\[backend\]\s*/, '• '), cor: colors.textoFraco, forte: false };
  }
  const m = raw.match(/^\d{4}-\d{2}-\d{2}\s+(\d{2}:\d{2}:\d{2})\s+(\w+)\s+([\s\S]*)$/);
  const hora = m ? m[1] : '';
  const nivel = m ? m[2] : '';
  const resto = (m ? m[3] : raw).trimEnd();

  // separadores (─────) e cabeçalhos com traços (─── TÍTULO ───), sem pegar a árvore ┌─│└
  if (/[─—]{3,}/.test(resto) || /-{5,}/.test(resto)) {
    const limpo = resto.replace(/[─—]+/g, ' ').replace(/-{3,}/g, ' ').replace(/\s{2,}/g, ' ').trim();
    return limpo ? { tipo: 'titulo', texto: limpo } : { tipo: 'divisor' };
  }
  const wrap = resto.match(/^[─—]\s*(.+?)\s*[─—]$/);   // — Título —
  if (wrap) return { tipo: 'titulo', texto: wrap[1].trim() };

  // "label ..... valor" → linha com valor à direita
  const kv = resto.match(/^(.+?)\s*[.·]{2,}\s*(.+)$/);
  if (kv) return { tipo: 'kv', label: kv[1].trim(), valor: kv[2].trim() };

  const { cor, forte } = corEvento(nivel, resto.toLowerCase());
  return { tipo: 'texto', hora, texto: resto, cor, forte };
}

function LogLinha({ raw }: { raw: string }) {
  const p = parseLinha(raw);
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [anim]);
  const wrapStyle = {
    opacity: anim,
    transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }],
  };

  if (p.tipo === 'divisor') {
    return <Animated.View style={[wrapStyle, styles.divisorWrap]}><View style={styles.divisor} /></Animated.View>;
  }
  if (p.tipo === 'titulo') {
    return <Animated.View style={wrapStyle}><Text style={styles.titulo}>{p.texto}</Text></Animated.View>;
  }
  if (p.tipo === 'kv') {
    return (
      <Animated.View style={[wrapStyle, styles.kvRow]}>
        <Text style={styles.kvLabel}>{p.label}</Text>
        <Text style={styles.kvValor}>{p.valor}</Text>
      </Animated.View>
    );
  }
  return (
    <Animated.View style={wrapStyle}>
      <Text style={[styles.linha, { color: p.cor }, p.forte && styles.forte]}>
        {p.hora ? <Text style={styles.hora}>{p.hora}  </Text> : null}
        {p.texto}
      </Text>
    </Animated.View>
  );
}

function parseProgresso(txt: string): Progresso | null {
  const resto = txt.slice('[progress]'.length).trim();
  const m = resto.match(/^(\d+)\s+(\d+)\s*(.*)$/);
  if (!m) return null;
  return { done: parseInt(m[1], 10), total: parseInt(m[2], 10), label: m[3].trim() };
}

export function RunScreen() {
  const { runId } = useRoute<Rt>().params;
  const [linhas, setLinhas] = useState<string[]>([]);
  const [status, setStatus] = useState('rodando');
  const [conectando, setConectando] = useState(true);
  const [parando, setParando] = useState(false);
  const [progresso, setProgresso] = useState<Progresso | null>(null);
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const atBottomRef = useRef(true);
  const [mostrarVoltar, setMostrarVoltar] = useState(false);
  const botaoAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(botaoAnim, { toValue: mostrarVoltar ? 1 : 0, useNativeDriver: true, friction: 7, tension: 60 }).start();
  }, [mostrarVoltar, botaoAnim]);

  function aoScrollar(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    const perto = contentSize.height - (contentOffset.y + layoutMeasurement.height) < 60;
    atBottomRef.current = perto;
    setMostrarVoltar((atual) => (atual === !perto ? atual : !perto));
  }
  function irAoFinal() {
    scrollRef.current?.scrollToEnd({ animated: true });
    atBottomRef.current = true;
    setMostrarVoltar(false);
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await api.getRun(runId);
        if (alive) setStatus(d.status);
      } catch {}
      const url = await logsWsUrl(runId);
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onmessage = (e) => {
        if (!alive) return;
        setConectando(false);
        const txt = String(e.data);
        if (txt.startsWith('[progress]')) {          // barra, não vira linha de log
          const p = parseProgresso(txt);
          if (p) setProgresso(p);
          return;
        }
        setLinhas((prev) => [...prev, txt]);
      };
      ws.onerror = () => { if (alive) setConectando(false); };
      ws.onclose = async () => {
        if (alive) setConectando(false);
        try { const d = await api.getRun(runId); if (alive) setStatus(d.status); } catch {}
      };
    })();
    return () => { alive = false; wsRef.current?.close(); };
  }, [runId]);

  async function parar() {
    setParando(true);
    try { await api.stopRun(runId); setStatus('parado'); } catch {} finally { setParando(false); }
  }

  const rodando = ['rodando', 'iniciando'].includes(status);

  return (
    <View style={styles.tela}>
      <View style={styles.topo}>
        <Pulsar ativo={rodando}>
          <Pill texto={status} cor={statusCor[status] ?? colors.textoFraco} />
        </Pulsar>
        {rodando && <Botao title="✕ Parar" cor={colors.erro} txtCor="#fff" onPress={parar} loading={parando} />}
      </View>
      {progresso && progresso.total > 0 && (
        <View style={styles.barraWrap}>
          <BarraProgresso done={progresso.done} total={progresso.total} label={progresso.label} />
        </View>
      )}
      {conectando && linhas.length === 0 ? (
        <View style={[styles.logBox, styles.loadingBox, { marginBottom: insets.bottom + 12 }]}>
          <LoadingDog size={56} />
          <Text style={styles.loadingTxt}>Carregando logs…</Text>
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          style={[styles.logBox, { marginBottom: insets.bottom + 12 }]}
          contentContainerStyle={{ padding: 12 }}
          onScroll={aoScrollar}
          scrollEventThrottle={32}
          onContentSizeChange={() => { if (atBottomRef.current) scrollRef.current?.scrollToEnd({ animated: true }); }}>
          {linhas.map((l, i) => (
            <LogLinha key={i} raw={l} />
          ))}
        </ScrollView>
      )}
      <Animated.View
        pointerEvents={mostrarVoltar ? 'auto' : 'none'}
        style={[styles.voltarWrap, {
          bottom: insets.bottom + 22,
          opacity: botaoAnim,
          transform: [
            { translateY: botaoAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) },
            { scale: botaoAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) },
          ],
        }]}>
        <TouchableOpacity style={styles.voltarBtn} onPress={irAoFinal} activeOpacity={0.85}>
          <Text style={styles.voltarTxt}>↓ Ir ao final</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.bg },
  topo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  barraWrap: { paddingHorizontal: 16, paddingBottom: 12 },
  logBox: { flex: 1, backgroundColor: '#0A0A0A', marginHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  loadingBox: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingTxt: { color: colors.textoFraco, fontSize: 13 },
  linha: { fontFamily: 'monospace', fontSize: 12, lineHeight: 18 },
  hora: { color: '#5A5A5A', fontSize: 11 },
  forte: { fontWeight: '700' },
  divisorWrap: { paddingVertical: 7 },
  divisor: { height: 1, backgroundColor: colors.border },
  titulo: { color: colors.laranja, fontSize: 13, fontWeight: '700', marginTop: 8, marginBottom: 2, letterSpacing: 0.3 },
  kvRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, paddingVertical: 2 },
  kvLabel: { color: colors.textoFraco, fontSize: 13, flexShrink: 1 },
  kvValor: { color: colors.texto, fontSize: 13, fontWeight: '600' },
  voltarWrap: { position: 'absolute', right: 22 },
  voltarBtn: {
    backgroundColor: colors.laranja, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 6,
  },
  voltarTxt: { color: '#0F0F0F', fontWeight: '700', fontSize: 13 },
});

