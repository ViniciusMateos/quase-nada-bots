import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import Animated, {
  FadeIn, FadeInDown, FadeOut, FadeOutUp, LinearTransition, SlideInDown, SlideOutDown,
} from 'react-native-reanimated';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { api, Bot, RunHistorico } from '@/lib/api';
import { cmpTexto } from '@/lib/ordenar';
import { colors } from '@/theme';
import { Aparece, Botao, Card } from '@/ui/components';
import { TelaCarregando } from '@/ui/LoadingDog';
import { useDogRefresh } from '@/ui/DogRefresh';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type FiltroBot = 'todos' | string;
type FiltroRes = 'todos' | 'ok' | 'bloqueio' | 'erro' | 'parado';
type Periodo = 'tudo' | 'hoje' | 'ontem' | '7d' | '30d';

const RES_LABEL: Record<string, string> = { ok: 'ok', bloqueio: 'bloqueio', erro: 'erro', parado: 'parado' };
const PER_LABEL: Record<string, string> = { hoje: 'hoje', ontem: 'ontem', '7d': '7 dias', '30d': '30 dias' };

// janela [início, fim) em epoch-segundos pra cada período
function janelaPeriodo(p: Periodo): [number, number] {
  const agora = Date.now() / 1000;
  const d = new Date();
  const inicioHoje = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 1000;
  if (p === 'hoje') return [inicioHoje, Infinity];
  if (p === 'ontem') return [inicioHoje - 86400, inicioHoje];
  if (p === '7d') return [agora - 7 * 86400, Infinity];
  if (p === '30d') return [agora - 30 * 86400, Infinity];
  return [0, Infinity];   // tudo
}

// rótulo do cabeçalho de data: Hoje / Ontem / N dias atrás (até 6) / Semana 2, 3… (por semana)
function bucketData(epoch: number | null): string {
  if (!epoch) return 'Sem data';
  const h = new Date();
  const inicioHoje = new Date(h.getFullYear(), h.getMonth(), h.getDate()).getTime();
  const d = new Date(epoch * 1000);
  const inicioDia = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dias = Math.round((inicioHoje - inicioDia) / 86400000);
  if (dias <= 0) return 'Hoje';
  if (dias === 1) return 'Ontem';
  if (dias <= 6) return `${dias} dias atrás`;
  return `Semana ${Math.floor(dias / 7) + 1}`;
}

// backdrop que faz FADE por trás do sheet (independente do slide do sheet)
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function fmtData(epoch: number | null) {
  if (!epoch) return '—';
  const d = new Date(epoch * 1000);
  const dia = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${dia}/${MESES[d.getMonth()]} · ${hh}:${mm}`;
}
function fmtDur(s: number | null) {
  if (s == null) return null;
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${Math.round(s % 60)}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function resultado(r: RunHistorico): { icon: keyof typeof Ionicons.glyphMap; label: string; cor: string } {
  if (r.bloqueio) return { icon: 'ban', label: 'bloqueio', cor: colors.erro };
  if (r.status === 'erro') return { icon: 'close-circle', label: 'erro', cor: colors.erro };
  if (r.status === 'parado') return { icon: 'stop-circle', label: 'parado', cor: colors.textoFraco };
  return { icon: 'checkmark-circle', label: 'ok', cor: colors.ok };
}

function saldoTxt(r: RunHistorico): string {
  const s = r.saldo || {};
  if (r.bot === 'auto-follow') {
    return `${s.seguidos ?? 0} seguidos · ${s.pedidos ?? 0} pedidos · ${s.pulados ?? 0} pulados`;
  }
  if (r.bot === 'dm-followers') {
    return `${s.enviadas ?? 0} DMs · ${s.puladas ?? 0} puladas`;
  }
  return Object.entries(s).map(([k, v]) => `${v} ${k}`).join(' · ') || 'sem saldo';
}

export function HistoricoScreen() {
  const nav = useNavigation<Nav>();
  const [regs, setRegs] = useState<RunHistorico[] | null>(null);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [fBot, setFBot] = useState<FiltroBot>('todos');
  const [fConta, setFConta] = useState<string>('todos');
  const [fRes, setFRes] = useState<FiltroRes>('todos');
  const [periodo, setPeriodo] = useState<Periodo>('tudo');
  const [sheetAberto, setSheetAberto] = useState(false);   // controla as animações (fade/slide)
  const [modalMontado, setModalMontado] = useState(false); // mantém o Modal vivo enquanto o exit roda
  const abrirSheet = () => { setModalMontado(true); setSheetAberto(true); };
  const fecharSheet = () => { setSheetAberto(false); setTimeout(() => setModalMontado(false), 240); };

  const carregar = useCallback(async () => {
    await Promise.all([
      api.getHistorico().then(setRegs).catch(() => setRegs([])),
      api.listBots().then((b: Record<string, Bot>) => {
        const m: Record<string, string> = {};
        Object.entries(b).forEach(([id, v]) => { m[id] = v.nome; });
        setNomes(m);
      }).catch(() => {}),
    ]);
  }, []);
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  // puxar-pra-atualizar: o histórico só carregava no mount, sem jeito de forçar refresh
  const { scrollProps, dog, spacerEl } = useDogRefresh(carregar);

  const filtrados = useMemo(() => {
    if (!regs) return [];
    const [ini, fim] = janelaPeriodo(periodo);
    return regs.filter((r) => {
      if (fBot !== 'todos' && r.bot !== fBot) return false;
      if (fConta !== 'todos' && r.conta !== fConta) return false;
      const t = r.ended_at ?? 0;
      if (t < ini || t >= fim) return false;
      if (fRes === 'ok' && !(r.status === 'finalizado' && !r.bloqueio)) return false;
      if (fRes === 'bloqueio' && !r.bloqueio) return false;
      if (fRes === 'erro' && !(r.status === 'erro' && !r.bloqueio)) return false;
      if (fRes === 'parado' && r.status !== 'parado') return false;
      return true;
    });
  }, [regs, fBot, fConta, fRes, periodo]);

  const resumo = useMemo(() => {
    let acoes = 0;
    for (const r of filtrados) {
      const s = r.saldo || {};
      acoes += r.bot === 'auto-follow'
        ? Number(s.seguidos ?? 0) + Number(s.pedidos ?? 0)
        : Number(s.enviadas ?? 0);
    }
    return { runs: filtrados.length, acoes };
  }, [filtrados]);

  // listagens SEMPRE ordenadas: bots pelo nome de exibição, contas em ordem natural
  // (@segue2 antes de @segue10) — antes vinham na ordem de aparição nas runs (aleatória).
  const botsDisponiveis = useMemo(
    () => Array.from(new Set((regs ?? []).map((r) => r.bot)))
      .sort((a, b) => cmpTexto(nomes[a] ?? a, nomes[b] ?? b)), [regs, nomes]);
  const contasDisponiveis = useMemo(
    () => (Array.from(new Set((regs ?? []).map((r) => r.conta).filter(Boolean))) as string[])
      .sort(cmpTexto), [regs]);

  // runs (mais novas primeiro) com CABEÇALHOS de data intercalados (Hoje/Ontem/N dias/Semana X).
  // Vale com qualquer filtro ativo — o agrupamento é sobre o conjunto já filtrado.
  const listaComCabecalhos = useMemo<(RunHistorico | { _header: string })[]>(() => {
    const ord = [...filtrados].sort((a, b) => (b.ended_at ?? 0) - (a.ended_at ?? 0));
    const out: (RunHistorico | { _header: string })[] = [];
    let atual: string | null = null;
    for (const r of ord) {
      const b = bucketData(r.ended_at);
      if (b !== atual) { out.push({ _header: b }); atual = b; }
      out.push(r);
    }
    return out;
  }, [filtrados]);

  // filtros ATIVOS (fora do padrão) → viram chips removíveis na barra; o resto mora no sheet
  const chipsAtivos = useMemo(() => {
    const cs: { key: string; label: string; clear: () => void }[] = [];
    if (fBot !== 'todos') cs.push({ key: 'bot', label: nomes[fBot] ?? fBot, clear: () => setFBot('todos') });
    if (fConta !== 'todos') cs.push({ key: 'conta', label: `@${fConta}`, clear: () => setFConta('todos') });
    if (fRes !== 'todos') cs.push({ key: 'res', label: RES_LABEL[fRes] ?? fRes, clear: () => setFRes('todos') });
    if (periodo !== 'tudo') cs.push({ key: 'per', label: PER_LABEL[periodo] ?? periodo, clear: () => setPeriodo('tudo') });
    return cs;
  }, [fBot, fConta, fRes, periodo, nomes]);
  const limparTudo = () => { setFBot('todos'); setFConta('todos'); setFRes('todos'); setPeriodo('tudo'); };

  if (!regs) return <TelaCarregando />;

  return (
    <View style={styles.tela}>
    {dog}
    <FlatList
      style={styles.tela}
      data={listaComCabecalhos}
      keyExtractor={(item) => ('_header' in item ? `h:${item._header}` : item.id)}
      contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 24 }}
      {...scrollProps}
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: 4 }}>
          {spacerEl}
          <Aparece>
            <Card style={styles.resumo}>
              <View>
                <Animated.Text key={resumo.runs} entering={FadeIn.duration(260)} style={styles.resumoNum}>
                  {resumo.runs}
                </Animated.Text>
                <Text style={styles.resumoLabel}>runs</Text>
              </View>
              <View style={styles.divisor} />
              <View>
                <Animated.Text key={resumo.acoes} entering={FadeIn.duration(260)} style={styles.resumoNum}>
                  {resumo.acoes}
                </Animated.Text>
                <Text style={styles.resumoLabel}>ações (seguir + DM)</Text>
              </View>
            </Card>
          </Aparece>

          {/* barra compacta: botão Filtros (com contador) + os ativos como chips removíveis */}
          <View style={styles.filtroBar}>
            <TouchableOpacity activeOpacity={0.7} style={styles.filtroBtn} onPress={abrirSheet}>
              <Ionicons name="options-outline" size={16} color={colors.texto} />
              <Text style={styles.filtroBtnTxt}>Filtros</Text>
              {chipsAtivos.length > 0 && (
                <View style={styles.filtroBadge}>
                  <Text style={styles.filtroBadgeTxt}>{chipsAtivos.length}</Text>
                </View>
              )}
            </TouchableOpacity>
            {chipsAtivos.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.ativosRow}>
                {chipsAtivos.map((c) => (
                  <Animated.View key={c.key} entering={FadeInDown.duration(200)}
                    exiting={FadeOutUp.duration(160)} layout={LinearTransition.duration(220)}>
                    <TouchableOpacity activeOpacity={0.7} style={styles.chipAtivo} onPress={c.clear}>
                      <Text style={styles.chipAtivoTxt}>{c.label}</Text>
                      <Ionicons name="close" size={12} color={colors.marca} />
                    </TouchableOpacity>
                  </Animated.View>
                ))}
              </ScrollView>
            ) : (
              <Text style={styles.filtroVazio}>mostrando tudo</Text>
            )}
          </View>
        </View>
      }
      ListEmptyComponent={<Text style={styles.vazio}>Nenhuma run nesse filtro.</Text>}
      renderItem={({ item }) => {
        if ('_header' in item) {
          return (
            <Animated.View entering={FadeIn.duration(220)} layout={LinearTransition.duration(220)}>
              <Text style={styles.dataHeader}>{item._header}</Text>
            </Animated.View>
          );
        }
        const res = resultado(item);
        const dur = fmtDur(item.duracao_s);
        return (
          // transição quando o filtro muda: entra (FadeInDown), sai (FadeOutUp) e reordena (layout)
          <Animated.View entering={FadeInDown.duration(240)} exiting={FadeOutUp.duration(160)}
            layout={LinearTransition.duration(240)}>
            {/* tocar no card abre o log daquele run (funciona pras runs que o server ainda
                tem em memória; as importadas antigas mostram só o saldo). */}
            <TouchableOpacity activeOpacity={0.7} disabled={item.backfill}
              onPress={() => nav.navigate('Run', { runId: item.id, nome: nomes[item.bot] ?? item.bot })}>
            <Card style={{ gap: 6 }}>
              <View style={styles.topoLinha}>
                <Text style={styles.botNome}>
                  {nomes[item.bot] ?? item.bot}{item.dry_run ? '  ·  simulação' : ''}
                </Text>
                <View style={[styles.badge, { borderColor: res.cor }]}>
                  <Ionicons name={res.icon} size={13} color={res.cor} />
                  <Text style={[styles.badgeTxt, { color: res.cor }]}>{res.label}</Text>
                </View>
              </View>
              <Text style={styles.saldo}>{saldoTxt(item)}</Text>
              <View style={styles.rodape}>
                {item.conta ? (
                  <>
                    <Ionicons name="person-circle-outline" size={13} color={colors.marca} />
                    <Text style={styles.metaConta}>@{item.conta}</Text>
                    <Text style={styles.meta}>·</Text>
                  </>
                ) : null}
                <Text style={styles.meta}>{fmtData(item.ended_at)}</Text>
                {dur ? <Text style={styles.meta}>· {dur}</Text> : null}
                {item.backfill ? <Text style={styles.metaFraco}>· importada</Text> :
                  <Ionicons name="chevron-forward" size={14} color={colors.textoFraco} style={{ marginLeft: 'auto' }} />}
              </View>
            </Card>
            </TouchableOpacity>
          </Animated.View>
        );
      }}
    />

    {/* bottom sheet dos filtros — backdrop só FADE (atrás), sheet só SLIDE (sobe). animationType
        "none" pra o Modal não deslizar tudo junto; cada camada anima sozinha via reanimated. */}
    <Modal visible={modalMontado} transparent animationType="none" onRequestClose={fecharSheet}>
      {sheetAberto && (
      <View style={styles.modalRoot}>
        <AnimatedPressable entering={FadeIn.duration(220)} exiting={FadeOut.duration(200)}
          style={styles.backdrop} onPress={fecharSheet} />
        <Animated.View entering={SlideInDown.duration(280)} exiting={SlideOutDown.duration(240)}
          style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.sheetTopo}>
          <Text style={styles.sheetTitulo}>Filtros</Text>
          {chipsAtivos.length > 0 && (
            <TouchableOpacity onPress={limparTudo} hitSlop={8}>
              <Text style={styles.limparTxt}>Limpar tudo</Text>
            </TouchableOpacity>
          )}
        </View>
        <ScrollView contentContainerStyle={{ gap: 24, paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
          <FiltroGrupo titulo="Período" valor={periodo} onSel={(v) => setPeriodo(v as Periodo)}
            ops={[['tudo', 'Tudo'], ['hoje', 'Hoje'], ['ontem', 'Ontem'], ['7d', '7 dias'], ['30d', '30 dias']]} />
          {botsDisponiveis.length > 1 && (
            <FiltroGrupo titulo="Bot" valor={fBot} onSel={setFBot}
              ops={[['todos', 'Todos'], ...botsDisponiveis.map((b) => [b, nomes[b] ?? b] as [string, string])]} />
          )}
          {contasDisponiveis.length > 1 && (
            <FiltroGrupo titulo="Conta" valor={fConta} onSel={setFConta}
              ops={[['todos', 'Todas'], ...contasDisponiveis.map((c) => [c, `@${c}`] as [string, string])]} />
          )}
          <FiltroGrupo titulo="Resultado" valor={fRes} onSel={(v) => setFRes(v as FiltroRes)}
            ops={[['todos', 'Todos'], ['ok', 'ok'], ['bloqueio', 'bloqueio'], ['erro', 'erro'], ['parado', 'parado']]} />
        </ScrollView>
        <Botao title={`Ver ${resumo.runs} ${resumo.runs === 1 ? 'run' : 'runs'}`}
          onPress={fecharSheet} />
        </Animated.View>
      </View>
      )}
    </Modal>
    </View>
  );
}

function FiltroGrupo({ titulo, valor, onSel, ops }:
  { titulo: string; valor: string; onSel: (v: string) => void; ops: [string, string][] }) {
  return (
    <View style={{ gap: 12 }}>
      <Text style={styles.grupoLabel}>{titulo}</Text>
      <ChipRow valor={valor} onSel={onSel} ops={ops} />
    </View>
  );
}

function ChipRow({ valor, onSel, ops }:
  { valor: string; onSel: (v: string) => void; ops: [string, string][] }) {
  return (
    <View style={styles.chips}>
      {ops.map(([v, label], i) => (
        // fade de entrada (o "foldzin" da tela de modo) + press normal — sem pulo
        <Animated.View key={v} entering={FadeInDown.delay(i * 25).duration(220)}
          layout={LinearTransition.duration(200)}>
          <TouchableOpacity activeOpacity={0.7} onPress={() => onSel(v)}>
            <Text style={[styles.chip, valor === v && styles.chipOn]}>{label}</Text>
          </TouchableOpacity>
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.bg },
  resumo: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  resumoNum: { color: colors.texto, fontSize: 26, fontWeight: '800' },
  resumoLabel: { color: colors.textoFraco, fontSize: 12 },
  divisor: { width: 1, alignSelf: 'stretch', backgroundColor: colors.border },

  // barra compacta de filtro
  filtroBar: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  filtroBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: colors.border, borderRadius: 999,
    paddingHorizontal: 14, paddingVertical: 9,
  },
  filtroBtnTxt: { color: colors.texto, fontSize: 14, fontWeight: '700' },
  filtroBadge: {
    minWidth: 18, height: 18, borderRadius: 999, backgroundColor: colors.marca,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, marginLeft: 2,
  },
  filtroBadgeTxt: { color: '#0F0F0F', fontSize: 11, fontWeight: '800' },
  filtroVazio: { color: colors.textoFraco, fontSize: 13 },
  ativosRow: { gap: 6, alignItems: 'center', paddingRight: 4 },
  chipAtivo: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderColor: colors.marca, borderRadius: 999,
    paddingLeft: 12, paddingRight: 9, paddingVertical: 6,
  },
  chipAtivoTxt: { color: colors.marca, fontSize: 13, fontWeight: '700' },

  // bottom sheet
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: '#171717', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderTopWidth: 1, borderColor: colors.border,
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 34, gap: 20, maxHeight: '82%',
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 999, backgroundColor: colors.border },
  sheetTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitulo: { color: colors.texto, fontSize: 20, fontWeight: '800' },
  limparTxt: { color: colors.marca, fontSize: 14, fontWeight: '700' },
  grupoLabel: { color: colors.textoFraco, fontSize: 12.5, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: {
    color: colors.texto, fontSize: 14, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 15, paddingVertical: 10,
  },
  chipOn: { backgroundColor: colors.marca, borderColor: colors.marca, color: '#0F0F0F', fontWeight: '700' },

  topoLinha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  badgeTxt: { fontSize: 12, fontWeight: '700' },
  botNome: { color: colors.texto, fontSize: 16, fontWeight: '700', flex: 1 },
  saldo: { color: colors.textoFraco, fontSize: 13 },
  rodape: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  meta: { color: colors.textoFraco, fontSize: 12 },
  metaConta: { color: colors.marca, fontSize: 12, fontWeight: '700' },
  metaFraco: { color: colors.border, fontSize: 12 },
  vazio: { color: colors.textoFraco, textAlign: 'center', marginTop: 24 },
  dataHeader: {
    color: colors.texto, fontSize: 13, fontWeight: '800', textTransform: 'uppercase',
    letterSpacing: 0.6, marginTop: 10, marginBottom: 2,
  },
});
