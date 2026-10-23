import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { api, Account, Grupo, locaisDe } from '@/lib/api';
import { CONTA_BRECHO, ehUsername, sincronizarEmulador } from '@/lib/syncEmulador';
import { cmpTexto } from '@/lib/ordenar';
import { Credencial, lerCredenciais, salvarCredencial, removerCredencial } from '@/lib/credenciais';
import { colors } from '@/theme';
import { Botao, Card, Pulsar } from '@/ui/components';
import { LoadingDog } from '@/ui/LoadingDog';
import { Esqueleto, EsqueletoCartao } from '@/ui/Esqueleto';
import { useDogRefresh } from '@/ui/DogRefresh';
import { MenuContexto } from '@/ui/MenuContexto';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

// uma linha da tela = credencial salva (user+senha) e/ou conta cadastrada (backend), casadas por
// @user, com o estado dela no emulador. Desde 20/10/2026 o app é SÓ emulador (a tela do servidor saiu).
type Entry = {
  usuario: string; senha?: string; id?: string; criadaEm?: number; pendente?: boolean;
  grupos?: string[];
  // conta FORA do emulador das segue = a do brechó (o Story Repost roda no emulador próprio dela)
  propria?: boolean;
  emulLogada?: boolean;          // logada no app do IG dentro do emulador?
  emulSessao?: 'ok' | 'bloqueada' | 'desconhecida' | 'deslogada' | 'senha_incorreta';   // última verificação
};

function idadeTxt(criadaEm?: number): string | null {
  if (!criadaEm) return null;
  const dias = Math.floor((Date.now() / 1000 - criadaEm) / 86400);
  if (dias <= 0) return 'há menos de 1 dia';
  if (dias === 1) return 'há 1 dia';
  return `há ${dias} dias`;
}

// selo do estado da conta (sessão ok, bloqueada, não sincronizada…) com o dot na cor do estado.
// `carregando` → enquanto a sessão ainda NÃO foi verificada, o selo pulsa (loading de verdade),
// pra não parecer um estado final estático quando na real ainda não sabemos.
function Selo({ texto, cor, carregando }: { texto: string; cor: string; carregando?: boolean }) {
  const conteudo = (
    <View style={styles.selo}>
      <View style={[styles.seloDot, { backgroundColor: cor }]} />
      <Text style={[styles.seloTxt, { color: cor }]}>{texto}</Text>
    </View>
  );
  return carregando ? <Pulsar>{conteudo}</Pulsar> : conteudo;
}

export function ContasIgScreen() {
  const nav = useNavigation<Nav>();
  const [contas, setContas] = useState<Account[] | null>(null);
  const [creds, setCreds] = useState<Credencial[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [modal, setModal] = useState({ aberto: false, editando: false, usuario: '', senha: '' });
  const [verSenha, setVerSenha] = useState(false);
  const [emul, setEmul] = useState<string[]>([]);           // @usernames logados no emulador
  const [emulSess, setEmulSess] = useState<Record<string, 'ok' | 'bloqueada' | 'desconhecida' | 'deslogada' | 'senha_incorreta'>>({});
  const sincronizouPend = useRef(false);
  // ── grupos ──
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  // editando os membros de um grupo: cada conta ganha um checkbox; salvar grava de uma vez
  const [editGrupo, setEditGrupo] = useState<{ nome: string; sel: Set<string> } | null>(null);
  const [menuGrupo, setMenuGrupo] = useState<{ x: number; y: number; nome: string } | null>(null);
  // modal de nome do grupo (novo/renomear) — usa o MESMO <Modal> da conta (nunca dois Modals juntos)
  const [modalGrupo, setModalGrupo] = useState<{ aberto: boolean; original: string | null; nome: string }>(
    { aberto: false, original: null, nome: '' });
  // modal de CÓDIGO de verificação (quando o IG desafia no reconectar) — usa o MESMO <Modal>
  const [modalCodigo, setModalCodigo] = useState<{ aberto: boolean; user: string; codigo: string }>(
    { aberto: false, user: '', codigo: '' });

  const carregar = useCallback(async () => {
    let [cs, cr, gs, es] = await Promise.all([
      api.getAccounts().catch(() => [] as Account[]),
      lerCredenciais().catch(() => [] as Credencial[]),
      api.getGrupos().catch(() => [] as Grupo[]),
      api.emuladorStatus().catch(() => null),                   // conta(s) logada(s) no emulador
    ]);
    setGrupos(gs);
    setEmul(es?.contas_logadas ?? []);
    setEmulSess(es?.sessoes ?? {});
    // conta salva só no aparelho (credencial sem conta no backend) e conta logada no emulador que o
    // app não conhece → entram como PENDENTE (só o @, a senha NÃO vai). Idempotente; 1x por abertura.
    if (!sincronizouPend.current) {
      sincronizouPend.current = true;
      const temBackend = new Set(cs.map((c) => (c.label || '').toLowerCase()));
      const faltando = cr.filter((c) => !temBackend.has(c.usuario.toLowerCase())).map((c) => c.usuario);
      const doCred = new Set(cr.map((c) => c.usuario.toLowerCase()));
      for (const u of es?.contas_logadas ?? []) {
        if (!ehUsername(u)) continue;   // título de tela/lixo lido pelo agente nunca vira conta
        const l = u.toLowerCase();
        if (!temBackend.has(l) && !doCred.has(l) && !faltando.some((f) => f.toLowerCase() === l)) faltando.push(u);
      }
      if (faltando.length) {
        await Promise.all(faltando.map((u) => api.adicionarContaPendente(u, ['emulador']).catch(() => {})));
        cs = await api.getAccounts().catch(() => cs);
      }
    }
    setContas(cs);
    setCreds(cr);
  }, []);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));
  const { scrollProps, dog, spacerEl } = useDogRefresh(carregar);

  const entries = useMemo<Entry[]>(() => {
    const map = new Map<string, Entry>();
    // casa TUDO por @username (lowercase): a mesma conta vem da credencial salva, do backend e do
    // emulador. Uma linha só, agregando o estado.
    const ensure = (u: string): Entry => {
      const k = u.toLowerCase();
      let e = map.get(k);
      if (!e) { e = { usuario: u }; map.set(k, e); }
      return e;
    };
    for (const c of creds) { ensure(c.usuario).senha = c.senha; }
    for (const a of contas ?? []) {
      const e = ensure(a.label);
      e.id = a.id; e.criadaEm = a.criada_em; e.pendente = a.pendente;
      e.grupos = a.grupos;
      e.propria = (a.label || '').toLowerCase() === CONTA_BRECHO || !locaisDe(a).includes('emulador');
      if (e.propria) e.emulSessao = emulSess[a.label] ?? emulSess[CONTA_BRECHO];   // emulador dela
    }
    for (const u of emul) {
      if (!ehUsername(u)) continue;
      const e = ensure(u); e.emulLogada = true; e.emulSessao = emulSess[u];
    }
    return [...map.values()].sort((a, b) => cmpTexto(a.usuario, b.usuario));
  }, [creds, contas, emul, emulSess]);

  // a lista em duas partes: PRINCIPAL (a conta do brechó) e AUXILIARES (as outras)
  const lista = useMemo<(Entry | { _h: string })[]>(() => {
    const ehPrincipal = (e: Entry) => !!e.propria || e.usuario.toLowerCase() === CONTA_BRECHO;
    const pri = entries.filter(ehPrincipal);
    const aux = entries.filter((e) => !ehPrincipal(e));
    return [
      ...(pri.length ? [{ _h: 'Principal' }, ...pri] : []),
      ...(aux.length ? [{ _h: 'Auxiliares' }, ...aux] : []),
    ];
  }, [entries]);

  function apagar(e: Entry) {
    Alert.alert('Apagar conta', `Apagar "@${e.usuario}"? Some a credencial salva e a sessão.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Apagar', style: 'destructive', onPress: async () => {
        setBusy(e.usuario);
        try {
          await removerCredencial(e.usuario);
          if (e.id) await api.removerConta(e.id);
          await carregar();
        } catch { Alert.alert('Ops', 'Não consegui apagar.'); }
        finally { setBusy(null); }
      } },
    ]);
  }

  // senha salva no aparelho pra mandar junto no login (sem ela o server usa a dele)
  function senhaSalva(usuario: string): Record<string, string> | undefined {
    const c = creds.find((x) => x.usuario.toLowerCase() === usuario.toLowerCase());
    return c?.senha ? { [usuario]: c.senha } : undefined;
  }

  // reconectar = o agente loga a conta no app do IG (digita user/senha)
  function reconectar(e: Entry) {
    if (busy) return;
    Alert.alert('Reconectar', e.propria
      ? `Logar @${e.usuario} no emulador próprio dela? (ele liga, loga e desliga)`
      : `Logar @${e.usuario} de novo no app do Instagram?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Reconectar', onPress: async () => {
        setBusy(e.usuario);
        try {
          const r = await api.reconectarEmulador([e.usuario], senhaSalva(e.usuario));
          const rid = r?.run_ids?.[0];
          // abre o log do login no device; se o IG pedir código, toca na chave da conta (abrirCodigo)
          if (rid) nav.navigate('Run', { runId: rid, nome: `Reconectar @${e.usuario}` });
          else Alert.alert('Reconectando', 'Acompanhe em "Rodando agora". Se pedir código, toque na chave da conta.');
        } catch {
          Alert.alert('Ops', 'Não consegui iniciar o reconectar.');
        } finally { setBusy(null); }
      } },
    ]);
  }

  // VERIFICAR E SINCRONIZAR (mesma rotina da tela inicial): conta logada que o app não tem entra
  // no app; conta que não está logada vai pra fila de login (senha do aparelho; o brechó no
  // emulador dele); e a
  // verificação das sessões entra na fila depois dos logins.
  async function sincronizarEVerificar() {
    if (sincronizando) return;
    setSincronizando(true);
    try {
      const r = await sincronizarEmulador();
      await api.verificarSessoes().catch(() => {});
      await carregar();
      const partes: string[] = [];
      if (r.adicionadas.length) partes.push(`Entraram no app: ${r.adicionadas.map((u) => '@' + u).join(', ')}`);
      if (r.logando.length) partes.push(`Logando: ${r.logando.map((u) => '@' + u).join(', ')}`);
      if (r.semSenha.length) partes.push(`Sem senha salva (edite a conta e ponha a senha): ${r.semSenha.map((u) => '@' + u).join(', ')}`);
      if (r.senhaIncorreta.length) partes.push(`Senha incorreta (o Instagram recusou; edite a conta e corrija): ${r.senhaIncorreta.map((u) => '@' + u).join(', ')}`);
      partes.push('A verificação das sessões entrou na fila — acompanhe na tela inicial.');
      Alert.alert('Sincronizado', partes.join('\n\n'));
    } catch { Alert.alert('Ops', 'Não consegui sincronizar.'); }
    finally { setSincronizando(false); }
  }

  function abrirCodigo(e: Entry) { setModalCodigo({ aberto: true, user: e.usuario, codigo: '' }); }

  async function enviarCodigo() {
    const u = modalCodigo.user; const cod = modalCodigo.codigo.trim();
    if (!cod) { Alert.alert('Falta o código', 'Digite o código que o Instagram pediu.'); return; }
    try {
      await api.enviarCodigo(u, cod);
      setModalCodigo((m) => ({ ...m, aberto: false }));
      Alert.alert('Código enviado', `Mandei o código da @${u}. O login continua sozinho.`);
    } catch { Alert.alert('Ops', 'Não consegui enviar o código.'); }
  }

  function abrirAdd() { setVerSenha(false); setModal({ aberto: true, editando: false, usuario: '', senha: '' }); }
  function abrirEdit(e: Entry) { setVerSenha(false); setModal({ aberto: true, editando: true, usuario: e.usuario, senha: e.senha || '' }); }
  function fecharModal() { setModal((m) => ({ ...m, aberto: false })); }

  async function salvarConta() {
    const u = modal.usuario.trim().replace(/^@/, '');
    if (!u) { Alert.alert('Falta o @', 'Põe o usuário da conta.'); return; }
    if (!modal.senha) { Alert.alert('Falta a senha', 'Põe a senha (fica só neste aparelho).'); return; }
    try {
      await salvarCredencial({ usuario: u, senha: modal.senha });
      await api.adicionarContaPendente(u).catch(() => {});   // já entra na lista (sem logar ainda)
      // não está logada → já manda o agente logar (fila), com a senha recém-salva. A do brechó
      // sempre loga (no emulador próprio dela; se já estiver logada, ele só confere e desliga)
      const logada = emul.some((x) => x.toLowerCase() === u.toLowerCase());
      const existente = entries.find((x) => x.usuario.toLowerCase() === u.toLowerCase());
      let logando = false;
      if (existente?.propria || u.toLowerCase() === CONTA_BRECHO || !logada) {
        logando = !!(await api.reconectarEmulador([u], { [u]: modal.senha }).catch(() => null));
      }
      fecharModal(); await carregar();
      if (logando) {
        Alert.alert('Logando',
          `@${u} ainda não estava logada — mandei o agente logar. Se o Instagram pedir código, toque na chave da conta.`);
      }
    } catch { Alert.alert('Ops', 'Não consegui salvar a credencial.'); }
  }

  // ───── grupos ─────
  function abrirGrupo(nome: string) {
    const g = grupos.find((x) => x.nome === nome);
    setEditGrupo({ nome, sel: new Set(g?.contas ?? []) });
  }

  function toggleNoGrupo(id: string) {
    setEditGrupo((eg) => {
      if (!eg) return eg;
      const n = new Set(eg.sel); n.has(id) ? n.delete(id) : n.add(id);
      return { ...eg, sel: n };
    });
  }

  async function salvarMembros() {
    if (!editGrupo) return;
    try {
      await api.editarGrupo(editGrupo.nome, { contas: [...editGrupo.sel] });
      setEditGrupo(null); await carregar();
    } catch { Alert.alert('Ops', 'Não consegui salvar o grupo.'); }
  }

  async function salvarNomeGrupo() {
    const nome = modalGrupo.nome.trim();
    if (!nome) { Alert.alert('Falta o nome', 'Dá um nome pro grupo (ex: Vitrine).'); return; }
    try {
      if (modalGrupo.original) await api.editarGrupo(modalGrupo.original, { nome });
      else await api.criarGrupo(nome);
      setModalGrupo({ aberto: false, original: null, nome: '' });
      await carregar();
      if (!modalGrupo.original) abrirGrupo(nome);   // grupo novo → já abre pra escolher as contas
    } catch { Alert.alert('Ops', 'Não consegui salvar o grupo.'); }
  }

  function apagarGrupo(nome: string) {
    setMenuGrupo(null);
    Alert.alert('Apagar grupo', `Apagar o grupo "${nome}"? As contas continuam, só saem dele.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Apagar', style: 'destructive', onPress: async () => {
        try { await api.removerGrupo(nome); if (editGrupo?.nome === nome) setEditGrupo(null); await carregar(); }
        catch { Alert.alert('Ops', 'Não consegui apagar o grupo.'); }
      } },
    ]);
  }

  // loading inicial → skeleton no formato da tela, em vez de dog de tela cheia
  if (!contas) {
    return (
      <View style={styles.tela}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <Esqueleto width="92%" height={12} />
          <Esqueleto width="70%" height={12} />
          <Esqueleto height={46} radius={12} style={{ marginTop: 4 }} />
          <EsqueletoCartao linhas={2} />
          {[0, 1, 2, 3].map((i) => <EsqueletoCartao key={i} linhas={2} />)}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.tela}>
      {dog}
      <ScrollView style={styles.tela} contentContainerStyle={{ padding: 16, gap: 12 }} {...scrollProps}>
        {spacerEl}
        <Text style={styles.dica}>
          Salve suas contas (user + senha) — o agente loga elas no app do Instagram sozinho. A senha
          fica <Text style={styles.forte}>só neste aparelho</Text> e vai junto só na hora de logar. Toda
          conta sincroniza: o verificar loga as que faltam (a do brechó no emulador próprio dela).
        </Text>

        {/* botões no TOPO (primeiro), não no fim da lista */}
        <Botao title="Adicionar conta" cor={colors.marca} txtCor="#fff" onPress={abrirAdd} />
        {/* Criar Conta: no PC (web) é automático (Chromium + lê o Gmail + bio/foto); no celular abre
            o cadastro num WebView e você digita o código na mão */}
        <Botao title="Criar conta nova" cor={colors.card2} txtCor={colors.texto}
          onPress={() => nav.navigate('CriarConta')} />
        {/* verificar + sincronizar (mesma rotina do botão da tela inicial) */}
        <Botao title={sincronizando ? 'Sincronizando…' : 'Verificar e sincronizar'}
          cor={colors.card2} txtCor={colors.texto} onPress={sincronizarEVerificar} />

        {/* grupos: tocar edita quem está nele; segurar renomeia/apaga */}
        <Card style={{ gap: 10 }}>
          <Text style={styles.secao}>Grupos</Text>
          <View style={styles.chips}>
            {grupos.map((g) => {
              const on = editGrupo?.nome === g.nome;
              return (
                <TouchableOpacity key={g.nome} onPress={() => (on ? setEditGrupo(null) : abrirGrupo(g.nome))}
                  onLongPress={(ev) => setMenuGrupo({ x: ev.nativeEvent.pageX, y: ev.nativeEvent.pageY, nome: g.nome })}
                  delayLongPress={280} style={[styles.chip, on && styles.chipOn]}>
                  <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{g.nome} · {g.contas.length}</Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity onPress={() => setModalGrupo({ aberto: true, original: null, nome: '' })}
              style={[styles.chip, styles.chipAdd]}>
              <Ionicons name="add" size={14} color={colors.marca} />
              <Text style={[styles.chipTxt, { color: colors.marca }]}>grupo</Text>
            </TouchableOpacity>
          </View>
          {editGrupo ? (
            <>
              <Text style={styles.dica}>
                Marque as contas do grupo <Text style={styles.forte}>{editGrupo.nome}</Text> aqui embaixo
                ({editGrupo.sel.size} marcada{editGrupo.sel.size !== 1 ? 's' : ''}).
              </Text>
              <View style={styles.modalBtns}>
                <View style={{ flex: 1 }}><Botao title="Cancelar" cor={colors.card2} txtCor={colors.texto} onPress={() => setEditGrupo(null)} /></View>
                <View style={{ flex: 1 }}><Botao title="Salvar grupo" onPress={salvarMembros} /></View>
              </View>
            </>
          ) : (
            <Text style={styles.dica}>
              {grupos.length ? 'Toque num grupo pra escolher as contas dele; segure pra renomear ou apagar.'
                : 'Separe as contas em grupos (ex: Captação, Vitrine) pra rodar um bot só num grupo.'}
            </Text>
          )}
        </Card>

        {entries.length === 0 ? (
          <Text style={styles.vazio}>Nenhuma conta ainda. Adicione uma aí em cima.</Text>
        ) : lista.map((item, i) => {
          if ('_h' in item) {
            return <Text key={`h:${item._h}`} style={styles.grupoLista}>{item._h}</Text>;
          }
          const e = item;
          // estado da conta: sessão ok / bloqueada (verificação), logada ou não sincronizada.
          // A do brechó (propria) vive no emulador próprio do Story Repost (desligado): o estado é o
          // último que os jobs dela reportaram.
          let txt: string, cor: string;
          if (e.propria) {
            if (e.emulSessao === 'ok') { txt = 'logada · emulador do brechó'; cor = colors.ok; }
            else if (e.emulSessao === 'senha_incorreta') { txt = 'senha incorreta · edite e corrija'; cor = colors.erro; }
            else { txt = 'não sincronizada · emulador do brechó'; cor = colors.laranja; }
          }
          else if (e.emulLogada) {
            if (e.emulSessao === 'ok') { txt = 'sessão ok'; cor = colors.ok; }
            else if (e.emulSessao === 'bloqueada') { txt = 'bloqueada'; cor = colors.erro; }
            else { txt = 'logada'; cor = colors.ok; }
          }
          else { txt = 'não sincronizada'; cor = colors.laranja; }
          const idade = e.id && !e.pendente ? idadeTxt(e.criadaEm) : null;
          return (
          <Animated.View key={e.usuario}
            entering={FadeInDown.delay(Math.min(i, 8) * 40).duration(280)}
            layout={LinearTransition.duration(260)}>
            <Card style={{ gap: 10 }}>
              <View style={styles.topo}>
                {editGrupo && e.id ? (
                  <TouchableOpacity onPress={() => toggleNoGrupo(e.id as string)} hitSlop={10}>
                    <Ionicons name={editGrupo.sel.has(e.id) ? 'checkbox' : 'square-outline'} size={22}
                      color={editGrupo.sel.has(e.id) ? colors.marca : colors.textoFraco} />
                  </TouchableOpacity>
                ) : null}
                <View style={[styles.dot, { backgroundColor: cor }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>@{e.usuario}</Text>
                  <View style={styles.selosRow}>
                    <Selo texto={txt} cor={cor} />
                    {idade ? <Text style={styles.idadeTxt}>{idade}</Text> : null}
                  </View>
                  {e.grupos?.length ? (
                    <View style={styles.tagsRow}>
                      {[...(e.grupos ?? [])].sort(cmpTexto).map((g) => (
                        <View key={g} style={styles.tag}><Text style={styles.tagTxt}>{g}</Text></View>
                      ))}
                    </View>
                  ) : null}
                </View>
              </View>

              <View style={styles.acoesRow}>
                <View style={{ flex: 1 }}>
                  {/* reconectar = o agente loga a conta no app (a do brechó loga no emulador próprio dela) */}
                  <Botao title="Reconectar" onPress={() => reconectar(e)} />
                </View>
                {busy === e.usuario ? (
                  <View style={styles.spin}><LoadingDog size={22} /></View>
                ) : (
                  <>
                    <TouchableOpacity onPress={() => abrirCodigo(e)} style={styles.icon} hitSlop={6}>
                      <Ionicons name="key-outline" size={20} color={colors.marca} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => abrirEdit(e)} style={styles.icon} hitSlop={6}>
                      <Ionicons name="create-outline" size={20} color={colors.textoFraco} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => apagar(e)} style={styles.icon} hitSlop={6}>
                      <Ionicons name="trash-outline" size={20} color={colors.erro} />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </Card>
          </Animated.View>
          );
        })}
      </ScrollView>

      {/* UM <Modal> só, pra conta OU pra nome de grupo (dois Modals juntos = crash no iOS) */}
      <Modal visible={modal.aberto || modalGrupo.aberto || modalCodigo.aberto} transparent animationType="fade"
        onRequestClose={() => { fecharModal(); setModalGrupo((m) => ({ ...m, aberto: false })); setModalCodigo((m) => ({ ...m, aberto: false })); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalWrap}>
          <Pressable style={StyleSheet.absoluteFill}
            onPress={() => { fecharModal(); setModalGrupo((m) => ({ ...m, aberto: false })); setModalCodigo((m) => ({ ...m, aberto: false })); }} />
          {modalCodigo.aberto ? (
          <View style={styles.modalCard}>
            <Text style={styles.modalTitulo}>Código de @{modalCodigo.user}</Text>
            <Text style={styles.modalDica}>O Instagram mandou um código (e-mail/SMS). Digite aqui pra o login continuar.</Text>
            <TextInput style={styles.input} placeholder="código (ex: 123456)" placeholderTextColor={colors.textoFraco}
              keyboardType="number-pad" autoFocus value={modalCodigo.codigo}
              onChangeText={(t) => setModalCodigo((m) => ({ ...m, codigo: t }))}
              onSubmitEditing={enviarCodigo} returnKeyType="done" />
            <View style={styles.modalBtns}>
              <View style={{ flex: 1 }}><Botao title="Cancelar" cor={colors.card2} txtCor={colors.texto}
                onPress={() => setModalCodigo((m) => ({ ...m, aberto: false }))} /></View>
              <View style={{ flex: 1 }}><Botao title="Enviar" onPress={enviarCodigo} /></View>
            </View>
          </View>
          ) : modalGrupo.aberto ? (
          <View style={styles.modalCard}>
            <Text style={styles.modalTitulo}>{modalGrupo.original ? `Renomear "${modalGrupo.original}"` : 'Novo grupo'}</Text>
            <TextInput style={styles.input} placeholder="nome (ex: Vitrine)" placeholderTextColor={colors.textoFraco}
              autoFocus value={modalGrupo.nome} onChangeText={(t) => setModalGrupo((m) => ({ ...m, nome: t }))}
              onSubmitEditing={salvarNomeGrupo} returnKeyType="done" />
            <View style={styles.modalBtns}>
              <View style={{ flex: 1 }}><Botao title="Cancelar" cor={colors.card2} txtCor={colors.texto}
                onPress={() => setModalGrupo((m) => ({ ...m, aberto: false }))} /></View>
              <View style={{ flex: 1 }}><Botao title="Salvar" onPress={salvarNomeGrupo} /></View>
            </View>
          </View>
          ) : (
          <View style={styles.modalCard}>
            <Text style={styles.modalTitulo}>{modal.editando ? `Editar @${modal.usuario}` : 'Nova conta'}</Text>
            <TextInput style={styles.input} placeholder="@usuário" placeholderTextColor={colors.textoFraco}
              autoCapitalize="none" autoCorrect={false} value={modal.usuario} editable={!modal.editando}
              onChangeText={(t) => setModal((m) => ({ ...m, usuario: t }))} />
            <View style={styles.senhaRow}>
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="senha" placeholderTextColor={colors.textoFraco}
                secureTextEntry={!verSenha} autoCapitalize="none" autoCorrect={false} value={modal.senha}
                onChangeText={(t) => setModal((m) => ({ ...m, senha: t }))} />
              <TouchableOpacity onPress={() => setVerSenha((v) => !v)} style={styles.olho} hitSlop={8}>
                <Ionicons name={verSenha ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textoFraco} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalDica}>A senha fica só neste aparelho (Keychain), nunca vai pro servidor.</Text>
            <View style={styles.modalBtns}>
              <View style={{ flex: 1 }}><Botao title="Cancelar" cor={colors.card2} txtCor={colors.texto} onPress={fecharModal} /></View>
              <View style={{ flex: 1 }}><Botao title="Salvar" onPress={salvarConta} /></View>
            </View>
          </View>
          )}
        </KeyboardAvoidingView>
      </Modal>

      <MenuContexto
        visible={!!menuGrupo} x={menuGrupo?.x ?? 0} y={menuGrupo?.y ?? 0} onClose={() => setMenuGrupo(null)}
        itens={menuGrupo ? [
          { label: 'Escolher contas', icon: 'checkbox-outline',
            onPress: () => { const n = menuGrupo.nome; setMenuGrupo(null); abrirGrupo(n); } },
          { label: 'Renomear', icon: 'create-outline',
            onPress: () => { const n = menuGrupo.nome; setMenuGrupo(null); setModalGrupo({ aberto: true, original: n, nome: n }); } },
          { label: 'Apagar', icon: 'trash-outline', cor: colors.erro, onPress: () => apagarGrupo(menuGrupo.nome) },
        ] : []}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.bg },
  dica: { color: colors.textoFraco, fontSize: 13, lineHeight: 19 },
  forte: { color: colors.texto, fontWeight: '700' },
  vazio: { color: colors.textoFraco, textAlign: 'center', marginVertical: 20 },
  topo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 999 },
  label: { color: colors.texto, fontSize: 16, fontWeight: '700' },
  subRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2, flexWrap: 'wrap' },
  sub: { color: colors.textoFraco, fontSize: 12 },
  // selos de localização (app/server/emulador)
  selosRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  selo: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.card2,
    borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, borderWidth: 1, borderColor: colors.border },
  seloDot: { width: 7, height: 7, borderRadius: 999 },
  seloTxt: { fontSize: 11, fontWeight: '700' },
  idadeTxt: { color: colors.textoFraco, fontSize: 11, marginLeft: 2 },
  badge: { borderWidth: 1, borderColor: colors.ok, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  badgeTxt: { color: colors.ok, fontSize: 11, fontWeight: '800' },
  acoesRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  icon: { padding: 6 },
  spin: { paddingHorizontal: 8 },
  modalWrap: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.55)' },
  modalCard: { backgroundColor: '#171717', borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 18, gap: 12 },
  modalTitulo: { color: colors.texto, fontSize: 18, fontWeight: '800' },
  input: { backgroundColor: colors.card2, color: colors.texto, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border },
  senhaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  olho: { padding: 8 },
  modalDica: { color: colors.textoFraco, fontSize: 11, lineHeight: 15 },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  // grupos
  secao: { color: colors.texto, fontSize: 15, fontWeight: '800' },
  grupoLista: { color: colors.textoFraco, fontSize: 12, fontWeight: '800', marginTop: 6, marginLeft: 4,
    textTransform: 'uppercase', letterSpacing: 0.5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // mesmos chips do BotScreen (modos) — mesmo visual no app todo
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: colors.border,
    borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  chipOn: { backgroundColor: colors.laranja, borderColor: colors.laranja },
  chipAdd: { borderStyle: 'dashed', borderColor: colors.marca },
  chipTxt: { color: colors.texto },
  chipTxtOn: { color: '#0F0F0F', fontWeight: '700' },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  tag: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: colors.card2,
    borderWidth: 1, borderColor: colors.border },
  tagTxt: { color: colors.textoFraco, fontSize: 11, fontWeight: '700' },
  tagTrava: { flexDirection: 'row', alignItems: 'center', gap: 4, borderColor: colors.laranja },
});
