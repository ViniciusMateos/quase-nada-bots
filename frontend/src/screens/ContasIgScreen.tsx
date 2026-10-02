import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { api, Account, Grupo } from '@/lib/api';
import { cmpTexto } from '@/lib/ordenar';
import { Credencial, lerCredenciais, salvarCredencial, removerCredencial } from '@/lib/credenciais';
import { colors } from '@/theme';
import { Botao, Card } from '@/ui/components';
import { LoadingDog, TelaCarregando } from '@/ui/LoadingDog';
import { useDogRefresh } from '@/ui/DogRefresh';
import { MenuContexto } from '@/ui/MenuContexto';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

// uma linha da tela = credencial salva (user+senha) e/ou conta conectada (backend), casadas por @user
type Entry = {
  usuario: string; senha?: string; id?: string; ativa?: boolean; criadaEm?: number; pendente?: boolean;
  grupos?: string[]; travada?: boolean;
};

function idadeTxt(criadaEm?: number): string | null {
  if (!criadaEm) return null;
  const dias = Math.floor((Date.now() / 1000 - criadaEm) / 86400);
  if (dias <= 0) return 'há menos de 1 dia';
  if (dias === 1) return 'há 1 dia';
  return `há ${dias} dias`;
}

export function ContasIgScreen() {
  const nav = useNavigation<Nav>();
  const [contas, setContas] = useState<Account[] | null>(null);
  const [creds, setCreds] = useState<Credencial[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [modal, setModal] = useState({ aberto: false, editando: false, usuario: '', senha: '' });
  const [verSenha, setVerSenha] = useState(false);
  // status de sessão igual o Hub: id → sessão viva? (true/false/undefined=não checou ainda)
  const [sessoes, setSessoes] = useState<Record<string, boolean>>({});
  const [verificando, setVerificando] = useState(false);
  const jaValidou = useRef(false);
  const sincronizouPend = useRef(false);
  // ── grupos ──
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  // editando os membros de um grupo: cada conta ganha um checkbox; salvar grava de uma vez
  const [editGrupo, setEditGrupo] = useState<{ nome: string; sel: Set<string> } | null>(null);
  const [menuGrupo, setMenuGrupo] = useState<{ x: number; y: number; nome: string } | null>(null);
  // modal de nome do grupo (novo/renomear) — usa o MESMO <Modal> da conta (nunca dois Modals juntos)
  const [modalGrupo, setModalGrupo] = useState<{ aberto: boolean; original: string | null; nome: string }>(
    { aberto: false, original: null, nome: '' });

  const carregar = useCallback(async () => {
    let [cs, cr, gs] = await Promise.all([
      api.getAccounts().catch(() => [] as Account[]),
      lerCredenciais().catch(() => [] as Credencial[]),
      api.getGrupos().catch(() => [] as Grupo[]),
    ]);
    setGrupos(gs);
    // contas ADICIONADAS mas ainda não conectadas (credencial local sem conta no backend) →
    // registra um placeholder PENDENTE no server pra elas já entrarem no cronograma. A senha
    // NÃO vai (só o @). Idempotente; roda uma vez por abertura da tela.
    if (!sincronizouPend.current) {
      sincronizouPend.current = true;
      const temBackend = new Set(cs.map((c) => (c.label || '').toLowerCase()));
      const faltando = cr.filter((c) => !temBackend.has(c.usuario.toLowerCase()));
      if (faltando.length) {
        await Promise.all(faltando.map((c) => api.adicionarContaPendente(c.usuario).catch(() => {})));
        cs = await api.getAccounts().catch(() => cs);
      }
    }
    setContas(cs);
    setCreds(cr);
  }, []);

  // checa (via túnel) se a sessão de cada conta ainda está viva — pesado-ish, só no abrir/refresh
  const validar = useCallback(async (force = false) => {
    setVerificando(true);
    try {
      const r = await api.validarContas(force);
      const m: Record<string, boolean> = {};
      for (const a of r) if (a.id) m[a.id] = !!a.sessao_ok;
      setSessoes(m);
    } catch { /* offline */ } finally { setVerificando(false); }
  }, []);

  useFocusEffect(useCallback(() => {
    carregar();
    if (!jaValidou.current) { jaValidou.current = true; validar(); }   // abrir usa cache (instantâneo)
  }, [carregar, validar]));
  const { scrollProps, dog, spacerEl } = useDogRefresh(async () => { await carregar(); await validar(true); });

  const entries = useMemo<Entry[]>(() => {
    const map = new Map<string, Entry>();
    for (const c of creds) map.set(c.usuario.toLowerCase(), { usuario: c.usuario, senha: c.senha });
    for (const a of contas ?? []) {
      const k = (a.label || '').toLowerCase();
      const prev = map.get(k);
      map.set(k, {
        usuario: prev?.usuario || a.label, senha: prev?.senha,
        id: a.id, ativa: a.ativa, criadaEm: a.criada_em, pendente: a.pendente, grupos: a.grupos,
        travada: a.travada,
      });
    }
    return [...map.values()].sort((a, b) => cmpTexto(a.usuario, b.usuario));
  }, [creds, contas]);

  function conectar(e: Entry) {
    nav.navigate('InstagramLogin', { label: e.usuario, senha: e.senha });
  }

  function ativar(e: Entry) {
    if (!e.id || e.ativa || busy) return;
    setBusy(e.usuario);
    api.ativarConta(e.id).then(carregar).catch(() => Alert.alert('Ops', 'Não consegui ativar essa conta.'))
      .finally(() => setBusy(null));
  }

  // trava = nada automático roda nessa conta (o cronograma tira ela do plano na hora)
  function travar(e: Entry) {
    if (!e.id || busy) return;
    const nova = !e.travada;
    setBusy(e.usuario);
    api.travarConta(e.id, nova).then(carregar)
      .catch(() => Alert.alert('Ops', 'Não consegui mudar a trava dessa conta.'))
      .finally(() => setBusy(null));
  }

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

  function abrirAdd() { setVerSenha(false); setModal({ aberto: true, editando: false, usuario: '', senha: '' }); }
  function abrirEdit(e: Entry) { setVerSenha(false); setModal({ aberto: true, editando: true, usuario: e.usuario, senha: e.senha || '' }); }
  function fecharModal() { setModal((m) => ({ ...m, aberto: false })); }

  async function salvarConta() {
    const u = modal.usuario.trim().replace(/^@/, '');
    if (!u) { Alert.alert('Falta o @', 'Põe o usuário da conta.'); return; }
    if (!modal.senha) { Alert.alert('Falta a senha', 'Põe a senha (fica só neste aparelho).'); return; }
    try {
      await salvarCredencial({ usuario: u, senha: modal.senha });
      await api.adicionarContaPendente(u).catch(() => {});   // já entra na lista/cronograma (sem conectar)
      fecharModal(); await carregar();
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

  if (!contas) return <TelaCarregando />;

  return (
    <View style={styles.tela}>
      {dog}
      <ScrollView style={styles.tela} contentContainerStyle={{ padding: 16, gap: 12 }} {...scrollProps}>
        {spacerEl}
        <Text style={styles.dica}>
          Salve suas contas (user + senha) e conecte num toque — o app preenche o login sozinho.
          A senha fica <Text style={styles.forte}>só neste aparelho</Text>, nunca vai pro servidor.
          Só <Text style={styles.forte}>uma</Text> fica ativa por vez (a que os bots usam).
          O <Text style={styles.forte}>cadeado</Text> tranca a conta pro automático (o cronograma não roda nada nela).
        </Text>

        {/* botão de adicionar no TOPO (primeiro), não no fim da lista */}
        <Botao title="Adicionar conta" cor={colors.marca} txtCor="#fff" onPress={abrirAdd} />

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
        ) : entries.map((e, i) => {
          const sess = e.id ? sessoes[e.id] : undefined;      // true/false/undefined(=não checou)
          const checando = verificando && !!e.id && !e.pendente && sess === undefined;
          const caiu = !!e.id && !e.pendente && sess === false;   // pendente não é "caiu" (nunca conectou)
          // mesmo esquema de cor do Hub: verde SÓ na conta ativa; sessão ok = branco;
          // problema = vermelho; verificando = cinza.
          let status: string, cor: string;
          if (e.pendente) { status = 'não conectada · conecta pra rodar'; cor = colors.erro; }
          else if (!e.id) { status = 'sem sessão'; cor = colors.erro; }
          else if (checando) { status = 'verificando…'; cor = colors.textoFraco; }
          else if (caiu) { status = 'sessão caiu'; cor = colors.erro; }
          else if (e.ativa) { status = 'ativa · em uso'; cor = colors.ok; }
          else { status = 'sessão ok'; cor = colors.texto; }
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
                  <View style={styles.subRow}>
                    <Text style={[styles.sub, { color: cor, fontWeight: '700' }]}>{status}</Text>
                    {idade ? <Text style={styles.sub}> · {idade}</Text> : null}
                  </View>
                  {e.grupos?.length || e.travada ? (
                    <View style={styles.tagsRow}>
                      {e.travada ? (
                        <View style={[styles.tag, styles.tagTrava]}>
                          <Ionicons name="lock-closed" size={10} color={colors.laranja} />
                          <Text style={[styles.tagTxt, { color: colors.laranja }]}>sem automático</Text>
                        </View>
                      ) : null}
                      {[...(e.grupos ?? [])].sort(cmpTexto).map((g) => (
                        <View key={g} style={styles.tag}><Text style={styles.tagTxt}>{g}</Text></View>
                      ))}
                    </View>
                  ) : null}
                </View>
                {e.ativa ? <View style={styles.badge}><Text style={styles.badgeTxt}>ATIVA</Text></View> : null}
              </View>

              <View style={styles.acoesRow}>
                <View style={{ flex: 1 }}>
                  <Botao title={caiu ? 'Reconectar' : 'Conectar'} onPress={() => conectar(e)} />
                </View>
                {busy === e.usuario ? (
                  <View style={styles.spin}><LoadingDog size={22} /></View>
                ) : (
                  <>
                    {e.id && !e.pendente && !e.ativa && !caiu ? (
                      <TouchableOpacity onPress={() => ativar(e)} style={styles.icon} hitSlop={6}>
                        <Ionicons name="power" size={20} color={colors.texto} />
                      </TouchableOpacity>
                    ) : null}
                    {e.id ? (
                      <TouchableOpacity onPress={() => travar(e)} style={styles.icon} hitSlop={6}>
                        <Ionicons name={e.travada ? 'lock-closed' : 'lock-open-outline'} size={20}
                          color={e.travada ? colors.laranja : colors.textoFraco} />
                      </TouchableOpacity>
                    ) : null}
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
      <Modal visible={modal.aberto || modalGrupo.aberto} transparent animationType="fade"
        onRequestClose={() => { fecharModal(); setModalGrupo((m) => ({ ...m, aberto: false })); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalWrap}>
          <Pressable style={StyleSheet.absoluteFill}
            onPress={() => { fecharModal(); setModalGrupo((m) => ({ ...m, aberto: false })); }} />
          {modalGrupo.aberto ? (
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
