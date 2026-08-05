import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { api, Account, Chat, RunInfo } from '@/lib/api';
import { cmpTexto } from '@/lib/ordenar';
import { garantirLA } from '@/lib/la';
import { colors } from '@/theme';
import { Aparece, Botao, Card, CartaoTocavel } from '@/ui/components';
import { TecladoView } from '@/ui/TecladoView';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rt = RouteProp<RootStackParamList, 'Bot'>;

export function BotScreen() {
  const nav = useNavigation<Nav>();
  const { botId, nome } = useRoute<Rt>().params;
  const [modos, setModos] = useState<string[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [modo, setModo] = useState<string | null>(null);   // nada pré-selecionado: a pessoa escolhe
  const [chat, setChat] = useState<string | null>(null);
  const [postInicial, setPostInicial] = useState('');      // like-repost: fronteira opcional (1ª vez)
  const [iniciando, setIniciando] = useState(false);
  const [runAtiva, setRunAtiva] = useState<RunInfo | null>(null);
  // ── lote (rodar em várias contas, uma atrás da outra) ──
  const [lote, setLote] = useState(false);
  const [contasAtivas, setContasAtivas] = useState<Account[] | null>(null);  // null = ainda não checou
  const [selec, setSelec] = useState<Set<string>>(new Set());
  const [verContas, setVerContas] = useState(false);

  const temChats = botId === 'auto-follow';
  const temPostInicial = botId === 'like-repost';
  const temLote = botId === 'like-repost';
  const precisaChat = temChats && chats.length === 0;

  // checagem leve (só as runs) — usada no polling pra atualizar o botão ao vivo
  const checarRun = useCallback(() => {
    api.listRuns().then((rs) => {
      const a = rs.find((r) => r.bot === botId && ['rodando', 'iniciando'].includes(r.status)
        && !(r.params as { import_cookies?: unknown })?.import_cookies) ?? null;
      setRunAtiva(a);
      if (!a) setIniciando(false);   // sem run ativa → destrava o botão (fim do spinner infinito)
    }).catch(() => {});
  }, [botId]);

  const carregar = useCallback(() => {
    api.getModos(botId).then((m) => setModos(Object.keys(m).sort(cmpTexto))).catch(() => {});
    checarRun();
    if (temChats) {
      api.getChats(botId).then((c) => {
        setChats(c);
        setChat((atual) => (atual && c.some((x) => x.nome === atual) ? atual : c[0]?.nome ?? null));
      }).catch(() => {});
    }
  }, [botId, temChats, checarRun]);

  useFocusEffect(useCallback(() => {
    setIniciando(false);   // voltou pra esta tela → não está mais "iniciando" (mata o spinner preso)
    carregar();
    const id = setInterval(checarRun, 2500);   // atualiza o "Já está rodando" ao vivo
    return () => clearInterval(id);
  }, [carregar, checarRun]));

  // carrega só as contas com SESSÃO ATIVA (valida via túnel) e já marca todas — é a lista do lote
  const carregarContasAtivas = useCallback(async () => {
    setVerContas(true);
    try {
      const r = await api.validarContas();
      const ativas = r.filter((a) => a.sessao_ok && a.id).sort((a, b) => cmpTexto(a.label, b.label));
      setContasAtivas(ativas);
      setSelec(new Set(ativas.map((a) => a.id as string)));   // default: todas marcadas
    } catch { setContasAtivas([]); } finally { setVerContas(false); }
  }, []);

  function toggleLote(v: boolean) {
    setLote(v);
    if (v && contasAtivas === null) carregarContasAtivas();
  }

  function toggleConta(id: string) {
    setSelec((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function rodar(dry: boolean) {
    if (runAtiva) return;
    if (!modo) {   // precisa de um modo selecionado — vale pro Rodar E pro dry-run
      Alert.alert('Escolha um modo',
        modos.length ? 'Toque num modo antes de rodar.' : 'Crie um modo pra poder rodar.');
      return;
    }
    if (lote) {
      const ids = [...selec];
      if (!ids.length) { Alert.alert('Escolha as contas', 'Marque ao menos uma conta pro lote.'); return; }
      iniciarLote(dry, ids);
      return;
    }
    iniciarRun(dry);
  }

  async function iniciarLote(dry: boolean, ids: string[]) {
    setIniciando(true);
    try {
      const params: Record<string, unknown> = { dry_run: dry, modo };
      if (temPostInicial && postInicial.trim()) params.start_from = postInicial.trim();
      const r = await api.runLote(botId, params, ids);
      garantirLA(nome);   // barra viva no lock screen (vale pro lote todo)
      if (r.run_id) {
        // abre a tela ao vivo da 1ª conta (mostra o processo, igual run normal). As próximas
        // contas seguem em sequência — dá pra ver cada uma na home ("Rodando agora").
        nav.navigate('Run', { runId: r.run_id, nome });
      } else {
        Alert.alert('Lote iniciado',
          `Rodando em ${r.total} conta${r.total !== 1 ? 's' : ''}, uma atrás da outra. Acompanha na home.`);
      }
    } catch (e) {
      if ((e as { response?: { status?: number } })?.response?.status === 409) {
        Alert.alert('Já está rodando', 'Esse bot já tem execução em andamento. Espera terminar.');
      } else if ((e as { response?: { status?: number } })?.response?.status === 400) {
        Alert.alert('Sem contas ativas', 'Nenhuma das contas escolhidas tem sessão viva. Atualiza a lista.');
      } else {
        Alert.alert('Ops', 'Não consegui iniciar o lote.');
      }
    } finally { setIniciando(false); }
  }

  async function iniciarRun(dry: boolean) {
    setIniciando(true);
    try {
      const params: Record<string, unknown> = { dry_run: dry, modo };
      if (temChats && chat) params.chat = chat;
      if (temPostInicial && postInicial.trim()) params.start_from = postInicial.trim();
      const run = await api.startRun(botId, params);
      setRunAtiva(run);                       // trava o botão na hora
      // barra viva no lock screen (no-op no Expo Go). Vale também no dry-run: o dry agora é
      // uma simulação FIEL (mesma navegação), então dá pra testar a LA sem seguir/mandar DM.
      garantirLA(nome);
      nav.navigate('Run', { runId: run.id, nome });
    } catch (e) {
      setIniciando(false);
      carregar();   // atualiza o estado (pode já ter começado a rodar)
      if ((e as { response?: { status?: number } })?.response?.status === 409) {
        Alert.alert('Já está rodando', 'Esse bot já tem uma execução em andamento. Abre ela pra acompanhar.');
      }
    }
  }

  return (
    <TecladoView>
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, gap: 16 }}
      keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <Aparece>
      <Card>
        <Text style={styles.label}>Modo</Text>
        {modos.length > 0 ? (
          <>
          <View style={styles.chips}>
            {modos.map((m) => (
              <TouchableOpacity key={m} onPress={() => setModo(m)} style={[styles.chip, modo === m && styles.chipOn]}>
                <Text style={[styles.chipTxt, modo === m && styles.chipTxtOn]}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.linksRow}>
            {modo ? (
              <TouchableOpacity onPress={() => nav.navigate('EditModo', { botId, modoNome: modo })} style={styles.link}>
                <Ionicons name="create-outline" size={15} color={colors.marca} />
                <Text style={styles.linkTxt}>Editar "{modo}"</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity onPress={() => nav.navigate('EditModo', { botId, modoNome: '', criar: true })} style={styles.link}>
              <Ionicons name="add-circle-outline" size={16} color={colors.marca} />
              <Text style={styles.linkTxt}>Novo modo</Text>
            </TouchableOpacity>
          </View>
          </>
        ) : (
          <>
          <Text style={{ color: colors.textoFraco, fontSize: 12, lineHeight: 16 }}>
            Nenhum modo ainda — crie um (começa tudo zerado, você liga só o que quiser).
          </Text>
          <View style={styles.linksRow}>
            <TouchableOpacity onPress={() => nav.navigate('EditModo', { botId, modoNome: '', criar: true })} style={styles.link}>
              <Ionicons name="add-circle-outline" size={16} color={colors.marca} />
              <Text style={styles.linkTxt}>Criar modo</Text>
            </TouchableOpacity>
          </View>
          </>
        )}
      </Card>
      </Aparece>
      {temLote && (
        <Aparece delay={70}>
        <Card>
          <View style={styles.loteHead}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.label}>Rodar em lote</Text>
              <Text style={styles.loteDica}>
                Roda em várias contas, uma atrás da outra. Lista só as com sessão ativa.
              </Text>
            </View>
            <Switch value={lote} onValueChange={toggleLote}
              trackColor={{ true: colors.marca, false: colors.border }} thumbColor="#fff" />
          </View>
          {lote && (
            <View style={{ marginTop: 12 }}>
              <View style={styles.loteSub}>
                <Text style={styles.loteSubTxt}>
                  {verContas ? 'verificando sessões…'
                    : `${selec.size}/${(contasAtivas ?? []).length} selecionadas`}
                </Text>
                <TouchableOpacity onPress={carregarContasAtivas} disabled={verContas}
                  hitSlop={8} style={styles.linkInline}>
                  <Ionicons name="sync" size={14} color={verContas ? colors.textoFraco : colors.marca} />
                  <Text style={styles.linkTxt}>atualizar</Text>
                </TouchableOpacity>
              </View>
              {(contasAtivas ?? []).map((c) => {
                const on = !!c.id && selec.has(c.id);
                return (
                  <TouchableOpacity key={c.id} activeOpacity={0.7} style={styles.contaRow}
                    onPress={() => toggleConta(c.id as string)}>
                    <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20}
                      color={on ? colors.marca : colors.textoFraco} />
                    <Text style={styles.contaRowTxt} numberOfLines={1}>@{c.label}</Text>
                    {c.ativa ? <Text style={styles.contaTag}>ativa</Text> : null}
                  </TouchableOpacity>
                );
              })}
              {contasAtivas !== null && contasAtivas.length === 0 && !verContas && (
                <Text style={styles.loteDica}>
                  Nenhuma conta com sessão ativa agora. Conecta/reconecta na home e atualiza.
                </Text>
              )}
            </View>
          )}
        </Card>
        </Aparece>
      )}
      {temPostInicial && (
        <Aparece delay={80}>
        <Card>
          <Text style={styles.label}>Post inicial (opcional)</Text>
          <TextInput style={styles.input} value={postInicial} onChangeText={setPostInicial}
            autoCapitalize="none" autoCorrect={false} placeholderTextColor={colors.textoFraco}
            placeholder="link do post ou código (ex: DABC123xyz)" />
          <Text style={styles.aviso}>
            Só na 1ª vez, pra marcar de onde começar (ex: o 1º post do drop). Em branco, ele
            pega os posts mais recentes do modo. Depois disso ele continua sozinho, do último
            que parou pra frente.
          </Text>
        </Card>
        </Aparece>
      )}
      {temChats && (
        <Aparece delay={80}>
        <Card>
          <Text style={styles.label}>Chat</Text>
          {chats.length > 0 ? (
            <View style={styles.chips}>
              {chats.map((c) => (
                <TouchableOpacity key={c.thread_id} onPress={() => setChat(c.nome)}
                  style={[styles.chip, chat === c.nome && styles.chipOn]}>
                  <Text style={[styles.chipTxt, chat === c.nome && styles.chipTxtOn]}>{c.nome}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <Text style={styles.aviso}>
              Nenhum chat configurado ainda. Adicione o grupo (ou a @pessoa) que o bot vai
              varrer antes de rodar.
            </Text>
          )}
          <TouchableOpacity onPress={() => nav.navigate('Chats', { botId })} style={styles.link}>
            <Ionicons name="add-circle-outline" size={16} color={colors.marca} />
            <Text style={styles.linkTxt}>Gerenciar chats</Text>
          </TouchableOpacity>
        </Card>
        </Aparece>
      )}
      <View style={{ gap: 10 }}>
        {precisaChat ? (
          <Botao title="Configurar um chat primeiro" onPress={() => nav.navigate('Chats', { botId })} />
        ) : runAtiva ? (
          <>
            <Botao title="Já está rodando" disabled onPress={() => {}} />
            <Botao title="Ver execução" cor={colors.card2} txtCor={colors.texto}
              onPress={() => nav.navigate('Run', { runId: runAtiva.id, nome })} />
          </>
        ) : (
          <>
            <Botao title={lote ? 'Rodar lote' : 'Rodar'} onPress={() => rodar(false)} loading={iniciando} />
            <Botao title={lote ? 'Simular lote' : 'Simular (dry-run)'} cor={colors.card2} txtCor={colors.texto}
              onPress={() => rodar(true)} disabled={iniciando} />
          </>
        )}
      </View>
    </ScrollView>
    </TecladoView>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.textoFraco, fontSize: 12, fontWeight: '700', marginBottom: 10, textTransform: 'uppercase' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  chipOn: { backgroundColor: colors.laranja, borderColor: colors.laranja },
  chipTxt: { color: colors.texto },
  chipTxtOn: { color: '#0F0F0F', fontWeight: '700' },
  linksRow: { flexDirection: 'row', gap: 18 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 12 },
  linkInline: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  linkTxt: { color: colors.marca, fontWeight: '600', fontSize: 14 },
  aviso: { color: colors.textoFraco, fontSize: 13, lineHeight: 19, marginTop: 8 },
  input: { backgroundColor: colors.card2, color: colors.texto, borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: colors.border },
  // lote
  loteHead: { flexDirection: 'row', alignItems: 'center' },
  loteDica: { color: colors.textoFraco, fontSize: 12, lineHeight: 16, marginTop: 4 },
  loteSub: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 4 },
  loteSubTxt: { color: colors.textoFraco, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  contaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  contaRowTxt: { color: colors.texto, fontSize: 14, fontWeight: '600', flex: 1 },
  contaTag: { color: colors.ok, fontSize: 11, fontWeight: '700' },
});
