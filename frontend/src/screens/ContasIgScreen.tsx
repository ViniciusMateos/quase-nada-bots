import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { api, Account, Tier } from '@/lib/api';
import { Credencial, lerCredenciais, salvarCredencial, removerCredencial } from '@/lib/credenciais';
import { colors } from '@/theme';
import { Botao, Card } from '@/ui/components';
import { LoadingDog, TelaCarregando } from '@/ui/LoadingDog';
import { useDogRefresh } from '@/ui/DogRefresh';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

// uma linha da tela = credencial salva (user+senha) e/ou conta conectada (backend), casadas por @user
type Entry = { usuario: string; senha?: string; id?: string; ativa?: boolean; tier?: Tier; criadaEm?: number };

// estágios da conta no ciclo de aquecimento (o cronograma vai decidir o que rodar por aqui)
const TIER_ORDER: Tier[] = ['nova', 'aquecendo', 'pronta', 'descanso', 'queimada'];
const TIER_META: Record<Tier, { label: string; cor: string; desc: string }> = {
  nova:      { label: 'Nova',      cor: colors.textoFraco, desc: 'recém-criada, ainda não rodou nada' },
  aquecendo: { label: 'Aquecendo', cor: colors.alerta,     desc: 'em aquecimento, volume baixo' },
  pronta:    { label: 'Pronta',    cor: colors.ok,         desc: 'aquecida, pode puxar volume (money)' },
  descanso:  { label: 'Descanso',  cor: colors.roxo,       desc: 'de molho, sem rodar por uns dias' },
  queimada:  { label: 'Queimada',  cor: colors.erro,       desc: 'tomou bloqueio/validação, evitar' },
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
  const [tierPara, setTierPara] = useState<Entry | null>(null);

  const carregar = useCallback(async () => {
    const [cs, cr] = await Promise.all([
      api.getAccounts().catch(() => [] as Account[]),
      lerCredenciais().catch(() => [] as Credencial[]),
    ]);
    setContas(cs);
    setCreds(cr);
  }, []);
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));
  const { scrollProps, dog, spacerEl } = useDogRefresh(carregar);

  const entries = useMemo<Entry[]>(() => {
    const map = new Map<string, Entry>();
    for (const c of creds) map.set(c.usuario.toLowerCase(), { usuario: c.usuario, senha: c.senha });
    for (const a of contas ?? []) {
      const k = (a.label || '').toLowerCase();
      const prev = map.get(k);
      map.set(k, {
        usuario: prev?.usuario || a.label, senha: prev?.senha,
        id: a.id, ativa: a.ativa, tier: a.tier, criadaEm: a.criada_em,
      });
    }
    return [...map.values()].sort((a, b) => a.usuario.toLowerCase().localeCompare(b.usuario.toLowerCase()));
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

  async function escolherTier(t: Tier) {
    const e = tierPara;
    setTierPara(null);
    if (!e?.id) return;
    setBusy(e.usuario);
    try { await api.definirTier(e.id, t); await carregar(); }
    catch { Alert.alert('Ops', 'Não consegui mudar o estágio.'); }
    finally { setBusy(null); }
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

        {entries.length === 0 ? (
          <Text style={styles.vazio}>Nenhuma conta ainda. Adicione uma embaixo.</Text>
        ) : entries.map((e, i) => {
          const tier = e.tier || 'nova';
          const m = TIER_META[tier];
          const idade = e.id ? idadeTxt(e.criadaEm) : null;
          const status = e.ativa ? 'ativa · os bots usam ela' : e.id ? 'conectada' : (e.senha ? 'credencial salva' : 'sem credencial');
          const sub = idade ? `${status} · ${idade}` : status;
          return (
          <Animated.View key={e.usuario}
            entering={FadeInDown.delay(Math.min(i, 8) * 40).duration(280)}
            layout={LinearTransition.duration(260)}>
            <Card style={{ gap: 10 }}>
              <View style={styles.topo}>
                <View style={[styles.dot, { backgroundColor: e.ativa ? colors.ok : colors.border }]} />
                <View style={{ flex: 1 }}>
                  <View style={styles.nomeRow}>
                    <Text style={styles.label}>@{e.usuario}</Text>
                    {e.id ? (
                      <TouchableOpacity onPress={() => setTierPara(e)} hitSlop={6}
                        style={[styles.tierChip, { borderColor: m.cor }]}>
                        <View style={[styles.tierDot, { backgroundColor: m.cor }]} />
                        <Text style={[styles.tierTxt, { color: m.cor }]}>{m.label}</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  <Text style={styles.sub}>{sub}</Text>
                </View>
                {e.ativa ? <View style={styles.badge}><Text style={styles.badgeTxt}>ATIVA</Text></View> : null}
              </View>

              <View style={styles.acoesRow}>
                <View style={{ flex: 1 }}>
                  <Botao title="Conectar" onPress={() => conectar(e)} />
                </View>
                {busy === e.usuario ? (
                  <View style={styles.spin}><LoadingDog size={22} /></View>
                ) : (
                  <>
                    {e.id && !e.ativa ? (
                      <TouchableOpacity onPress={() => ativar(e)} style={styles.icon} hitSlop={6}>
                        <Ionicons name="power" size={20} color={colors.ok} />
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

        <Botao title="Adicionar conta" cor={colors.marca} txtCor="#fff" onPress={abrirAdd} />
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

      <Modal visible={!!tierPara} transparent animationType="fade" onRequestClose={() => setTierPara(null)}>
        <Pressable style={styles.modalWrap} onPress={() => setTierPara(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitulo}>Estágio de @{tierPara?.usuario}</Text>
            <Text style={styles.modalDica}>Define o que o cronograma vai rodar nessa conta.</Text>
            {TIER_ORDER.map((t) => {
              const m = TIER_META[t];
              const sel = (tierPara?.tier || 'nova') === t;
              return (
                <TouchableOpacity key={t} onPress={() => escolherTier(t)}
                  style={[styles.tierOpt, sel && { borderColor: m.cor, backgroundColor: colors.card2 }]}>
                  <View style={[styles.tierDot, { backgroundColor: m.cor }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.tierOptLabel}>{m.label}</Text>
                    <Text style={styles.tierOptDesc}>{m.desc}</Text>
                  </View>
                  {sel ? <Ionicons name="checkmark" size={18} color={m.cor} /> : null}
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
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
  nomeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  label: { color: colors.texto, fontSize: 16, fontWeight: '700' },
  sub: { color: colors.textoFraco, fontSize: 12, marginTop: 2 },
  badge: { borderWidth: 1, borderColor: colors.ok, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  badgeTxt: { color: colors.ok, fontSize: 11, fontWeight: '800' },
  tierChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  tierDot: { width: 8, height: 8, borderRadius: 999 },
  tierTxt: { fontSize: 11, fontWeight: '700' },
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
  tierOpt: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12 },
  tierOptLabel: { color: colors.texto, fontSize: 15, fontWeight: '700' },
  tierOptDesc: { color: colors.textoFraco, fontSize: 12, marginTop: 1 },
});
