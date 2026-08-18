import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { api, Account } from '@/lib/api';
import { cmpTexto } from '@/lib/ordenar';
import { Credencial, lerCredenciais, salvarCredencial, removerCredencial } from '@/lib/credenciais';
import { colors } from '@/theme';
import { Botao, Card } from '@/ui/components';
import { LoadingDog, TelaCarregando } from '@/ui/LoadingDog';
import { useDogRefresh } from '@/ui/DogRefresh';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

// uma linha da tela = credencial salva (user+senha) e/ou conta conectada (backend), casadas por @user
type Entry = { usuario: string; senha?: string; id?: string; ativa?: boolean; criadaEm?: number };

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

  const carregar = useCallback(async () => {
    const [cs, cr] = await Promise.all([
      api.getAccounts().catch(() => [] as Account[]),
      lerCredenciais().catch(() => [] as Credencial[]),
    ]);
    setContas(cs);
    setCreds(cr);
  }, []);

  // checa (via túnel) se a sessão de cada conta ainda está viva — pesado-ish, só no abrir/refresh
  const validar = useCallback(async () => {
    setVerificando(true);
    try {
      const r = await api.validarContas();
      const m: Record<string, boolean> = {};
      for (const a of r) if (a.id) m[a.id] = !!a.sessao_ok;
      setSessoes(m);
    } catch { /* offline */ } finally { setVerificando(false); }
  }, []);

  useFocusEffect(useCallback(() => {
    carregar();
    if (!jaValidou.current) { jaValidou.current = true; validar(); }
  }, [carregar, validar]));
  const { scrollProps, dog, spacerEl } = useDogRefresh(async () => { await carregar(); await validar(); });

  const entries = useMemo<Entry[]>(() => {
    const map = new Map<string, Entry>();
    for (const c of creds) map.set(c.usuario.toLowerCase(), { usuario: c.usuario, senha: c.senha });
    for (const a of contas ?? []) {
      const k = (a.label || '').toLowerCase();
      const prev = map.get(k);
      map.set(k, {
        usuario: prev?.usuario || a.label, senha: prev?.senha,
        id: a.id, ativa: a.ativa, criadaEm: a.criada_em,
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
    try { await salvarCredencial({ usuario: u, senha: modal.senha }); fecharModal(); await carregar(); }
    catch { Alert.alert('Ops', 'Não consegui salvar a credencial.'); }
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
        </Text>

        {/* botão de adicionar no TOPO (primeiro), não no fim da lista */}
        <Botao title="Adicionar conta" cor={colors.marca} txtCor="#fff" onPress={abrirAdd} />

        {entries.length === 0 ? (
          <Text style={styles.vazio}>Nenhuma conta ainda. Adicione uma aí em cima.</Text>
        ) : entries.map((e, i) => {
          const sess = e.id ? sessoes[e.id] : undefined;      // true/false/undefined(=não checou)
          const checando = verificando && !!e.id && sess === undefined;
          const caiu = !!e.id && sess === false;
          // mesmo esquema de cor do Hub: verde SÓ na conta ativa; sessão ok = branco;
          // problema = vermelho; verificando = cinza.
          let status: string, cor: string;
          if (!e.id) { status = 'sem sessão'; cor = colors.erro; }
          else if (checando) { status = 'verificando…'; cor = colors.textoFraco; }
          else if (caiu) { status = 'sessão caiu'; cor = colors.erro; }
          else if (e.ativa) { status = 'ativa · em uso'; cor = colors.ok; }
          else { status = 'sessão ok'; cor = colors.texto; }
          const idade = e.id ? idadeTxt(e.criadaEm) : null;
          return (
          <Animated.View key={e.usuario}
            entering={FadeInDown.delay(Math.min(i, 8) * 40).duration(280)}
            layout={LinearTransition.duration(260)}>
            <Card style={{ gap: 10 }}>
              <View style={styles.topo}>
                <View style={[styles.dot, { backgroundColor: cor }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>@{e.usuario}</Text>
                  <View style={styles.subRow}>
                    <Text style={[styles.sub, { color: cor, fontWeight: '700' }]}>{status}</Text>
                    {idade ? <Text style={styles.sub}> · {idade}</Text> : null}
                  </View>
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
                    {e.id && !e.ativa && !caiu ? (
                      <TouchableOpacity onPress={() => ativar(e)} style={styles.icon} hitSlop={6}>
                        <Ionicons name="power" size={20} color={colors.texto} />
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

      <Modal visible={modal.aberto} transparent animationType="fade" onRequestClose={fecharModal}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalWrap}>
          <Pressable style={StyleSheet.absoluteFill} onPress={fecharModal} />
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
        </KeyboardAvoidingView>
      </Modal>
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
});
