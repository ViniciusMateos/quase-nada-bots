import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api, RunInfo } from '@/lib/api';
import { laRunsAcabaram } from '@/lib/la';
import { colors } from '@/theme';
import { LoadingDog } from '@/ui/LoadingDog';
import { interacaoBus } from '@/ui/interacaoBus';

const ativaRun = (r: RunInfo) => r.status === 'rodando' || r.status === 'iniciando';
const BOLHA = 62;     // diâmetro da bolha colapsada
const MARGEM = 10;    // distância das bordas quando cola na lateral
const MAX_LINHAS = 3; // acima disso vira "+N rodando" (senão a pílula come a tela)

// Cor e ícone por bot — MESMA linguagem do widget do Dynamic Island
// (targets/botswidget/BotsWidget.swift: corDoBot/simboloDoBot). Se mudar lá, muda aqui.
function corDoBot(bot: string): string {
  if (bot === 'auto-follow') return colors.rosa;
  if (bot === 'dm-followers') return colors.amarelo;
  return colors.roxo;
}
function iconeDoBot(bot: string): keyof typeof Ionicons.glyphMap {
  if (bot === 'auto-follow') return 'person-add';
  if (bot === 'dm-followers') return 'paper-plane';
  return 'flash';
}

function pctDe(r: RunInfo): number | null {
  const p = r.progress;
  if (!p || !p.total) return null;
  return Math.max(0, Math.min(100, Math.round((p.done / p.total) * 100)));
}

/**
 * Indicador flutuante GLOBAL dos bots. Dois estados, com animação:
 *   • BARRA  — pílula embaixo (estado "aberto"). Aparece assim quando começa um processo;
 *     tocar numa linha abre a tela daquela Run.
 *   • BOLHA  — bolinha com o cachorro girando (estado "de cantinho"). Recolhe sozinha
 *     quando o usuário toca/scrolla a tela; é arrastável, cola na lateral, sobe/desce e
 *     pode ser jogada pro outro lado. Tocar nela expande de volta.
 *
 * Adaptado do Brechó pra N bots: lá é sempre UM processo; aqui pode ter vários rodando
 * junto, então a barra vira LISTA (uma linha por bot) e a bolha ganha um CONTADOR.
 */
export function BarraBotsGlobal({ onAbrir }: { onAbrir?: (runId: string, titulo: string) => void }) {
  const insets = useSafeAreaInsets();
  const win = Dimensions.get('window');
  const [runs, setRuns] = useState<RunInfo[]>([]);
  const [modo, setModo] = useState<'barra' | 'bolha'>('barra');
  const [montado, setMontado] = useState(false);   // renderiza enquanto ativo OU saindo
  const runsRef = useRef<RunInfo[]>([]);           // últimas runs (renderiza durante a saída)
  const modoRef = useRef(modo);
  modoRef.current = modo;                          // modo fresco pra saída (fora do closure do efeito)

  const barAnim = useRef(new Animated.Value(0)).current;     // 0→1 entrada da barra
  const bolhaAnim = useRef(new Animated.Value(0)).current;   // 0→1 entrada da bolha
  const inicial = { x: win.width - BOLHA - MARGEM, y: win.height * 0.55 };
  const pos = useRef(new Animated.ValueXY(inicial)).current; // posição visual da bolha
  const posRef = useRef({ ...inicial });    // posição absoluta corrente (fonte da verdade, em JS)
  const dragStart = useRef({ x: 0, y: 0 }); // posição no momento em que pega pra arrastar
  const grace = useRef(0);      // ignora "recolher" logo após expandir/aparecer
  const movido = useRef(0);     // distância arrastada (pra distinguir toque de arrasto)
  const insetsRef = useRef(insets);
  insetsRef.current = insets;   // insets sempre frescos dentro do PanResponder

  // poll das runs ativas (TODAS, não só a mais recente)
  useEffect(() => {
    let vivo = true;
    const tick = async () => {
      try {
        const todas = await api.listRuns();
        const ativas = todas.filter(ativaRun).sort((a, b) => b.started_at - a.started_at);
        // sem run ativa → o server já encerrou a LA; zera o flag pra o próximo ciclo poder
        // recriar (senão o ativaId ficaria preso e nunca mais nasceria uma LA).
        if (ativas.length === 0) laRunsAcabaram();
        if (vivo) setRuns(ativas);
      } catch { /* offline / sem server */ }
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => { vivo = false; clearInterval(id); };
  }, []);

  const ativo = runs.length > 0;
  if (runs.length) runsRef.current = runs;   // guarda pra renderizar durante a saída
  const dados = runs.length ? runs : runsRef.current;

  // aparece (barra, animado) quando surge um processo; SAI animado quando acaba
  useEffect(() => {
    if (ativo) {
      setMontado(true);
      setModo('barra');
      grace.current = Date.now() + 1000;
      pos.setValue(posRef.current);       // bolha num ponto válido (evita começar off-screen de uma saída anterior)
      bolhaAnim.setValue(0);
      barAnim.setValue(0);
      Animated.spring(barAnim, { toValue: 1, useNativeDriver: false, friction: 8, tension: 70 }).start();
    } else {
      sair();
    }
  }, [ativo]);  // eslint-disable-line react-hooks/exhaustive-deps

  // segurança: sem run ativa, garante o desmonte mesmo se a animação de saída for
  // interrompida (a RunScreen re-renderiza muito com os logs e pode travar o callback
  // do Animated) — evita o widget ficar "preso" mostrando a última % de uma run parada.
  useEffect(() => {
    if (ativo) return;
    const t = setTimeout(() => setMontado(false), 600);
    return () => clearTimeout(t);
  }, [ativo]);  // eslint-disable-line react-hooks/exhaustive-deps

  // recolhe em bolha quando o usuário toca/scrolla a tela
  useEffect(() => {
    return interacaoBus.ouvir(() => {
      if (!ativo || modo !== 'barra' || Date.now() < grace.current) return;
      recolher();
    });
  }, [ativo, modo]);  // eslint-disable-line react-hooks/exhaustive-deps

  function recolher() {
    setModo('bolha');
    Animated.parallel([
      Animated.timing(barAnim, { toValue: 0, duration: 180, useNativeDriver: false }),
      Animated.spring(bolhaAnim, { toValue: 1, useNativeDriver: false, friction: 7, tension: 80 }),
    ]).start();
  }

  function expandir() {
    grace.current = Date.now() + 1000;
    setModo('barra');
    Animated.parallel([
      Animated.timing(bolhaAnim, { toValue: 0, duration: 150, useNativeDriver: false }),
      Animated.spring(barAnim, { toValue: 1, useNativeDriver: false, friction: 8, tension: 70 }),
    ]).start();
  }

  // saída animada quando acaba: a barra DESCE e some; a bolha DESLIZA pra fora da lateral
  // onde estiver. Só desmonta (para de renderizar) no fim da animação.
  function sair() {
    const fim = (r: { finished: boolean }) => { if (r.finished) setMontado(false); };
    if (modoRef.current === 'barra') {
      Animated.timing(barAnim, {
        toValue: 0, duration: 320, easing: Easing.in(Easing.cubic), useNativeDriver: false,
      }).start(fim);
    } else {
      const w = Dimensions.get('window');
      const foraX = posRef.current.x + BOLHA / 2 < w.width / 2 ? -BOLHA - MARGEM * 2 : w.width + MARGEM * 2;
      Animated.parallel([
        Animated.timing(pos.x, { toValue: foraX, duration: 340, easing: Easing.in(Easing.cubic), useNativeDriver: false }),
        Animated.timing(bolhaAnim, { toValue: 0, duration: 340, useNativeDriver: false }),
      ]).start((r) => { pos.setValue(posRef.current); fim(r); });  // reseta pos pro último ponto válido
    }
  }

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 3 || Math.abs(g.dy) > 3,
    onPanResponderGrant: () => {
      movido.current = 0;
      // captura a posição visual EXATA (para qualquer spring em andamento) como base do arrasto
      pos.stopAnimation((v: { x: number; y: number }) => {
        dragStart.current = { x: v.x, y: v.y };
        posRef.current = { x: v.x, y: v.y };
      });
    },
    onPanResponderMove: (_, g) => {
      movido.current = Math.max(movido.current, Math.abs(g.dx) + Math.abs(g.dy));
      const nx = dragStart.current.x + g.dx;   // posição ABSOLUTA (sem offset)
      const ny = dragStart.current.y + g.dy;
      posRef.current = { x: nx, y: ny };
      pos.setValue({ x: nx, y: ny });
    },
    onPanResponderRelease: (_, g) => {
      if (movido.current < 6) { expandir(); return; }  // foi toque, não arrasto → expande
      const w = Dimensions.get('window');
      const ins = insetsRef.current;
      const cx = posRef.current.x + BOLHA / 2;
      // fling: a velocidade decide o lado; senão, o lado mais próximo
      const paraDir = g.vx > 0.3 ? true : g.vx < -0.3 ? false : cx > w.width / 2;
      const destX = paraDir ? w.width - BOLHA - MARGEM : MARGEM;
      const minY = ins.top + 6;
      const maxY = w.height - BOLHA - ins.bottom - 6;
      const destY = Math.max(minY, Math.min(maxY, posRef.current.y));  // MANTÉM o Y arrastado
      posRef.current = { x: destX, y: destY };
      Animated.spring(pos, {
        toValue: { x: destX, y: destY }, useNativeDriver: false, friction: 7, tension: 60,
      }).start();
    },
  })).current;

  if (!montado || !dados.length) return null;
  const visiveis = dados.slice(0, MAX_LINHAS);
  const resto = dados.length - visiveis.length;
  const varios = dados.length > 1;
  const pctBolha = varios ? null : pctDe(dados[0]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* BARRA (aberta, embaixo) */}
      <Animated.View
        pointerEvents={modo === 'barra' ? 'box-none' : 'none'}
        style={[styles.barraWrap, {
          bottom: insets.bottom + 10,
          opacity: barAnim,
          transform: [{ translateY: barAnim.interpolate({ inputRange: [0, 1], outputRange: [90, 0] }) }],
        }]}>
        <View style={styles.pill}>
          {varios && (
            <View style={styles.cabecalho}>
              <LoadingDog size={20} />
              <Text style={styles.cabecalhoTxt}>{dados.length} rodando</Text>
            </View>
          )}
          {visiveis.map((r) => (
            <Linha key={r.id} run={r} soUm={!varios} onAbrir={onAbrir} />
          ))}
          {resto > 0 && <Text style={styles.mais}>+{resto} rodando</Text>}
        </View>
      </Animated.View>

      {/* BOLHA (de cantinho, arrastável) */}
      <Animated.View
        pointerEvents={modo === 'bolha' ? 'auto' : 'none'}
        {...pan.panHandlers}
        style={[styles.bolhaWrap, {
          opacity: bolhaAnim,
          transform: [
            { translateX: pos.x },
            { translateY: pos.y },
            { scale: bolhaAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) },
          ],
        }]}>
        <View style={styles.bolha}>
          <LoadingDog size={28} />
          {varios ? (
            <View style={styles.badge}><Text style={styles.badgeTxt}>{dados.length}</Text></View>
          ) : (
            <Text style={styles.bolhaPct}>{pctBolha != null ? `${pctBolha}%` : '···'}</Text>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

/** Uma linha da pílula = um bot rodando. Tocar abre a Run dele. */
function Linha({ run, soUm, onAbrir }: {
  run: RunInfo; soUm: boolean; onAbrir?: (runId: string, titulo: string) => void;
}) {
  const cor = corDoBot(run.bot);
  const p = run.progress;
  const pct = pctDe(run);
  const titulo = run.titulo ?? run.bot;
  return (
    <Pressable onPress={() => onAbrir?.(run.id, titulo)} style={styles.linha}>
      {soUm ? (
        <LoadingDog size={26} />
      ) : (
        <View style={[styles.marcador, { borderColor: cor }]}>
          <Ionicons name={iconeDoBot(run.bot)} size={13} color={cor} />
        </View>
      )}
      <View style={{ flex: 1, gap: 5 }}>
        <Text style={styles.titulo} numberOfLines={1}>
          {pct != null ? `${titulo} · ${pct}%` : `${titulo}…`}
        </Text>
        {p && p.total ? (
          <View style={styles.trilho}>
            <View style={[styles.preenchido, { width: `${pct ?? 0}%`, backgroundColor: cor }]} />
          </View>
        ) : null}
        {/* a LINHA VIVA embaixo do nome: durante o progresso, done/total · label; antes dele
            (abrindo navegador / paginando a thread), o status_log — nunca fica vazio */}
        <Text style={styles.sub} numberOfLines={1}>
          {p && p.total
            ? `${p.done}/${p.total}${p.label ? `  ·  ${p.label}` : ''}`
            : (run.status_log || 'começando…')}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  barraWrap: { position: 'absolute', left: 12, right: 12 },
  pill: {
    gap: 10, backgroundColor: colors.card,
    borderRadius: 16, borderWidth: 1, borderColor: colors.marca, paddingVertical: 12, paddingHorizontal: 14,
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 10,
  },
  cabecalho: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cabecalhoTxt: { color: colors.textoFraco, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  marcador: {
    width: 26, height: 26, borderRadius: 13, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  titulo: { color: colors.texto, fontSize: 14, fontWeight: '800' },
  trilho: { height: 7, borderRadius: 999, backgroundColor: colors.card2, overflow: 'hidden' },
  preenchido: { height: '100%', borderRadius: 999 },
  sub: { color: colors.textoFraco, fontSize: 11 },
  mais: { color: colors.textoFraco, fontSize: 11, fontWeight: '700', textAlign: 'center' },
  bolhaWrap: { position: 'absolute', top: 0, left: 0 },
  bolha: {
    width: BOLHA, height: BOLHA, borderRadius: BOLHA / 2, backgroundColor: colors.card,
    borderWidth: 1.5, borderColor: colors.marca, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 12,
  },
  bolhaPct: { color: colors.marca, fontSize: 11, fontWeight: '800', marginTop: -1 },
  badge: {
    position: 'absolute', top: 4, right: 4, minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: colors.marca, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  badgeTxt: { color: '#0F0F0F', fontSize: 11, fontWeight: '800' },
});
