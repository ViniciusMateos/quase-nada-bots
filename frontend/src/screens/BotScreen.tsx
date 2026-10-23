import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { api, Account, Chat, Grupo, RunInfo, RunHistorico, locaisDe } from '@/lib/api';
import { cmpTexto } from '@/lib/ordenar';
import { bucketData, fmtHora } from '@/lib/datas';
import { garantirLA } from '@/lib/la';
import { colors } from '@/theme';
import { Aparece, Botao, Card, CartaoTocavel } from '@/ui/components';
import { SeletorConta } from '@/ui/SeletorConta';
import { SeletorContas } from '@/ui/SeletorContas';
import { MenuContexto } from '@/ui/MenuContexto';
import { TecladoView } from '@/ui/TecladoView';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rt = RouteProp<RootStackParamList, 'Bot'>;

// cor do pontinho de resultado da run (verde ok / vermelho erro-bloqueio / cinza parado)
// conta da loja: no Story Repost ela roda no emulador próprio dela e tem um campo só dela na tela
const CONTA_BRECHO = 'brechoquasenadaa';

// ordem padrão do lote: tudo marcado, da menor pra maior (segue2 antes de segue10); no Story, o
// brechó entra no fim
function ordemPadrao(contas: string[], comBrecho: boolean): string[] {
  return comBrecho ? [...contas, CONTA_BRECHO] : [...contas];
}

// Em qual emulador cada conta do Story roda: o brechó tem a instância própria; as outras dividem a
// das segue. Runs em emuladores DIFERENTES rodam ao mesmo tempo (mesma regra do backend).
type Emu = 'brecho' | 'principal';
function emuladoresDe(contas: string[]): Set<Emu> {
  if (!contas.length) return new Set<Emu>(['brecho']);   // story sem lista = só o brechó
  return new Set<Emu>(contas.map((c) => (c.toLowerCase() === CONTA_BRECHO ? 'brecho' : 'principal')));
}
function contasDaRun(r: RunInfo): string[] {
  const p = (r.params ?? {}) as { lote_contas?: unknown[]; contas?: unknown[] };
  return (p.lote_contas ?? p.contas ?? [])
    .map((c) => (typeof c === 'string' ? c : String((c as { label?: string; id?: string })?.label
      ?? (c as { id?: string })?.id ?? '')))
    .map((c) => c.replace(/^@/, '').trim().toLowerCase())
    .filter(Boolean);
}
function cruza(a: Set<Emu>, b: Set<Emu>): boolean {
  for (const x of a) if (b.has(x)) return true;
  return false;
}

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
  // menu de long-press no pill do modo (editar / duplicar / excluir) — mesmo esqueleto do brechó
  const [menuModo, setMenuModo] = useState<{ x: number; y: number; nome: string } | null>(null);
  const [chat, setChat] = useState<string | null>(null);
  const [postInicial, setPostInicial] = useState('');      // like-repost: fronteira opcional (1ª vez)
  const [iniciando, setIniciando] = useState(false);
  const [runAtiva, setRunAtiva] = useState<RunInfo | null>(null);
  // TODAS as runs ativas deste bot (o Story pode ter duas: brechó + segue, cada uma no seu emulador)
  const [runsAtivas, setRunsAtivas] = useState<RunInfo[]>([]);
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
  // grupos: tocar num grupo marca SÓ as contas dele (com sessão viva); dá pra ajustar conta a conta
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [grupoSel, setGrupoSel] = useState<string | null>(null);
  // ── pool vitrine (emulador / story-repost): lista de USERNAMES (não ids do accounts.json) ──
  const [vitrineContas, setVitrineContas] = useState<string[] | null>(null);
  // ORDEM de execução do lote (a ordem em que as contas foram marcadas — carrossel do IG)
  const [ordem, setOrdem] = useState<string[]>([]);
  const [verVitrine, setVerVitrine] = useState(false);

  const temChats = botId === 'auto-follow';
  const temPostInicial = botId === 'like-repost';
  const temLote = botId === 'like-repost' || botId === 'story-repost';   // lote por COOKIE (accounts.json)
  // Bots do EMULADOR: lote pelas contas logadas no device (por username), uma de cada vez, numa run
  // só, na ORDEM da seleção (20/10/2026: todos os bots com a mesma estrutura).
  const ehVitrine = botId === 'auto-follow' || botId === 'dm-followers' || botId === 'story-brecho';
  // Story Repost: além das segue, a conta do BRECHÓ (roda no emulador próprio dela) entra na mesma ordem
  const ehStoryBrecho = botId === 'story-brecho';
  const fonteVitrine: 'emulador' | 'story' = 'emulador';
  const precisaChat = temChats && chats.length === 0;

  // checagem leve (só as runs) — usada no polling pra atualizar o botão ao vivo
  const checarRun = useCallback(() => {
    api.listRuns().then((rs) => {
      const ativas = rs.filter((r) => r.bot === botId && ['rodando', 'iniciando'].includes(r.status)
        && !(r.params as { import_cookies?: unknown })?.import_cookies);
      const a = ativas[0] ?? null;
      setRunAtiva(a);
      setRunsAtivas(ativas);
      if (!a) setIniciando(false);   // sem run ativa → destrava o botão (fim do spinner infinito)
    }).catch(() => {});
  }, [botId]);

  // conta ativa (leve, só o índice — não valida sessão aqui pra não bater no IG a cada foco)
  const carregarContaAtiva = useCallback(() => {
    api.getAccounts().then((cs) => setContaAtiva(cs.find((c) => c.ativa) ?? null)).catch(() => {});
  }, []);

  // pool VITRINE conforme o bot: emulador → contas logadas no device (/emulador/status);
  // story-repost → contas do server (/story/contas). Pré-seleciona todas. (story bate no IG,
  // por isso só força no "atualizar".)
  // marca se o pool já veio POPULADO — o auto-refresh (poll) só re-busca enquanto estiver VAZIO,
  // pra parar de resetar a seleção depois que as contas aparecem.
  const vitrineCheioRef = useRef(false);
  const carregarVitrine = useCallback(async (force = false) => {
    setVerVitrine(true);
    try {
      let us: string[] = [];
      if (fonteVitrine === 'emulador') {
        us = (await api.emuladorStatus()).contas_logadas ?? [];
        // só as contas marcadas pro EMULADOR (locais); conta que o app ainda não conhece fica
        const cs = await api.getAccounts().catch(() => null);
        if (cs) {
          const porLabel = new Map(cs.map((a) => [(a.label || '').toLowerCase(), a]));
          us = us.filter((u) => { const a = porLabel.get(u.toLowerCase()); return !a || locaisDe(a).includes('emulador'); });
        }
      }
      else us = (await api.storyContas(force)).map((c) => c.username);
      us = [...new Set(us)].filter((u) => u.toLowerCase() !== CONTA_BRECHO).sort(cmpTexto);
      vitrineCheioRef.current = us.length > 0;
      setVitrineContas(us);
      let padrao = ordemPadrao(us, ehStoryBrecho);   // padrão: tudo marcado, da menor pra maior
      if (ehStoryBrecho) {
        // Story já rodando num emulador → o padrão marca só as contas do OUTRO (ex: o brechó está
        // postando → volta com as segue marcadas, prontas pra rodar junto com outro modo)
        const rs = await api.listRuns().catch(() => [] as RunInfo[]);
        const ocup = new Set<Emu>();
        rs.filter((r) => r.bot === botId && ['rodando', 'iniciando'].includes(r.status))
          .forEach((r) => emuladoresDe(contasDaRun(r)).forEach((e) => ocup.add(e)));
        const livres = padrao.filter((u) => !ocup.has(u === CONTA_BRECHO ? 'brecho' : 'principal'));
        if (ocup.size && livres.length) padrao = livres;
      }
      setOrdem(padrao);
    } catch { setVitrineContas([]); vitrineCheioRef.current = false; } finally { setVerVitrine(false); }
  }, [fonteVitrine, ehStoryBrecho, botId]);

  const carregar = useCallback(() => {
    api.getModos(botId).then((m) => setModos(Object.keys(m).sort(cmpTexto))).catch(() => {});
    checarRun();
    if (ehVitrine) carregarVitrine(); else carregarContaAtiva();
    // últimas runs deste bot (pra listinha "últimas contas que rodaram")
    api.getHistorico(botId).then(setHistorico).catch(() => setHistorico([]));
    if (temChats) {
      api.getChats(botId).then((c) => {
        setChats(c);
        setChat((atual) => (atual && c.some((x) => x.nome === atual) ? atual : c[0]?.nome ?? null));
      }).catch(() => {});
    }
  }, [botId, temChats, ehVitrine, checarRun, carregarContaAtiva, carregarVitrine]);

  useFocusEffect(useCallback(() => {
    setIniciando(false);   // voltou pra esta tela → não está mais "iniciando" (mata o spinner preso)
    vitrineCheioRef.current = false;   // ao abrir, deixa o poll re-buscar até popular
    carregar();
    const id = setInterval(checarRun, 2500);   // atualiza o "Já está rodando" ao vivo
    // VITRINE (ex: auto-follow no emulador): as contas logadas podem demorar a aparecer (o agente
    // navega pro perfil/seletor). Enquanto a lista está VAZIA, re-busca sozinho a cada 5s — assim
    // elas surgem sem você tocar "atualizar". Para de re-buscar quando popula (não reseta seleção).
    const idv = ehVitrine ? setInterval(() => { if (!vitrineCheioRef.current) carregarVitrine(); }, 5000) : null;
    return () => { clearInterval(id); if (idv) clearInterval(idv); };
  }, [carregar, checarRun, ehVitrine, carregarVitrine]));

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
      // só as contas marcadas pro SERVIDOR (locais) — as do emulador rodam pela aba dele
      const base = (await api.getAccounts()).filter((a) => a.id && locaisDe(a).includes('servidor'));
      // OVERLAY: sessão viva é best-effort. A checagem bate no IG conta por conta pelo túnel
      // único e, sob congestão, pode voltar tudo falso — nesse caso NÃO zeramos a lista;
      // a sessão fica "?" e o worker pula conta morta na hora de rodar.
      const sess: Record<string, boolean> = {};
      try {
        for (const a of await api.validarContas(true)) if (a.id) sess[a.id] = !!a.sessao_ok;   // lote: check fresco
      } catch { /* checagem falhou — mantém a lista */ }
      const lista = base
        .map((a) => ({ ...a, sessao_ok: a.id! in sess ? sess[a.id!] : undefined }))
        .sort((a, b) => cmpTexto(a.label, b.label));
      setContasAtivas(lista);
      const gs = await api.getGrupos().catch(() => [] as Grupo[]);
      setGrupos(gs);
      // conta SEM sessão viva não entra no lote — pré-seleciona só as vivas (sessao_ok === true);
      // com um grupo escolhido, só as vivas DO GRUPO.
      const g = grupoSel ? gs.find((x) => x.nome === grupoSel) : null;
      const vivas = lista.filter((a) => a.sessao_ok === true && (!g || g.contas.includes(a.id as string)));
      setSelec(new Set(vivas.map((a) => a.id as string)));
    } catch { setContasAtivas([]); } finally { setVerContas(false); }
  }, [grupoSel]);

  function toggleLote(v: boolean) {
    setLote(v);
    if (v && contasAtivas === null) carregarContasAtivas();
  }

  function toggleConta(id: string) {
    setSelec((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }


  // escolhe um grupo (ou "todas" = null): marca só as contas vivas dele
  function escolherGrupo(nome: string | null) {
    setGrupoSel(nome);
    const g = nome ? grupos.find((x) => x.nome === nome) : null;
    const vivas = (contasAtivas ?? []).filter((a) => a.sessao_ok === true
      && (!g || g.contas.includes(a.id as string)));
    setSelec(new Set(vivas.map((a) => a.id as string)));
  }

  // o que impede de rodar agora: nos outros bots, qualquer run ativa; no Story, só uma run no MESMO
  // emulador da seleção (brechó e segue rodam juntos)
  const emusSel = emuladoresDe(ordem);
  const bloqueio: RunInfo | null = ehStoryBrecho
    ? (runsAtivas.find((r) => cruza(emuladoresDe(contasDaRun(r)), emusSel)) ?? null)
    : runAtiva;
  const rodandoAoLado = ehStoryBrecho && !bloqueio ? runsAtivas : [];

  function rodar(dry: boolean) {
    if (bloqueio) return;
    if (!modo) {   // precisa de um modo selecionado — vale pro Rodar E pro dry-run
      Alert.alert('Escolha um modo',
        modos.length ? 'Toque num modo antes de rodar.' : 'Crie um modo pra poder rodar.');
      return;
    }
    if (ehVitrine) {   // emulador: roda por username, uma de cada vez, NA ORDEM da seleção (run-lote)
      const us = [...ordem];
      if (!us.length) { Alert.alert('Escolha as contas', 'Marque ao menos uma conta pra rodar.'); return; }
      iniciarLote(dry, us);
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
      if (temChats && chat) params.chat = chat;   // auto-follow (vitrine) precisa do chat no lote
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
        Alert.alert('Já está rodando', ehStoryBrecho
          ? 'Já tem story rodando nesse emulador. Espera terminar, ou rode as contas do outro emulador (brechó / segue).'
          : 'Esse bot já tem execução em andamento. Espera terminar.');
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

  // ── modos: editar / duplicar / excluir (menu de long-press no pill) ──
  // nome único pra cópia: "padrão fifa" → "padrão fifa 2", "padrão fifa 3"…
  function nomeCopia(base: string, existentes: Record<string, unknown>): string {
    let i = 2;
    let n = `${base} ${i}`;
    while (existentes[n]) { i += 1; n = `${base} ${i}`; }
    return n;
  }

  async function duplicarModo(nomeBase: string) {
    setMenuModo(null);
    try {
      const todos = await api.getModos(botId);
      const base = todos[nomeBase];
      if (!base) { Alert.alert('Ops', 'Não achei esse modo pra duplicar.'); return; }
      const novo = nomeCopia(nomeBase, todos);
      todos[novo] = JSON.parse(JSON.stringify(base));   // cópia profunda do config
      await api.putModos(botId, todos);
      setModos(Object.keys(todos).sort(cmpTexto));
      setModo(novo);                                     // já deixa a cópia selecionada
      // abre a cópia pra ajustar (renomear / baixar o cap de follow) — o "ficar mais fácil" que ele pediu
      nav.navigate('EditModo', { botId, modoNome: novo });
    } catch {
      Alert.alert('Ops', 'Não consegui duplicar o modo.');
    }
  }

  function excluirModo(nomeAlvo: string) {
    setMenuModo(null);
    Alert.alert('Apagar modo', `Apagar o modo "${nomeAlvo}"? Não dá pra desfazer.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Apagar', style: 'destructive', onPress: async () => {
        try {
          const todos = await api.getModos(botId);
          delete todos[nomeAlvo];
          await api.putModos(botId, todos);
          setModos(Object.keys(todos).sort(cmpTexto));
          if (modo === nomeAlvo) setModo(null);   // era o selecionado → limpa a seleção
        } catch { Alert.alert('Ops', 'Não consegui apagar.'); }
      } },
    ]);
  }

  return (
    <TecladoView>
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, gap: 16 }}
      keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      {ehVitrine ? (
      <Aparece>
      <Card>
        <View style={styles.loteHead}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.label}>Contas</Text>
            <Text style={styles.loteDica}>Roda uma de cada vez (o app troca de conta sozinho).</Text>
          </View>
          <TouchableOpacity onPress={() => carregarVitrine(true)} disabled={verVitrine} hitSlop={8} style={styles.linkInline}>
            <Ionicons name="sync" size={14} color={verVitrine ? colors.textoFraco : colors.marca} />
            <Text style={styles.linkTxt}>atualizar</Text>
          </TouchableOpacity>
        </View>
        <View style={{ marginTop: 12 }}>
          <View style={styles.selecaoHead}>
            <Text style={styles.loteSubTxt}>
              {verVitrine ? 'carregando…'
                : `${ordem.filter((u) => (vitrineContas ?? []).includes(u)).length}/${(vitrineContas ?? []).length} selecionadas`}
            </Text>
            <View style={styles.selecaoAcoes}>
              <TouchableOpacity hitSlop={8} onPress={() => setOrdem([])}>
                <Text style={styles.linkTxt}>limpar</Text>
              </TouchableOpacity>
              <TouchableOpacity hitSlop={8} onPress={() => setOrdem((atual) => {
                // "todas" COMPLETA a seleção: as já marcadas mantêm a vez (e o número); as que faltam
                // entram depois, da menor pra maior
                const padrao = ordemPadrao(vitrineContas ?? [], ehStoryBrecho);
                const ja = atual.filter((u) => padrao.includes(u));
                return [...ja, ...padrao.filter((u) => !ja.includes(u))];
              })}>
                <Text style={styles.linkTxt}>todas</Text>
              </TouchableOpacity>
            </View>
          </View>
          <Text style={styles.loteDica}>O número é a vez de cada conta — segue a ordem em que você marca.</Text>
          <SeletorContas contas={vitrineContas ?? []} ordem={ordem} onChange={setOrdem} />
          {vitrineContas !== null && vitrineContas.length === 0 && !verVitrine && (
            <Text style={styles.loteDica}>
              Nenhuma conta logada ainda. Adicione em Contas e toque em "verificar" — o agente loga sozinho.
            </Text>
          )}
        </View>
      </Card>
      </Aparece>
      ) : null}
      {ehStoryBrecho ? (
      <Aparece delay={20}>
      <Card>
        <Text style={styles.label}>Conta do brechó</Text>
        <Text style={styles.loteDica}>
          Roda no emulador próprio dela (liga só na hora). Entra na mesma ordem das outras; sem nenhuma
          outra marcada, roda sozinha.
        </Text>
        <View style={{ marginTop: 8 }}>
          <SeletorContas contas={[CONTA_BRECHO]} ordem={ordem} onChange={setOrdem} />
        </View>
      </Card>
      </Aparece>
      ) : null}
      {ehStoryBrecho ? (
      <Aparece delay={30}>
      <Card>
        <View style={styles.infoHead}>
          <Ionicons name="git-branch-outline" size={16} color={colors.marca} />
          <Text style={styles.label}>Brechó e segue ao mesmo tempo</Text>
        </View>
        <Text style={styles.infoTxt}>
          O brechó roda num emulador só dele, então dá pra rodar ele com um modo e as outras contas com
          outro, juntos:
        </Text>
        <Text style={styles.infoPasso}>1. Marque só a conta do brechó, escolha o modo (ex: "brechó com abertura", que abre com o vídeo) e toque em Rodar.</Text>
        <Text style={styles.infoPasso}>2. Volte aqui: as outras contas já vêm marcadas. Escolha o outro modo (sem vídeo) e rode também.</Text>
        <Text style={styles.infoTxt}>
          Marcando o brechó junto com as outras numa run só, roda tudo em sequência e com o mesmo modo.
          O vídeo de abertura liga/desliga no modo ("Vídeo de abertura").
        </Text>
      </Card>
      </Aparece>
      ) : null}
      {!ehVitrine ? (
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
      ) : null}
      <Aparece delay={40}>
      <Card>
        <Text style={styles.label}>Modo</Text>
        {modos.length > 0 ? (
          <>
          <View style={styles.chips}>
            {modos.map((m) => (
              <TouchableOpacity key={m} onPress={() => setModo(m)}
                onLongPress={(e) => setMenuModo({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, nome: m })}
                delayLongPress={280}
                style={[styles.chip, modo === m && styles.chipOn]}>
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
            {modo ? (
              <TouchableOpacity onPress={() => duplicarModo(modo)} style={styles.link}>
                <Ionicons name="copy-outline" size={15} color={colors.marca} />
                <Text style={styles.linkTxt}>Duplicar</Text>
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
              {grupos.length > 0 && (
                <View style={[styles.chips, { marginBottom: 10 }]}>
                  {[null, ...grupos.map((g) => g.nome)].map((g) => (
                    <TouchableOpacity key={g ?? '__todas'} onPress={() => escolherGrupo(g)}
                      style={[styles.chip, grupoSel === g && styles.chipOn]}>
                      <Text style={[styles.chipTxt, grupoSel === g && styles.chipTxtOn]}>
                        {g ?? 'todas'}{g ? ` · ${grupos.find((x) => x.nome === g)?.contas.length ?? 0}` : ''}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
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
              {(contasAtivas ?? [])
                .filter((c) => {   // com grupo escolhido, lista só as contas dele
                  const g = grupoSel ? grupos.find((x) => x.nome === grupoSel) : null;
                  return !g || g.contas.includes(c.id as string);
                })
                .map((c) => {
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
        ) : bloqueio ? (
          <>
            <Botao title={ehStoryBrecho ? 'Já está rodando nesse emulador' : 'Já está rodando'} disabled onPress={() => {}} />
            <Botao title="Ver execução" cor={colors.card2} txtCor={colors.texto}
              onPress={() => nav.navigate('Run', { runId: bloqueio.id, nome })} />
          </>
        ) : (
          <>
            {rodandoAoLado.map((r) => (
              <TouchableOpacity key={r.id} onPress={() => nav.navigate('Run', { runId: r.id, nome })}
                style={styles.aoLado} hitSlop={6}>
                <Ionicons name="radio-button-on" size={12} color={colors.ok} />
                <Text style={styles.aoLadoTxt} numberOfLines={1}>
                  Rodando no emulador {emuladoresDe(contasDaRun(r)).has('brecho') ? 'do brechó' : 'das segue'} — pode rodar junto
                </Text>
                <Text style={styles.linkTxt}>ver</Text>
              </TouchableOpacity>
            ))}
            <Botao title={ehVitrine ? `Rodar em ${ordem.length} conta${ordem.length !== 1 ? 's' : ''}`
                : lote ? 'Rodar lote' : (contaAtiva ? `Rodar com @${contaAtiva.label}` : 'Rodar')}
              onPress={() => rodar(false)} loading={iniciando} />
            {/* sem "Simular": no app real só dá pra saber se o follow/DM/story funciona fazendo de
                verdade (20/10/2026) */}
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
      <MenuContexto
        visible={!!menuModo} x={menuModo?.x ?? 0} y={menuModo?.y ?? 0} onClose={() => setMenuModo(null)}
        itens={menuModo ? [
          { label: 'Editar', icon: 'create-outline',
            onPress: () => { const n = menuModo.nome; setMenuModo(null); nav.navigate('EditModo', { botId, modoNome: n }); } },
          { label: 'Duplicar', icon: 'copy-outline', onPress: () => duplicarModo(menuModo.nome) },
          { label: 'Excluir', icon: 'trash-outline', cor: colors.erro, onPress: () => excluirModo(menuModo.nome) },
        ] : []}
      />
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
  linksRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 18 },
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
  infoHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoTxt: { color: colors.textoFraco, fontSize: 12, lineHeight: 17, marginTop: 6 },
  infoPasso: { color: colors.texto, fontSize: 12, lineHeight: 17, marginTop: 6 },
  aoLado: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  aoLadoTxt: { color: colors.textoFraco, fontSize: 12, flex: 1 },
  selecaoHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  selecaoAcoes: { flexDirection: 'row', alignItems: 'center', gap: 16 },
});
