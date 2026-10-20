import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors } from '@/theme';
import { Botao, Card } from '@/ui/components';
import { TecladoView } from '@/ui/TecladoView';
import { salvarCredencial } from '@/lib/credenciais';

/**
 * "Criar Conta" como se fosse um bot (só na web). Gera os dados, abre o CADASTRO do Instagram
 * preenchido num Chromium (via helper local do painel-sessao), pega o código no Gmail sozinho,
 * aplica bio + foto no perfil e registra a conta. Os dados (senha, nome, nascimento, bio, foto)
 * são lembrados: na 1ª vez você preenche, nas próximas já vêm sugeridos com o último valor.
 */
const PAINEL = (process.env.EXPO_PUBLIC_PAINEL_URL || 'http://127.0.0.1:8777').replace(/\/$/, '');

type Fase = 'idle' | 'abrindo' | 'logando' | 'detectado' | 'enviando' | 'salvo' | 'erro';
type Grupo = { nome: string; contas: string[] };
type GmailConta = { user: string; senha_app: string };

const NOMES = ['Ana', 'Bruna', 'Carla', 'Dani', 'Elaine', 'Fernanda', 'Gabi', 'Helena', 'Isa', 'Julia', 'Kelly', 'Larissa', 'Marina', 'Nina', 'Paula', 'Rafa', 'Sara', 'Tais', 'Vivi', 'Yara', 'Bia', 'Lia', 'Duda', 'Manu'];
const SOBRE = ['Souza', 'Lima', 'Costa', 'Alves', 'Rocha', 'Melo', 'Dias', 'Pires', 'Ramos', 'Teixeira', 'Moraes', 'Barros', 'Nunes', 'Freitas', 'Cardoso', 'Campos', 'Pinto', 'Vieira'];
const rnd = (a: string[]) => a[Math.floor(Math.random() * a.length)];

function gerarSenha() {
  const L = 'abcdefghjkmnpqrstuvwxyz', U = 'ABCDEFGHJKLMNPQRSTUVWXYZ', D = '23456789', S = '!@#$';
  const pick = (s: string, n: number) => Array.from({ length: n }, () => s[Math.floor(Math.random() * s.length)]).join('');
  return (pick(U, 1) + pick(L, 6) + pick(D, 3) + pick(S, 1) + pick(L, 2)).split('').sort(() => Math.random() - 0.5).join('');
}
function gerarNasc() {
  const ano = new Date().getFullYear() - (20 + Math.floor(Math.random() * 15));
  return { dia: 1 + Math.floor(Math.random() * 28), mes: 1 + Math.floor(Math.random() * 12), ano };
}
function lsGet(k: string) { try { return localStorage.getItem(k) || ''; } catch { return ''; } }
function lsSet(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* sem storage */ } }

async function px(path: string, body?: unknown) {
  const r = await fetch(`${PAINEL}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((d as { detail?: string }).detail || r.statusText);
  return d;
}

// redimensiona a foto (canvas) pra não estourar o storage nem o upload
function resizeFoto(dataUrl: string, max: number): Promise<string> {
  return new Promise((res) => {
    const img = new window.Image();
    img.onload = () => {
      let w = img.width, h = img.height;
      const s = Math.max(w, h) > max ? max / Math.max(w, h) : 1;
      w = Math.round(w * s); h = Math.round(h * s);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const ctx = c.getContext('2d'); if (!ctx) return res(dataUrl);
      ctx.drawImage(img, 0, 0, w, h);
      try { res(c.toDataURL('image/jpeg', 0.9)); } catch { res(dataUrl); }
    };
    img.onerror = () => res(dataUrl);
    img.src = dataUrl;
  });
}

export function CriarContaScreen() {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [grupo, setGrupo] = useState('');
  const [msg, setMsg] = useState('');

  const [gmails, setGmails] = useState<GmailConta[]>([]);
  const [baseEmail, setBaseEmail] = useState('');
  const [gReveal, setGReveal] = useState<Record<string, boolean>>({});
  const [novoEmail, setNovoEmail] = useState('');
  const [novoPw, setNovoPw] = useState('');

  const [username, setUsername] = useState('');
  const [senha, setSenha] = useState('');
  const [email, setEmail] = useState('');
  const [nome, setNome] = useState('');
  const [dia, setDia] = useState(''); const [mes, setMes] = useState(''); const [ano, setAno] = useState('');
  const [bio, setBio] = useState('');
  const [foto, setFoto] = useState('');   // data URL

  const [fase, setFase] = useState<Fase>('idle');
  const [estado, setEstadoTxt] = useState('');
  const label = useRef<string | null>(null);
  const pollT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const codT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const codFeito = useRef(false);

  const gmailOn = gmails.length > 0;

  const carregarGmails = useCallback(async () => {
    try {
      const l = await px('/api/gmail/contas') as GmailConta[];
      const lista = Array.isArray(l) ? l : [];
      setGmails(lista);
      setBaseEmail((atual) => (atual && lista.some((c) => c.user === atual)) ? atual : (lista[0]?.user || ''));
    } catch { /* offline */ }
  }, []);

  const carregar = useCallback(async () => {
    try { const gs = await px('/api/grupos') as Grupo[]; setGrupos(Array.isArray(gs) ? gs : []); } catch { /* offline */ }
    // sugere o @ sozinho: prefixo mais comum das contas + próximo número
    try {
      const contas = await px('/api/contas') as { label?: string }[];
      const freq: Record<string, number> = {};
      for (const c of contas) { const m = (c.label || '').match(/^(.*?)(\d+)$/); if (m) freq[m[1]] = (freq[m[1]] || 0) + 1; }
      let pfx = Object.keys(freq).sort((a, b) => freq[b] - freq[a])[0] || 'quasenadasegue', n = 1;
      const re = new RegExp('^' + pfx.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\d+)$', 'i');
      for (const c of contas) { const m = (c.label || '').match(re); if (m) n = Math.max(n, parseInt(m[1], 10)); }
      setUsername((u) => u || (pfx + (n + 1)));
    } catch { setUsername((u) => u || 'quasenadasegue2'); }
    // sugestões lembradas da última run; senha/nome/nascimento geram se for a 1ª vez
    setSenha((s) => s || lsGet('qn_senha') || gerarSenha());
    setNome((x) => x || lsGet('qn_nome') || `${rnd(NOMES)} ${rnd(SOBRE)}`);
    try { const nb = JSON.parse(lsGet('qn_nasc') || '{}'); if (nb.dia) { setDia(String(nb.dia)); setMes(String(nb.mes)); setAno(String(nb.ano)); } else { const g = gerarNasc(); setDia(String(g.dia)); setMes(String(g.mes)); setAno(String(g.ano)); } } catch { const g = gerarNasc(); setDia(String(g.dia)); setMes(String(g.mes)); setAno(String(g.ano)); }
    if (lsGet('qn_bio')) setBio(lsGet('qn_bio'));
    if (lsGet('qn_foto')) setFoto(lsGet('qn_foto'));
    else { try { const uf = await px('/api/criar/ultima-foto') as { dataUrl?: string }; if (uf?.dataUrl) setFoto(uf.dataUrl); } catch { /* sem foto */ } }
    carregarGmails();
  }, [carregarGmails]);

  // email é sempre derivado do @ + Gmail base
  useEffect(() => {
    const u = username.trim().replace(/^@/, '');
    if (u && baseEmail && baseEmail.indexOf('@') >= 0) { const [loc, dom] = baseEmail.split('@'); setEmail(`${loc}+${u}@${dom}`); }
    else setEmail('');
  }, [username, baseEmail]);

  useEffect(() => { carregar(); return () => { if (pollT.current) clearTimeout(pollT.current); if (codT.current) clearTimeout(codT.current); }; }, [carregar]);

  async function addGmail() {
    const user = novoEmail.trim(), senha_app = novoPw.trim();
    if (!user || user.indexOf('@') < 0 || !senha_app) { setMsg('Põe o email e a senha de app.'); return; }
    try {
      await px('/api/gmail/contas', { user, senha_app });
      setNovoEmail(''); setNovoPw(''); setMsg('');
      await carregarGmails(); setBaseEmail(user);
    } catch (e) { setMsg('Gmail: ' + ((e as Error).message || 'erro')); }
  }
  async function removerGmail(user: string) {
    if (typeof window !== 'undefined' && !window.confirm(`Remover a conta de Gmail ${user}?`)) return;
    try { await px('/api/gmail/remover', { user }); await carregarGmails(); } catch { /* ok */ }
  }

  function escolherFoto() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const out = await resizeFoto(String(reader.result), 640);
        setFoto(out); lsSet('qn_foto', out);
      };
      reader.readAsDataURL(f);
    };
    inp.click();
  }

  function recalcEmail(user: string, base: string) {
    if (!base || base.indexOf('@') < 0) return '';
    const [loc, dom] = base.split('@');
    return `${loc}+${user}@${dom}`;
  }

  function setEstado(f: Fase, txt: string) { setFase(f); setEstadoTxt(txt); }

  function poll() {
    if (pollT.current) clearTimeout(pollT.current);
    const tick = async () => {
      if (!label.current) return;
      try {
        const s = await px('/api/status?label=' + encodeURIComponent(label.current)) as { aberto?: boolean; sessionid?: boolean };
        if (!s.aberto) { setEstado('erro', 'A janela foi fechada. Clique em Recomeçar.'); return; }
        if (s.sessionid) setEstado('detectado', 'conta logada — pode clicar em Salvar conta.');
        else if (fase !== 'detectado') setEstado('logando', gmailOn ? 'faça o cadastro; o código vem do email sozinho…' : 'faça o cadastro na janela que abriu…');
      } catch { /* ignore */ }
      pollT.current = setTimeout(tick, 2500);
    };
    pollT.current = setTimeout(tick, 2000);
  }
  function pollCodigo() {
    if (codT.current) clearTimeout(codT.current);
    codFeito.current = false;
    const tick = async () => {
      if (!label.current || codFeito.current) return;
      try {
        const r = await px('/api/gmail/codigo?alias=' + encodeURIComponent(email)) as { code?: string | null };
        if (r.code) {
          const res = await px('/api/criar/codigo', { label: label.current, code: r.code }) as { ok?: boolean };
          if (res.ok) { codFeito.current = true; setEstado('logando', `código ${r.code} pego do email e preenchido — confere e finaliza.`); return; }
        }
      } catch { /* sem código ainda */ }
      codT.current = setTimeout(tick, 6000);
    };
    codT.current = setTimeout(tick, 8000);
  }

  const faltando = !username.trim() || !senha.trim() || !nome.trim() || !dia || !mes || !ano || !bio.trim() || !foto;

  async function abrir() {
    const u = username.trim().replace(/^@/, '');
    if (faltando) { setMsg('Preencha tudo (inclui bio e foto) pra rodar.'); return; }
    label.current = u;
    // lembra os valores pra próxima run
    lsSet('qn_senha', senha); lsSet('qn_nome', nome); lsSet('qn_bio', bio);
    lsSet('qn_nasc', JSON.stringify({ dia, mes, ano })); lsSet('qn_foto', foto);
    // credencial só é salva DEPOIS que a conta é criada de verdade (no salvar), pra não aparecer
    // na lista de Contas sem a conta existir.
    try { await px('/api/criar/foto', { label: u, dataUrl: foto }); } catch { /* segue sem foto */ }
    setEstado('abrindo', 'abrindo o cadastro…'); setMsg('');
    try {
      await px('/api/criar/abrir', { username: u, senha, email, nome, dia, mes, ano });
      setEstado('logando', gmailOn ? 'faça o cadastro; o código vem do email sozinho…' : 'faça o cadastro na janela que abriu…');
      poll(); if (gmailOn) pollCodigo();
    } catch (e) { setEstado('erro', (e as Error).message || 'erro ao abrir o cadastro'); }
  }

  async function salvar() {
    if (!label.current) return;
    setEstado('enviando', 'aplicando bio + foto e registrando a conta…');
    try {
      try { await px('/api/criar/perfil', { label: label.current, bio }); } catch { /* best-effort */ }
      const res = await px('/api/conectar', { label: label.current, senha }) as { conta?: { id?: string } };
      const id = res.conta?.id;
      try { await salvarCredencial({ usuario: (label.current || '').replace(/^@/, ''), senha }); } catch { /* ok */ }   // conta criada → salva a credencial
      if (id && grupo) { try { await px('/api/grupo-add', { nome: grupo, id }); } catch { /* ok */ } }
      if (pollT.current) clearTimeout(pollT.current); if (codT.current) clearTimeout(codT.current);
      setEstado('salvo', `conta @${label.current} criada e registrada${grupo ? ` no grupo ${grupo}` : ''}.`);
      label.current = null;
    } catch (e) { setEstado('erro', (e as Error).message || 'erro ao salvar'); }
  }

  async function recomecar() {
    if (!label.current) return;
    setEstado('abrindo', 'reabrindo o cadastro do zero…');
    try {
      await px('/api/criar/abrir', { username: label.current, senha, email, nome, dia, mes, ano });
      setEstado('logando', 'faça o cadastro na janela que abriu…'); poll(); if (gmailOn) pollCodigo();
    } catch (e) { setEstado('erro', (e as Error).message || 'erro'); }
  }

  function copiar(s: string) { try { navigator.clipboard?.writeText(s); } catch { /* ok */ } }

  const corEstado = fase === 'detectado' || fase === 'salvo' ? colors.ok : fase === 'erro' ? colors.erro : colors.textoFraco;
  const fluxoAtivo = fase !== 'idle';

  return (
    <TecladoView style={styles.tela}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
        {/* dados da conta — tudo num card só */}
        <Card>
          <Text style={styles.sec}>Dados da conta</Text>
          <Campo l="Usuário (@)" v={username} set={setUsername} />
          <Text style={styles.lbl}>Email base (Gmail) — o +alias de cada conta sai dele</Text>
          {gmails.length === 0 ? (
            <Text style={styles.dica}>Nenhuma conta de Gmail ainda. Adicione uma na seção "Contas de Gmail" abaixo.</Text>
          ) : (
            <View style={styles.chips}>
              {gmails.map((g) => <Chip key={g.user} txt={g.user} on={baseEmail === g.user} onPress={() => setBaseEmail(g.user)} />)}
            </View>
          )}
          <Text style={styles.lbl}>Email da conta (do Gmail — não edita)</Text>
          <View style={[styles.input, styles.readonly]}><Text style={styles.readonlyTxt} numberOfLines={1}>{email || '—'}</Text></View>
          <Campo l="Senha" v={senha} set={setSenha} />
          <Campo l="Nome de exibição" v={nome} set={setNome} />
          <Text style={styles.lbl}>Nascimento (pra você preencher na tela do aniversário)</Text>
          <View style={styles.row}>
            <TextInput style={[styles.input, { flex: 1 }]} value={dia} onChangeText={setDia} keyboardType="number-pad" placeholder="dia" placeholderTextColor={colors.textoFraco} />
            <TextInput style={[styles.input, { flex: 1 }]} value={mes} onChangeText={setMes} keyboardType="number-pad" placeholder="mês (nº)" placeholderTextColor={colors.textoFraco} />
            <TextInput style={[styles.input, { flex: 1 }]} value={ano} onChangeText={setAno} keyboardType="number-pad" placeholder="ano" placeholderTextColor={colors.textoFraco} />
          </View>
          <Text style={styles.lbl}>Bio</Text>
          <TextInput style={[styles.input, { minHeight: 68, textAlignVertical: 'top' }]} value={bio} onChangeText={setBio} multiline placeholder="bio do perfil" placeholderTextColor={colors.textoFraco} />
          <Text style={styles.lbl}>Foto de perfil</Text>
          <View style={styles.fotoRow}>
            {foto ? <Image source={{ uri: foto }} style={styles.fotoPrev} /> : <View style={[styles.fotoPrev, { backgroundColor: colors.card2 }]} />}
            <View style={{ flex: 1 }}><Botao title={foto ? 'Trocar foto' : 'Escolher foto'} cor={colors.card2} txtCor={colors.texto} onPress={escolherFoto} /></View>
          </View>
          <Text style={styles.lbl}>Grupo</Text>
          <View style={styles.chips}>
            <Chip txt="Nenhum" on={grupo === ''} onPress={() => setGrupo('')} />
            {grupos.map((g) => <Chip key={g.nome} txt={g.nome} on={grupo === g.nome} onPress={() => setGrupo(g.nome)} />)}
          </View>
          {!!msg && <Text style={[styles.dica, { color: colors.erro }]}>{msg}</Text>}
          {faltando && <Text style={[styles.dica, { color: colors.alerta }]}>Preencha tudo (inclui bio e foto) pra liberar o cadastro.</Text>}
          <View style={{ marginTop: 14 }}><Botao title="Abrir cadastro preenchido" onPress={abrir} disabled={fase === 'abrindo' || fase === 'enviando' || faltando} /></View>
        </Card>

        {/* Contas de Gmail (gerenciar) */}
        <Card>
          <Text style={styles.sec}>Contas de Gmail ({gmails.length})</Text>
          {gmails.length === 0
            ? <Text style={styles.dica}>Nenhuma. Adicione o Gmail + a senha de app (não a senha normal; precisa de 2FA + IMAP ligados).</Text>
            : gmails.map((g) => {
              const on = !!gReveal[g.user];
              return (
                <View key={g.user} style={styles.credRow}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.credUser} numberOfLines={1}>{g.user}</Text>
                    <Text style={styles.credSenha} numberOfLines={1}>{on ? g.senha_app : '•'.repeat(12)}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setGReveal((r) => ({ ...r, [g.user]: !on }))} style={styles.credBtn}><Text style={styles.credBtnTxt}>{on ? 'ocultar' : 'ver'}</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => copiar(g.senha_app)} style={styles.credBtn}><Text style={styles.credBtnTxt}>copiar</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => removerGmail(g.user)} style={styles.credBtn}><Text style={[styles.credBtnTxt, { color: colors.erro }]}>remover</Text></TouchableOpacity>
                </View>
              );
            })}
          <Text style={styles.lbl}>Adicionar conta de Gmail</Text>
          <TextInput style={styles.input} value={novoEmail} onChangeText={setNovoEmail} autoCapitalize="none" keyboardType="email-address" placeholder="seuemail@gmail.com" placeholderTextColor={colors.textoFraco} />
          <TextInput style={[styles.input, { marginTop: 8 }]} value={novoPw} onChangeText={setNovoPw} autoCapitalize="none" placeholder="senha de app (16 letras)" placeholderTextColor={colors.textoFraco} />
          <View style={{ marginTop: 10 }}><Botao title="Adicionar Gmail" cor={colors.card2} txtCor={colors.texto} onPress={addGmail} /></View>
          <Text style={styles.dica}>Senha de app: gere em myaccount.google.com/apppasswords (com 2FA ligado) e ligue o IMAP no Gmail. Fica só na sua máquina.</Text>
        </Card>

        {/* 3 · cadastro */}
        {fluxoAtivo && (
          <Card>
            <Text style={styles.sec}>3 · Cadastro</Text>
            <Passo n="1" t="Abriu uma janela no cadastro do IG, já preenchido. Confere e clica em Inscreva-se." />
            <Passo n="2" t="No aniversário, usa os valores gerados. Resolve o captcha se pedir." />
            <Passo n="3" t={gmailOn ? 'O código do email é pego e preenchido sozinho.' : 'Pega o código no seu email e digita na janela.'} />
            <Passo n="4" t="Quando estiver dentro da conta, volta aqui e clica em Salvar conta (aplica bio + foto e registra)." />
            <View style={[styles.estado, { borderColor: corEstado }]}>
              <Text style={[styles.estadoTxt, { color: corEstado }]}>{estado}</Text>
            </View>
            {fase !== 'salvo' && (
              <>
                <Botao title={fase === 'enviando' ? 'Salvando…' : 'Salvar conta'} onPress={salvar} disabled={fase === 'abrindo' || fase === 'enviando'} />
                <View style={{ marginTop: 10 }}><Botao title="Recomeçar do zero (limpar)" cor={colors.card2} txtCor={colors.texto} onPress={recomecar} /></View>
              </>
            )}
          </Card>
        )}
      </ScrollView>
    </TecladoView>
  );
}

function Campo({ l, v, set }: { l: string; v: string; set: (t: string) => void }) {
  return (
    <>
      <Text style={styles.lbl}>{l}</Text>
      <TextInput style={styles.input} value={v} onChangeText={set} autoCapitalize="none" autoCorrect={false} placeholderTextColor={colors.textoFraco} />
    </>
  );
}
function Chip({ txt, on, onPress }: { txt: string; on: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipTxt, on && { color: '#1a0511' }]}>{txt}</Text>
    </TouchableOpacity>
  );
}
function Passo({ n, t }: { n: string; t: string }) {
  return (
    <View style={styles.passo}>
      <View style={styles.passoN}><Text style={styles.passoNTxt}>{n}</Text></View>
      <Text style={styles.passoTxt}>{t}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.bg },
  sec: { color: colors.textoFraco, fontSize: 12, fontWeight: '700', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  lbl: { color: colors.textoFraco, fontSize: 12.5, fontWeight: '600', marginTop: 10, marginBottom: 4 },
  input: { backgroundColor: colors.card2, borderWidth: 1, borderColor: colors.border, color: colors.texto, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  readonly: { justifyContent: 'center' },
  readonlyTxt: { color: colors.textoFraco, fontSize: 15 },
  row: { flexDirection: 'row', gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: colors.card2, borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12 },
  chipOn: { backgroundColor: colors.marca, borderColor: colors.marca },
  chipTxt: { color: colors.texto, fontSize: 13, fontWeight: '700' },
  dica: { color: colors.textoFraco, fontSize: 12.5, lineHeight: 18, marginTop: 8 },
  fotoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fotoPrev: { width: 64, height: 64, borderRadius: 32, borderWidth: 1, borderColor: colors.border },
  estado: { backgroundColor: colors.card2, borderWidth: 1, borderRadius: 11, paddingVertical: 11, paddingHorizontal: 13, marginVertical: 12 },
  estadoTxt: { fontSize: 13.5, fontWeight: '600' },
  passo: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 7 },
  passoN: { width: 21, height: 21, borderRadius: 11, backgroundColor: colors.card2, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  passoNTxt: { color: colors.texto, fontSize: 11, fontWeight: '700' },
  passoTxt: { color: colors.textoFraco, fontSize: 13.5, lineHeight: 19, flex: 1 },
  credRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: colors.border },
  credUser: { color: colors.texto, fontSize: 15, fontWeight: '700' },
  credSenha: { color: colors.textoFraco, fontSize: 13, fontFamily: 'monospace', marginTop: 2 },
  credBtn: { paddingVertical: 4, paddingHorizontal: 2 },
  credBtnTxt: { color: colors.marca, fontSize: 12.5, fontWeight: '700' },
});
