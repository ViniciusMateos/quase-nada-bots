import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/lib/api';
import { salvarCredencial, lerSenhaPadrao, salvarSenhaPadrao } from '@/lib/credenciais';
import { cmpTexto } from '@/lib/ordenar';
import { colors } from '@/theme';
import { Botao, Card } from '@/ui/components';
import { TecladoView } from '@/ui/TecladoView';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * Criar Conta NO EMULADOR (24/10/2026): migrado do painel (Playwright no PC) pro app real do IG.
 * A tela só GERA os dados e dispara o bot (POST /emulador/criar-conta); o agente do PC cria a conta
 * tocando no app (usuário → senha → nascimento → e-mail → código do Gmail → Concordo) e ela nasce
 * logada. O código de confirmação vem do Gmail sozinho. Acompanha o progresso no log da run.
 * Vale web + iPhone (não usa mais Playwright/WebView).
 */
function gerarSenha() {
  const L = 'abcdefghjkmnpqrstuvwxyz', U = 'ABCDEFGHJKLMNPQRSTUVWXYZ', D = '23456789', S = '!@#$';
  const pick = (s: string, n: number) => Array.from({ length: n }, () => s[Math.floor(Math.random() * s.length)]).join('');
  return (pick(U, 1) + pick(L, 6) + pick(D, 3) + pick(S, 1) + pick(L, 2)).split('').sort(() => Math.random() - 0.5).join('');
}
function gerarNasc() {
  return { ano: new Date().getFullYear() - (20 + Math.floor(Math.random() * 15)), dia: 1 + Math.floor(Math.random() * 28) };
}
type GmailConta = { user: string; senha_app: string };

export function CriarContaScreen() {
  const nav = useNavigation<Nav>();
  const [username, setUsername] = useState('');
  const [senha, setSenha] = useState(gerarSenha);
  const [nasc] = useState(gerarNasc);
  const [ano, setAno] = useState(String(nasc.ano));
  const [dia, setDia] = useState(String(nasc.dia));
  // senha: carrega a última usada (fica salva SÓ no aparelho) pra pré-preencher a próxima run
  useEffect(() => { lerSenhaPadrao().then((s) => { if (s) setSenha(s); }); }, []);
  const [email, setEmail] = useState('');

  const [gmails, setGmails] = useState<GmailConta[]>([]);
  const [baseEmail, setBaseEmail] = useState('');
  const [novoEmail, setNovoEmail] = useState('');
  const [novoPw, setNovoPw] = useState('');
  const [msg, setMsg] = useState('');
  const [criando, setCriando] = useState(false);

  const carregarGmails = useCallback(async () => {
    try {
      const l = await api.getGmailContas();
      const lista = Array.isArray(l) ? l : [];
      setGmails(lista);
      setBaseEmail((atual) => (atual && lista.some((c) => c.user === atual)) ? atual : (lista[0]?.user || ''));
    } catch { /* offline */ }
  }, []);

  const carregar = useCallback(async () => {
    try {
      const contas = await api.getAccounts();
      const freq: Record<string, number> = {};
      for (const c of contas) { const m = (c.label || '').match(/^(.*?)(\d+)$/); if (m) freq[m[1]] = (freq[m[1]] || 0) + 1; }
      const pfx = Object.keys(freq).sort((a, b) => freq[b] - freq[a])[0] || 'quasenadasegue';
      let n = 1;
      const re = new RegExp('^' + pfx.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\d+)$', 'i');
      for (const c of contas) { const m = (c.label || '').match(re); if (m) n = Math.max(n, parseInt(m[1], 10)); }
      setUsername((u) => u || (pfx + (n + 1)));
    } catch { setUsername((u) => u || 'quasenadasegue2'); }
    carregarGmails();
  }, [carregarGmails]);

  useEffect(() => { carregar(); }, [carregar]);

  // e-mail = base do Gmail + "+usuario" (plus-addressing; tudo cai na mesma caixa)
  useEffect(() => {
    const u = username.trim().replace(/^@/, '');
    if (u && baseEmail.includes('@')) { const [loc, dom] = baseEmail.split('@'); setEmail(`${loc}+${u}@${dom}`); }
    else setEmail('');
  }, [username, baseEmail]);

  async function addGmail() {
    const user = novoEmail.trim(), senha_app = novoPw.trim();
    if (!user.includes('@') || !senha_app) { setMsg('Põe o e-mail e a senha de app.'); return; }
    try {
      await api.addGmailConta(user, senha_app);
      setNovoEmail(''); setNovoPw(''); setMsg('');
      await carregarGmails(); setBaseEmail(user);
    } catch (e) { setMsg('Gmail: ' + ((e as Error).message || 'erro')); }
  }
  function removerGmail(user: string) {
    Alert.alert('Remover Gmail', `Remover a conta de Gmail ${user}?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: async () => { try { await api.removerGmailConta(user); await carregarGmails(); } catch { /* ok */ } } },
    ]);
  }

  const faltando = !username.trim() || !senha.trim() || !email || !ano || !dia;

  async function criar() {
    const u = username.trim().replace(/^@/, '');
    if (faltando) { setMsg('Preencha usuário, senha, nascimento e escolha o Gmail base.'); return; }
    setCriando(true); setMsg('');
    try {
      const res = await api.criarContaEmulador({ username: u, senha, email, ano: parseInt(ano, 10), dia: parseInt(dia, 10) });
      try { await salvarCredencial({ usuario: u, senha }); } catch { /* ok */ }   // pra poder reconectar depois
      try { await salvarSenhaPadrao(senha); } catch { /* ok */ }   // pré-preenche a próxima run
      nav.navigate('Run', { runId: res.run_id, nome: `Criar Conta · @${u}` });
    } catch (e) {
      setMsg((e as Error).message || 'erro ao disparar a criação');
      setCriando(false);
    }
  }

  return (
    <TecladoView style={styles.tela}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
        <Card>
          <View style={styles.infoHead}>
            <Ionicons name="information-circle-outline" size={16} color={colors.marca} />
            <Text style={styles.sec}>Como funciona</Text>
          </View>
          <Text style={styles.dica}>
            O bot cria a conta no app do Instagram no emulador: preenche usuário, senha, nascimento e
            e-mail, pega o código de confirmação do Gmail sozinho e aceita os termos. A conta nasce já
            logada no aparelho. Você acompanha cada passo no log.
          </Text>
          <Text style={[styles.dica, { color: colors.alerta }]}>
            O Instagram limita ~10 contas por aparelho. Com o seletor cheio, o botão "criar" some no app
            e o bot avisa "limite de contas" — aí é preciso sair de uma conta antiga pra abrir vaga.
          </Text>
        </Card>

        <Card>
          <Text style={styles.sec}>Dados da conta</Text>
          <Text style={styles.lbl}>Usuário (@)</Text>
          <TextInput style={styles.input} value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} placeholderTextColor={colors.textoFraco} />
          <Text style={styles.lbl}>E-mail base (Gmail) — o +alias de cada conta sai dele</Text>
          {gmails.length === 0 ? (
            <Text style={styles.dica}>Nenhum Gmail ainda. Adicione um na seção abaixo (precisa de senha de app).</Text>
          ) : (
            <View style={styles.chips}>
              {gmails.map((g) => (
                <TouchableOpacity key={g.user} onPress={() => setBaseEmail(g.user)} style={[styles.chip, baseEmail === g.user && styles.chipOn]}>
                  <Text style={[styles.chipTxt, baseEmail === g.user && { color: '#1a0511' }]}>{g.user}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <Text style={styles.lbl}>E-mail da conta (não edita)</Text>
          <View style={[styles.input, styles.readonly]}><Text style={styles.readonlyTxt} numberOfLines={1}>{email || '—'}</Text></View>
          <Text style={styles.lbl}>Senha</Text>
          <View style={styles.senhaRow}>
            <TextInput style={[styles.input, { flex: 1 }]} value={senha} onChangeText={setSenha} autoCapitalize="none" autoCorrect={false} placeholderTextColor={colors.textoFraco} />
            <TouchableOpacity onPress={() => setSenha(gerarSenha())} style={styles.gerar} hitSlop={8}>
              <Ionicons name="refresh" size={18} color={colors.marca} />
            </TouchableOpacity>
          </View>
          <Text style={styles.lbl}>Nascimento (ano / dia — o mês o app escolhe)</Text>
          <View style={styles.row}>
            <TextInput style={[styles.input, { flex: 1 }]} value={ano} onChangeText={setAno} keyboardType="number-pad" placeholder="ano" placeholderTextColor={colors.textoFraco} />
            <TextInput style={[styles.input, { flex: 1 }]} value={dia} onChangeText={setDia} keyboardType="number-pad" placeholder="dia" placeholderTextColor={colors.textoFraco} />
          </View>
          {!!msg && <Text style={[styles.dica, { color: colors.erro }]}>{msg}</Text>}
          <View style={{ marginTop: 14 }}>
            <Botao title={criando ? 'Disparando…' : 'Criar conta no emulador'} onPress={criar} disabled={faltando || criando} loading={criando} />
          </View>
        </Card>

        <Card>
          <Text style={styles.sec}>Contas de Gmail ({gmails.length})</Text>
          {gmails.length === 0
            ? <Text style={styles.dica}>Nenhuma. Adicione o Gmail + a senha de app (não a senha normal; precisa de 2FA + IMAP ligados).</Text>
            : gmails.map((g) => (
              <View key={g.user} style={styles.credRow}>
                <Text style={styles.credUser} numberOfLines={1}>{g.user}</Text>
                <TouchableOpacity onPress={() => removerGmail(g.user)} style={styles.credBtn} hitSlop={6}>
                  <Text style={[styles.credBtnTxt, { color: colors.erro }]}>remover</Text>
                </TouchableOpacity>
              </View>
            ))}
          <Text style={styles.lbl}>Adicionar conta de Gmail</Text>
          <TextInput style={styles.input} value={novoEmail} onChangeText={setNovoEmail} autoCapitalize="none" keyboardType="email-address" placeholder="seuemail@gmail.com" placeholderTextColor={colors.textoFraco} />
          <TextInput style={[styles.input, { marginTop: 8 }]} value={novoPw} onChangeText={setNovoPw} autoCapitalize="none" placeholder="senha de app (16 letras)" placeholderTextColor={colors.textoFraco} />
          <View style={{ marginTop: 10 }}><Botao title="Adicionar Gmail" cor={colors.card2} txtCor={colors.texto} onPress={addGmail} /></View>
          <Text style={styles.dica}>Senha de app: gere em myaccount.google.com/apppasswords (com 2FA ligado) e ligue o IMAP no Gmail.</Text>
        </Card>
      </ScrollView>
    </TecladoView>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.bg },
  infoHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  sec: { color: colors.textoFraco, fontSize: 12, fontWeight: '700', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  lbl: { color: colors.textoFraco, fontSize: 12.5, fontWeight: '600', marginTop: 10, marginBottom: 4 },
  input: { backgroundColor: colors.card2, borderWidth: 1, borderColor: colors.border, color: colors.texto, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  readonly: { justifyContent: 'center' },
  readonlyTxt: { color: colors.textoFraco, fontSize: 15 },
  row: { flexDirection: 'row', gap: 10 },
  senhaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gerar: { padding: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: colors.card2, borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12 },
  chipOn: { backgroundColor: colors.marca, borderColor: colors.marca },
  chipTxt: { color: colors.texto, fontSize: 13, fontWeight: '700' },
  dica: { color: colors.textoFraco, fontSize: 12.5, lineHeight: 18, marginTop: 8 },
  credRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: colors.border },
  credUser: { color: colors.texto, fontSize: 15, fontWeight: '700', flex: 1 },
  credBtn: { paddingVertical: 4, paddingHorizontal: 2 },
  credBtnTxt: { color: colors.marca, fontSize: 12.5, fontWeight: '700' },
});
