import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { api, Bot, RunHistorico } from '@/lib/api';
import { colors } from '@/theme';
import { Aparece, Card } from '@/ui/components';
import { TelaCarregando } from '@/ui/LoadingDog';
import { useDogRefresh } from '@/ui/DogRefresh';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type FiltroBot = 'todos' | string;
type FiltroRes = 'todos' | 'ok' | 'bloqueio' | 'erro' | 'parado';
type Periodo = 'tudo' | '7d' | '30d';

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
  const [fRes, setFRes] = useState<FiltroRes>('todos');
  const [periodo, setPeriodo] = useState<Periodo>('tudo');

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
    const corte = periodo === 'tudo' ? 0 : Date.now() / 1000 - (periodo === '7d' ? 7 : 30) * 86400;
    return regs.filter((r) => {
      if (fBot !== 'todos' && r.bot !== fBot) return false;
      if (periodo !== 'tudo' && (r.ended_at ?? 0) < corte) return false;
      if (fRes === 'ok' && !(r.status === 'finalizado' && !r.bloqueio)) return false;
      if (fRes === 'bloqueio' && !r.bloqueio) return false;
      if (fRes === 'erro' && !(r.status === 'erro' && !r.bloqueio)) return false;
      if (fRes === 'parado' && r.status !== 'parado') return false;
      return true;
    });
  }, [regs, fBot, fRes, periodo]);

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

  const botsDisponiveis = useMemo(
    () => Array.from(new Set((regs ?? []).map((r) => r.bot))), [regs]);

  if (!regs) return <TelaCarregando />;

  return (
    <View style={styles.tela}>
    {dog}
    <FlatList
      style={styles.tela}
      data={filtrados}
      keyExtractor={(r) => r.id}
      contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 24 }}
      {...scrollProps}
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: 4 }}>
          {spacerEl}
          <Aparece>
            <Card style={styles.resumo}>
              <View>
                <Text style={styles.resumoNum}>{resumo.runs}</Text>
                <Text style={styles.resumoLabel}>runs</Text>
              </View>
              <View style={styles.divisor} />
              <View>
                <Text style={styles.resumoNum}>{resumo.acoes}</Text>
                <Text style={styles.resumoLabel}>ações (seguir + DM)</Text>
              </View>
            </Card>
          </Aparece>

          {botsDisponiveis.length > 1 && (
            <ChipRow valor={fBot} onSel={setFBot}
              ops={[['todos', 'Todos'], ...botsDisponiveis.map((b) => [b, nomes[b] ?? b] as [string, string])]} />
          )}
          <ChipRow valor={fRes} onSel={(v) => setFRes(v as FiltroRes)}
            ops={[['todos', 'Todos'], ['ok', 'ok'], ['bloqueio', 'bloqueio'], ['erro', 'erro'], ['parado', 'parado']]} />
          <ChipRow valor={periodo} onSel={(v) => setPeriodo(v as Periodo)}
            ops={[['tudo', 'Tudo'], ['7d', '7 dias'], ['30d', '30 dias']]} />
        </View>
      }
      ListEmptyComponent={<Text style={styles.vazio}>Nenhuma run nesse filtro.</Text>}
      renderItem={({ item, index }) => {
        const res = resultado(item);
        const dur = fmtDur(item.duracao_s);
        return (
          <Aparece delay={Math.min(index, 8) * 30}>
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
                <Text style={styles.meta}>{fmtData(item.ended_at)}</Text>
                {dur ? <Text style={styles.meta}>· {dur}</Text> : null}
                {item.backfill ? <Text style={styles.metaFraco}>· importada</Text> :
                  <Ionicons name="chevron-forward" size={14} color={colors.textoFraco} style={{ marginLeft: 'auto' }} />}
              </View>
            </Card>
            </TouchableOpacity>
          </Aparece>
        );
      }}
    />
    </View>
  );
}

function ChipRow({ valor, onSel, ops }:
  { valor: string; onSel: (v: string) => void; ops: [string, string][] }) {
  return (
    <View style={styles.chips}>
      {ops.map(([v, label]) => (
        <Text key={v} onPress={() => onSel(v)}
          style={[styles.chip, valor === v && styles.chipOn]}>
          {label}
        </Text>
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    color: colors.texto, fontSize: 13, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6,
  },
  chipOn: { backgroundColor: colors.marca, borderColor: colors.marca, color: '#0F0F0F', fontWeight: '700' },
  topoLinha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  badgeTxt: { fontSize: 12, fontWeight: '700' },
  botNome: { color: colors.texto, fontSize: 16, fontWeight: '700', flex: 1 },
  saldo: { color: colors.textoFraco, fontSize: 13 },
  rodape: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  meta: { color: colors.textoFraco, fontSize: 12 },
  metaFraco: { color: colors.border, fontSize: 12 },
  vazio: { color: colors.textoFraco, textAlign: 'center', marginTop: 24 },
});
