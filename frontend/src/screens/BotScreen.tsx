import React, { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { api, Account, Chat, RunInfo, RunHistorico } from '@/lib/api';
import { cmpTexto } from '@/lib/ordenar';
import { bucketData, fmtHora } from '@/lib/datas';
import { garantirLA } from '@/lib/la';
import { colors } from '@/theme';
import { Aparece, Botao, Card, CartaoTocavel } from '@/ui/components';
import { SeletorConta } from '@/ui/SeletorConta';
import { TecladoView } from '@/ui/TecladoView';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rt = RouteProp<RootStackParamList, 'Bot'>;

// cor do pontinho de resultado da run (verde ok / vermelho erro-bloqueio / cinza parado)
function corRun(r: RunHistorico): string {
  if (r.bloqueio || r.status === 'erro') return colors.erro;
  if (r.status === 'parado') return colors.textoFraco;
  return colors.ok;
}

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
  // conta ativa (a que o run normal usa) + popup pra trocar
  const [contaAtiva, setContaAtiva] = useState<Account | null>(null);
  const [abrirSeletor, setAbrirSeletor] = useState(false);
  // últimas runs DESTE bot (contas que rodaram), agrupadas por dia
  const [historico, setHistorico] = useState<RunHistorico[] | null>(null);
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

  // conta ativa (leve, só o índice — não valida sessão aqui pra não bater no IG a cada foco)
  const carregarContaAtiva = useCallback(() => {
    api.getAccounts().then((cs) => setContaAtiva(cs.find((c) => c.ativa) ?? null)).catch(() => {});
  }, []);

  const carregar = useCallback(() => {
    api.getModos(botId).then((m) => setModos(Object.keys(m).sort(cmpTexto))).catch(() => {});
    checarRun();
    carregarContaAtiva();
    // últimas runs deste bot (pra listinha "últimas contas que rodaram")
    api.getHistorico(botId).then(setHistorico).catch(() => setHistorico([]));
    if (temChats) {
      api.getChats(botId).then((c) => {
        setChats(c);
        setChat((atual) => (atual && c.some((x) => x.nome === atual) ? atual : c[0]?.nome ?? null));
      }).catch(() => {});
    }
  }, [botId, temChats, checarRun, carregarContaAtiva]);

  useFocusEffect(useCallback(() => {
    setIniciando(false);   // voltou pra esta tela → não está mais "iniciando" (mata o spinner preso)
    carregar();
    const id = setInterval(checarRun, 2500);   // atualiza o "Já está rodando" ao vivo
    return () => clearInterval(id);
  }, [carregar, checarRun]));

  // 10 últimas runs DESTE bot, mais novas primeiro, com cabeçalhos de data (igual o Histórico).
  // Ignora run-FANTASMA: a que nem chegou a rodar (sem conta E sem saldo) — ex: DM que caiu
  // logo no início por sem sessão / túnel congestionado. Ficavam como linha vazia "conta ?".
  const ultimasComData = useMemo<(RunHistorico | { _header: string })[]>(() => {
    if (!historico?.length) return [];
    const ord = [...historico]
      .filter((r) => !!r.conta || Object.keys(r.saldo || {}).length > 0)
      .sort((a, b) => (b.ended_at ?? b.started_at ?? 0) - (a.ended_at ?? a.started_at ?? 0))
      .slice(0, 10);
    const out: (RunHistorico | { _header: string })[] = [];
    let atual: string | null = null;
    for (const r of ord) {
      const b = bucketData(r.ended_at ?? r.started_at);
      if (b !== atual) { out.push({ _header: b }); atual = b; }
      out.push(r);
    }
    return out;
  }, [historico]);

  // carrega só as contas com SESSÃO ATIVA (valida via túnel) e já marca todas — é a lista do lote
  const carregarContasAtivas = useCallback(async () => {
    setVerContas(true);
    try {
      // BASE: contas cadastradas (rápido e confiável) — a lista nunca esvazia à toa.
      const base = (await api.getAccounts()).filter((a) => a.id);
      // OVERLAY: sessão viva é best-effort. A checagem bate no IG conta por conta pelo túnel
      // único e, sob congestão, pode voltar tudo falso — nesse caso NÃO zeramos a lista;
      // a sessão fica "?" e o worker pula conta morta na hora de rodar.
      const sess: Record<string, boolean> = {};
      try {
        for (const a of await api.validarContas()) if (a.id) sess[a.id] = !!a.sessao_ok;
      } catch { /* checagem falhou — mantém a lista */ }
      const lista = base
        .map((a) => ({ ...a, sessao_ok: a.id! in sess ? sess[a.id!] : undefined }))
        .sort((a, b) => cmpTexto(a.label, b.label));
      setContasAtivas(lista);
      // conta SEM sessão viva não entra no lote — pré-seleciona só as vivas (sessao_ok === true).
      const vivas = lista.filter((a) => a.sessao_ok === true);
      setSelec(new Set(vivas.map((a) => a.id as string)));
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
        <View style={styles.contaAtivaRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Conta</Text>
            {contaAtiva ? (
              <Text style={styles.contaAtivaNome} numberOfLines={1}>@{contaAtiva.label}</Text>
            ) : (
              <Text style={styles.contaAtivaVazia}>nenhuma conta ativa</Text>
            )}
          </View>
          <TouchableOpacity onPress={() => setAbrirSeletor(true)} style={styles.trocarBtn} hitSlop={8}>
            <Ionicons name="swap-horizontal" size={16} color={colors.marca} />
            <Text style={styles.linkTxt}>trocar</Text>
          </TouchableOpacity>
        </View>
      </Card>
      </Aparece>
      <Aparece delay={40}>
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
                Roda em várias contas, uma atrás da outra. As com sessão caída ficam sinalizadas (o worker pula elas).
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
                const viva = c.sessao_ok === true;       // só quem tem sessão viva entra no lote
                const on = viva && !!c.id && selec.has(c.id);
                const morta = c.sessao_ok === false;     // checou e a sessão caiu
                return (
                  <TouchableOpacity key={c.id} activeOpacity={viva ? 0.7 : 1}
                    style={[styles.contaRow, !viva && styles.contaRowOff]}
                    disabled={!viva}
                    onPress={() => viva && toggleConta(c.id as string)}>
                    <Ionicons name={!viva ? 'lock-closed' : (on ? 'checkbox' : 'square-outline')}
                      size={20} color={on ? colors.marca : colors.textoFraco} />
                    <Text style={[styles.contaRowTxt, !viva && { color: colors.textoFraco }]}
                      numberOfLines={1}>@{c.label}</Text>
                    {c.ativa ? <Text style={styles.contaTag}>ativa</Text> : null}
                    {morta ? <Text style={[styles.contaTag, { color: colors.erro }]}>sessão caiu</Text> : null}
                    {c.sessao_ok === undefined ? <Text style={styles.contaTag}>sem sessão</Text> : null}
                  </TouchableOpacity>
                );
              })}
              {contasAtivas !== null && contasAtivas.length === 0 && !verContas && (
                <Text style={styles.loteDica}>
                  Nenhuma conta cadastrada. Conecta uma na home primeiro.
                </Text>
              )}
              {contasAtivas !== null && contasAtivas.length > 0 && !verContas
                && !contasAtivas.some((a) => a.sessao_ok === true) && (
                <Text style={styles.loteDica}>
                  Nenhuma conta com sessão viva agora — reconecta na home ou toca em atualizar.
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
            <Botao title={lote ? 'Rodar lote' : (contaAtiva ? `Rodar com @${contaAtiva.label}` : 'Rodar')}
              onPress={() => rodar(false)} loading={iniciando} />
            <Botao title={lote ? 'Simular lote' : 'Simular (dry-run)'} cor={colors.card2} txtCor={colors.texto}
              onPress={() => rodar(true)} disabled={iniciando} />
          </>
        )}
      </View>
      {historico && (
        <Aparece delay={120}>
        <Card style={{ gap: 4 }}>
          <Text style={styles.label}>Últimas runs</Text>
          {ultimasComData.length === 0 ? (
            <Text style={styles.runVazio}>Esse bot ainda não rodou.</Text>
          ) : ultimasComData.map((item, i) => {
            if ('_header' in item) {
              return <Text key={`h:${item._header}:${i}`} style={styles.runDataHeader}>{item._header}</Text>;
            }
            const r = item;
            return (
              <TouchableOpacity key={r.id} activeOpacity={0.7} disabled={r.backfill}
                onPress={() => nav.navigate('Run', { runId: r.id, nome })} style={styles.runLinha}>
                <View style={[styles.runDot, { backgroundColor: corRun(r) }]} />
                <Ionicons name="person-circle-outline" size={14} color={colors.marca} />
                <Text style={styles.runConta} numberOfLines={1}>
                  {r.conta ? `@${r.conta}` : 'conta ?'}{r.dry_run ? '  ·  simulação' : ''}
                </Text>
                <Text style={styles.runHora}>{fmtHora(r.ended_at ?? r.started_at)}</Text>
                {!r.backfill && <Ionicons name="chevron-forward" size={14} color={colors.textoFraco} />}
              </TouchableOpacity>
            );
          })}
        </Card>
        </Aparece>
      )}
      <SeletorConta visible={abrirSeletor} onClose={() => setAbrirSeletor(false)}
        onTrocou={carregarContaAtiva} />
    </ScrollView>
    </TecladoView>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.textoFraco, fontSize: 12, fontWeight: '700', marginBottom: 10, textTransform: 'uppercase' },
  contaAtivaRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  contaAtivaNome: { color: colors.texto, fontSize: 17, fontWeight: '800' },
  contaAtivaVazia: { color: colors.textoFraco, fontSize: 14, fontStyle: 'italic' },
  trocarBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  // últimas runs (listinha por dia)
  runVazio: { color: colors.textoFraco, fontSize: 13, paddingVertical: 4 },
  runDataHeader: { color: colors.textoFraco, fontSize: 11, fontWeight: '800', textTransform: 'uppercase',
    letterSpacing: 0.5, marginTop: 10, marginBottom: 2 },
  runLinha: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  runDot: { width: 8, height: 8, borderRadius: 999 },
  runConta: { color: colors.texto, fontSize: 14, fontWeight: '600', flex: 1 },
  runHora: { color: colors.textoFraco, fontSize: 12, fontVariant: ['tabular-nums'] },
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
  contaRowOff: { opacity: 0.5 },   // conta sem sessão viva: travada, não dá pra marcar no lote
  contaRowTxt: { color: colors.texto, fontSize: 14, fontWeight: '600', flex: 1 },
  contaTag: { color: colors.ok, fontSize: 11, fontWeight: '700' },
});
