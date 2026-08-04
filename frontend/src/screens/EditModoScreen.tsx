import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp, LinearTransition } from 'react-native-reanimated';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '@/lib/api';
import { colors } from '@/theme';
import { Botao, Card } from '@/ui/components';
import { TecladoView } from '@/ui/TecladoView';
import { TelaCarregando } from '@/ui/LoadingDog';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rt = RouteProp<RootStackParamList, 'EditModo'>;
type Modos = Record<string, Record<string, unknown>>;
type Valor = number | boolean | number[];
type Tipo = 'bool' | 'cap' | 'range';

// ── categorias (ordem de exibição) ──────────────────────────────────────────
const CATS: { key: string; titulo: string }[] = [
  { key: 'limites', titulo: 'Limites de segurança' },
  { key: 'aquecimento', titulo: 'Aquecimento humano' },
  { key: 'ritmo', titulo: 'Ritmo e delays' },
  { key: 'horario', titulo: 'Horário' },
  { key: 'outros', titulo: 'Outros' },
];

// ── metadata dos campos (rótulo, categoria, tipo, sugestão ao ligar) ─────────
// tipo 'cap'   → toggle; ligado abre 1 número; desligado = 0 (sem limite)
// tipo 'range' → toggle; ligado abre "de X até Y"; desligado = [0,0] (sem)
// tipo 'bool'  → só o interruptor
type MetaF = { label: string; cat: string; tipo: Tipo; sug?: Valor; dica?: string };
const META: Record<string, MetaF> = {
  aplicar_caps: { label: 'Respeitar limites', cat: 'limites', tipo: 'bool',
    dica: 'Desligado = ignora os limites abaixo e roda até o Instagram bloquear.' },
  max_follows_dia: { label: 'Máx. follows por dia', cat: 'limites', tipo: 'cap', sug: 60 },
  max_follows_hora: { label: 'Máx. follows por hora', cat: 'limites', tipo: 'cap', sug: 15 },
  max_posts_por_run: { label: 'Máx. posts por run', cat: 'limites', tipo: 'cap', sug: 5 },
  limite_follows_run: { label: 'Máx. follows reais por run', cat: 'limites', tipo: 'cap', sug: 150,
    dica: 'Só quem virou "Seguindo" (público). Pedido a privado NÃO conta aqui.' },
  limite_interacoes_run: { label: 'Máx. interações por run', cat: 'limites', tipo: 'cap', sug: 200,
    dica: 'Toda ação de follow: público + pedido a privado. É o que o IG conta pro rate-limit.' },
  max_dms_dia: { label: 'Máx. DMs por dia', cat: 'limites', tipo: 'cap', sug: 50 },
  max_dms_hora: { label: 'Máx. DMs por hora', cat: 'limites', tipo: 'cap', sug: 15 },
  max_dms_por_run: { label: 'Máx. DMs por run', cat: 'limites', tipo: 'cap', sug: 30 },
  pausa_longa_cada: { label: 'Pausa longa a cada N ações', cat: 'ritmo', tipo: 'cap', sug: 10 },
  delay_follow: { label: 'Delay entre follows (s)', cat: 'ritmo', tipo: 'range', sug: [3, 8] },
  delay_dm: { label: 'Delay entre DMs (s)', cat: 'ritmo', tipo: 'range', sug: [5, 20] },
  delay_post: { label: 'Delay entre posts (s)', cat: 'ritmo', tipo: 'range', sug: [180, 480] },
  delay_acao_ui: { label: 'Delay de navegação (s)', cat: 'ritmo', tipo: 'range', sug: [1, 4] },
  pausa_longa: { label: 'Duração da pausa longa (s)', cat: 'ritmo', tipo: 'range', sug: [5, 15] },
  delay_entre_chats: { label: 'Delay entre chats (s)', cat: 'ritmo', tipo: 'range', sug: [120, 300] },
  usar_delay_entre_chats: { label: 'Esperar entre chats', cat: 'ritmo', tipo: 'bool' },
  delay_scroll: { label: 'Delay entre rolagens (s)', cat: 'ritmo', tipo: 'range', sug: [2, 6] },
  humanizar: { label: 'Humanizar (pausas navegando)', cat: 'ritmo', tipo: 'bool',
    dica: 'No meio de seguir/mandar DM, sai e navega (feed, story, curtir) e volta — quebra o padrão de rajada, que é o que o IG mais pega.' },
  pausa_cada: { label: 'Pausa humana a cada N ações', cat: 'ritmo', tipo: 'cap', sug: 10,
    dica: 'A cada quantos follows/DMs ele dá a paradinha pra navegar.' },
  active_hours: { label: 'Janela de horário (0–23)', cat: 'horario', tipo: 'range', sug: [9, 23] },
  // ── aquecimento humano ──
  duracao_min: { label: 'Duração da navegação (min)', cat: 'aquecimento', tipo: 'range', sug: [3, 7] },
  max_curtidas: { label: 'Máx. curtidas por run', cat: 'aquecimento', tipo: 'cap', sug: 5 },
  prob_curtir: { label: 'Chance de curtir por rolagem (%)', cat: 'aquecimento', tipo: 'cap', sug: 30,
    dica: 'De 0 a 100. Ex: 30 = 30% de chance de curtir a cada rolagem (até o máximo acima).' },
  ver_stories: { label: 'Ver stories', cat: 'aquecimento', tipo: 'bool' },
  max_stories: { label: 'Máx. stories por run', cat: 'aquecimento', tipo: 'cap', sug: 5 },
  prob_story: { label: 'Chance de ver stories (%)', cat: 'aquecimento', tipo: 'cap', sug: 25,
    dica: 'De 0 a 100. Chance de ir dar uma olhada nos stories durante a navegação.' },
  ver_explore: { label: 'Passar no explorar', cat: 'aquecimento', tipo: 'bool' },
};

// campos ESCONDIDOS do editor (o bot já cuida deles; não faz sentido mexer)
const OCULTOS = new Set([
  'pular_ja_seguidos', 'pular_pendentes', 'seguir_privados', 'start_from_oldest_se_vazio',
]);

// valores dos ocultos gravados SEMPRE (garante o comportamento certo sem depender do worker):
// seguir privados LIGADO por padrão, pula quem já seguiu/pediu, e não age sozinho se vazio.
const OCULTOS_DEFAULT: Record<string, Record<string, Valor>> = {
  'auto-follow': {
    pular_ja_seguidos: true, pular_pendentes: true, seguir_privados: true,
    start_from_oldest_se_vazio: false,
  },
  'dm-followers': {},
};

// campos de um modo NOVO (zerado), por bot — a fonte da verdade quando não há template
const CAMPOS_NOVO: Record<string, string[]> = {
  'auto-follow': [
    'aplicar_caps', 'max_follows_dia', 'max_follows_hora', 'max_posts_por_run',
    'limite_follows_run', 'limite_interacoes_run', 'pausa_longa_cada', 'delay_follow', 'delay_post', 'delay_acao_ui',
    'pausa_longa', 'usar_delay_entre_chats', 'delay_entre_chats', 'humanizar', 'pausa_cada', 'active_hours',
  ],
  'dm-followers': [
    'aplicar_caps', 'max_dms_dia', 'max_dms_hora', 'max_dms_por_run', 'pausa_longa_cada',
    'delay_dm', 'delay_acao_ui', 'pausa_longa', 'humanizar', 'pausa_cada', 'active_hours',
  ],
  'human-warmup': [
    'aplicar_caps', 'duracao_min', 'max_curtidas', 'prob_curtir', 'ver_stories', 'max_stories',
    'prob_story', 'ver_explore', 'delay_scroll', 'delay_acao_ui', 'active_hours',
  ],
};

function metaDe(k: string, v: unknown): MetaF {
  if (META[k]) return META[k];
  const tipo: Tipo = typeof v === 'boolean' ? 'bool' : Array.isArray(v) ? 'range' : 'cap';
  return { label: k, cat: 'outros', tipo };
}

const zerado = (tipo: Tipo): Valor => (tipo === 'bool' ? false : tipo === 'range' ? [0, 0] : 0);

function temValor(tipo: Tipo, v: Valor): boolean {
  if (tipo === 'bool') return Boolean(v);
  if (tipo === 'range') { const a = v as number[]; return (a?.[0] || 0) > 0 || (a?.[1] || 0) > 0; }
  return (v as number) > 0;
}

const num = (t: string): number => { const n = parseFloat(t.replace(',', '.')); return isNaN(n) ? 0 : n; };
// mostra vazio quando é 0 (pra dar pra apagar e digitar do zero sem ficar "0" preso)
const txt = (n: number): string => (n ? String(n) : '');

export function EditModoScreen() {
  const nav = useNavigation<Nav>();
  const { botId, modoNome, criar } = useRoute<Rt>().params;
  const [todos, setTodos] = useState<Modos>({});
  const [modo, setModo] = useState<Record<string, Valor>>({});
  const [ligados, setLigados] = useState<Set<string>>(new Set());   // toggles ON (separado do valor!)
  const [nome, setNome] = useState(criar ? '' : modoNome);
  const [carregando, setCarregando] = useState(true);
  // campos de TEXTO (string) não são editáveis aqui: o editor trata tudo como número e
  // zerava eles ao salvar. Guardo à parte e devolvo intactos no montarFinal.
  const [passthrough, setPassthrough] = useState<Record<string, unknown>>({});

  useEffect(() => {
    api.getModos(botId)
      .then((m) => {
        setTodos(m);
        const existente = m[modoNome] as Record<string, Valor> | undefined;
        // modo que ainda não foi salvo (o "padrão" virtual) usa o template completo — senão
        // a tela vinha VAZIA (Object.keys de um modo inexistente = [], sem campos pra configurar).
        const usarTemplate = criar || !existente;
        const campos = usarTemplate
          ? (CAMPOS_NOVO[botId] ?? Object.keys(Object.values(m)[0] ?? {}))
          : Object.keys(existente);
        const base: Record<string, Valor> = {};
        const on = new Set<string>();
        const passa: Record<string, unknown> = {};
        campos.filter((k) => !OCULTOS.has(k)).forEach((k) => {
          const orig = existente?.[k];
          // texto (ex: "alvo") não é editável aqui → preserva e não renderiza (senão zerava)
          if (!usarTemplate && typeof orig === 'string') { passa[k] = orig; return; }
          const meta = metaDe(k, orig);
          const v = usarTemplate ? zerado(meta.tipo) : (orig ?? zerado(meta.tipo));
          base[k] = v;
          if (temValor(meta.tipo, v)) on.add(k);   // já vem ligado se tinha valor
        });
        setModo(base);
        setLigados(on);
        setPassthrough(passa);
      })
      .catch(() => {})
      .finally(() => setCarregando(false));
  }, [botId, modoNome, criar]);

  const setCampo = (k: string, v: Valor) => setModo((prev) => ({ ...prev, [k]: v }));

  function alternar(k: string, tipo: Tipo, on: boolean) {
    if (tipo === 'bool') { setCampo(k, on); return; }
    setLigados((prev) => { const n = new Set(prev); on ? n.add(k) : n.delete(k); return n; });
    if (on && !temValor(tipo, modo[k])) setCampo(k, META[k]?.sug ?? (tipo === 'range' ? [1, 1] : 1));
  }

  // monta o modo final: campo ligado usa o valor; desligado vira 0 / [0,0]
  function montarFinal(): Record<string, Valor> {
    const out: Record<string, Valor> = {
      ...(OCULTOS_DEFAULT[botId] ?? {}), ...(passthrough as Record<string, Valor>),
    };
    Object.keys(modo).forEach((k) => {
      const tipo = metaDe(k, modo[k]).tipo;
      if (tipo === 'bool') out[k] = Boolean(modo[k]);
      else out[k] = ligados.has(k) ? modo[k] : zerado(tipo);
    });
    return out;
  }

  async function gravar(nomeFinal: string) {
    try {
      const proximos = { ...todos };
      // renomeou (editando e o nome mudou) → remove a chave antiga pra não duplicar
      if (!criar && nomeFinal !== modoNome) delete proximos[modoNome];
      proximos[nomeFinal] = montarFinal();
      await api.putModos(botId, proximos);
      Alert.alert('Salvo!', `Modo "${nomeFinal}" salvo.`);
      nav.goBack();
    } catch {
      Alert.alert('Ops', 'Não consegui salvar.');
    }
  }

  function salvar() {
    const n = nome.trim();
    if (!n) { Alert.alert('Falta o nome', 'Dê um nome pro modo (ex: turbo, seguro).'); return; }
    // colisão: nome já usado por OUTRO modo (criar, ou renomear pra cima de um existente)
    if (todos[n] && n !== modoNome) { Alert.alert('Já existe', `Já tem um modo "${n}".`); return; }
    gravar(n);
  }

  function apagar() {
    Alert.alert('Apagar modo', `Apagar o modo "${modoNome}"? Não dá pra desfazer.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Apagar', style: 'destructive', onPress: async () => {
        const resto = { ...todos }; delete resto[modoNome];
        try { await api.putModos(botId, resto); nav.goBack(); }
        catch { Alert.alert('Ops', 'Não consegui apagar.'); }
      } },
    ]);
  }

  if (carregando) return <TelaCarregando />;

  const porCat = CATS.map((c) => ({
    ...c,
    campos: Object.keys(modo).filter((k) => metaDe(k, modo[k]).cat === c.key),
  })).filter((c) => c.campos.length > 0);

  return (
    <TecladoView>
      <ScrollView style={styles.tela} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">

        <Animated.View entering={FadeInDown.duration(300)} layout={LinearTransition.duration(220)}>
          <Card style={{ gap: 8 }}>
            <Text style={styles.label}>Nome do modo</Text>
            <TextInput style={styles.input} placeholder="ex: turbo, seguro"
              placeholderTextColor={colors.textoFraco} value={nome} onChangeText={setNome} autoCapitalize="none" />
            <Text style={styles.dica}>
              {criar ? 'Tudo começa desligado. Ligue só o que quiser e ponha o valor.'
                     : 'Dá pra renomear aqui — é só mudar o nome e salvar.'}
            </Text>
          </Card>
        </Animated.View>

        {porCat.map((c, i) => (
          <Animated.View key={c.key} entering={FadeInDown.delay(60 + i * 50).duration(300)}
            layout={LinearTransition.duration(220)}>
            <Card style={{ gap: 4 }}>
              <Text style={styles.secaoTitulo}>{c.titulo}</Text>
              {c.campos.map((k) => {
                const meta = metaDe(k, modo[k]);
                const on = meta.tipo === 'bool' ? Boolean(modo[k]) : ligados.has(k);
                return (
                  <Campo key={k} meta={meta} valor={modo[k]} on={on}
                    onToggle={(v) => alternar(k, meta.tipo, v)} onChange={(v) => setCampo(k, v)} />
                );
              })}
            </Card>
          </Animated.View>
        ))}

        {criar ? (
          <Botao title="Criar modo" onPress={salvar} />
        ) : (
          <>
            <Botao title="Salvar modo" onPress={salvar} />
            <Botao title="Apagar modo" cor={colors.card2} txtCor={colors.erro} onPress={apagar} />
          </>
        )}
      </ScrollView>
    </TecladoView>
  );
}

function Campo({ meta, valor, on, onToggle, onChange }: {
  meta: MetaF; valor: Valor; on: boolean; onToggle: (on: boolean) => void; onChange: (v: Valor) => void;
}) {
  return (
    <Animated.View style={styles.campo} layout={LinearTransition.duration(220)}>
      <View style={styles.linhaTop}>
        <Text style={styles.campoLabel}>{meta.label}</Text>
        <Switch value={on} onValueChange={onToggle}
          trackColor={{ true: colors.marca, false: colors.border }} thumbColor="#fff" />
      </View>
      {meta.dica ? <Text style={styles.campoDica}>{meta.dica}</Text> : null}

      {meta.tipo === 'cap' && on && (
        <Animated.View entering={FadeInDown.duration(200)} exiting={FadeOutUp.duration(160)}>
          <TextInput style={styles.input} keyboardType="numeric" placeholder="0"
            placeholderTextColor={colors.textoFraco} value={txt(valor as number)}
            onChangeText={(t) => onChange(num(t))} />
        </Animated.View>
      )}
      {meta.tipo === 'range' && on && (
        <Animated.View entering={FadeInDown.duration(200)} exiting={FadeOutUp.duration(160)} style={styles.range}>
          <TextInput style={styles.inputNum} keyboardType="numeric" placeholder="0"
            placeholderTextColor={colors.textoFraco} value={txt((valor as number[])[0])}
            onChangeText={(t) => onChange([num(t), (valor as number[])[1]])} />
          <Text style={styles.ate}>até</Text>
          <TextInput style={styles.inputNum} keyboardType="numeric" placeholder="0"
            placeholderTextColor={colors.textoFraco} value={txt((valor as number[])[1])}
            onChangeText={(t) => onChange([(valor as number[])[0], num(t)])} />
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.bg },
  label: { color: colors.textoFraco, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  dica: { color: colors.textoFraco, fontSize: 12, lineHeight: 16 },
  nomeFixo: { color: colors.texto, fontSize: 18, fontWeight: '800' },
  secaoTitulo: { color: colors.texto, fontSize: 15, fontWeight: '800', marginBottom: 6 },
  campo: { paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  linhaTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  campoLabel: { color: colors.texto, fontSize: 14, flex: 1, paddingRight: 10 },
  campoDica: { color: colors.textoFraco, fontSize: 11, marginTop: 4, lineHeight: 15 },
  input: { backgroundColor: colors.card2, color: colors.texto, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: colors.border, marginTop: 8 },
  range: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  inputNum: { flex: 1, backgroundColor: colors.card2, color: colors.texto, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: colors.border, textAlign: 'center' },
  ate: { color: colors.textoFraco },
});
