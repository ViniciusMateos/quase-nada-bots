import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as SecureStore from 'expo-secure-store';
import * as ImagePicker from 'expo-image-picker';
import { api, Grupo, IgCookie } from '@/lib/api';
import { salvarCredencial } from '@/lib/credenciais';
import { garantirLA } from '@/lib/la';
import { colors } from '@/theme';
import { Botao, Card } from '@/ui/components';
import { LoadingDog } from '@/ui/LoadingDog';
import { TecladoView } from '@/ui/TecladoView';
import type { RootStackParamList } from '@/navigation/RootNavigator';

/**
 * "Criar Conta" NATIVO (iPhone) — igual ao do PC: gerenciador de contas de Gmail (via backend),
 * campos de bio + foto, sem botão "Gerar", e o CÓDIGO do email é lido pelo backend (IMAP) e
 * preenchido sozinho no WebView. Bio + foto são aplicados pelo backend (instagrapi) depois que a
 * sessão é capturada. Captcha e aniversário continuam na mão (no WebView).
 */
type Nav = NativeStackNavigationProp<RootStackParamList>;
type GmailConta = { user: string; senha_app: string };
const SIGNUP_URL = 'https://www.instagram.com/accounts/emailsignup/';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

type RawCookie = { name: string; value: string; domain?: string; path?: string; secure?: boolean; httpOnly?: boolean };
type CookieMgr = { get: (url: string, useWebKit?: boolean) => Promise<Record<string, RawCookie>>; clearAll: (useWebKit?: boolean) => Promise<boolean>; };
let CookieManager: CookieMgr | null = null;
try { const mod = require('@react-native-cookies/cookies'); CookieManager = (mod && mod.default ? mod.default : mod) as CookieMgr; } catch { CookieManager = null; }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const NOMES = ['Ana', 'Bruna', 'Carla', 'Dani', 'Elaine', 'Fernanda', 'Gabi', 'Helena', 'Isa', 'Julia', 'Kelly', 'Larissa', 'Marina', 'Nina', 'Paula', 'Rafa', 'Sara', 'Tais', 'Vivi', 'Yara', 'Bia', 'Lia', 'Duda', 'Manu'];
const SOBRE = ['Souza', 'Lima', 'Costa', 'Alves', 'Rocha', 'Melo', 'Dias', 'Pires', 'Ramos', 'Teixeira', 'Moraes', 'Barros', 'Nunes', 'Freitas', 'Cardoso', 'Campos', 'Pinto', 'Vieira'];
const rnd = (a: string[]) => a[Math.floor(Math.random() * a.length)];
function gerarSenha() {
  const L = 'abcdefghjkmnpqrstuvwxyz', U = 'ABCDEFGHJKLMNPQRSTUVWXYZ', D = '23456789', S = '!@#$';
  const pick = (s: string, n: number) => Array.from({ length: n }, () => s[Math.floor(Math.random() * s.length)]).join('');
  return (pick(U, 1) + pick(L, 6) + pick(D, 3) + pick(S, 1) + pick(L, 2)).split('').sort(() => Math.random() - 0.5).join('');
}
function gerarNasc() { const ano = new Date().getFullYear() - (20 + Math.floor(Math.random() * 15)); return { dia: 1 + Math.floor(Math.random() * 28), mes: 1 + Math.floor(Math.random() * 12), ano }; }
async function ssGet(k: string) { try { return (await SecureStore.getItemAsync(k)) || ''; } catch { return ''; } }
function ssSet(k: string, v: string) { SecureStore.setItemAsync(k, v).catch(() => { /* local */ }); }

export function CriarContaScreen() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const [fase, setFase] = useState<'form' | 'web'>('form');

  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [grupo, setGrupo] = useState('');
  const [gmails, setGmails] = useState<GmailConta[]>([]);
  const [baseEmail, setBaseEmail] = useState('');
  const [gReveal, setGReveal] = useState<Record<string, boolean>>({});
  const [novoEmail, setNovoEmail] = useState('');
  const [novoPw, setNovoPw] = useState('');
  const [msg, setMsg] = useState('');

  const [username, setUsername] = useState('');
  const [senha, setSenha] = useState('');
  const [email, setEmail] = useState('');
  const [nome, setNome] = useState('');
  const [dia, setDia] = useState(''); const [mes, setMes] = useState(''); const [ano, setAno] = useState('');
  const [bio, setBio] = useState('');
  const [foto, setFoto] = useState('');   // data URL

  const [limpo, setLimpo] = useState(false);
  const [carregandoPagina, setCarregandoPagina] = useState(true);
  const [status, setStatus] = useState<'idle' | 'capturando' | 'erro'>('idle');
  const [codMsg, setCodMsg] = useState('');
  const jaCapturou = useRef(false);
  const webRef = useRef<WebView>(null);
  const codT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const codFeito = useRef(false);

  const gmailOn = gmails.length > 0;

  const carregarGmails = useCallback(async () => {
    try {
      const l = await api.getGmailContas();
      const lista = Array.isArray(l) ? l : [];
      setGmails(lista);
      setBaseEmail((a) => (a && lista.some((c) => c.user === a)) ? a : (lista[0]?.user || ''));
    } catch { /* offline */ }
  }, []);

  function recalcEmail(user: string, base: string) {
    if (!base || base.indexOf('@') < 0) return '';
    const [loc, dom] = base.split('@'); return `${loc}+${user}@${dom}`;
  }

  // sugere o @ sozinho: deduz o prefixo mais comum das contas que já existem + próximo número.
  const sugerirUsuario = useCallback(async () => {
    let pfx = 'quasenadasegue', n = 1;
    try {
      const contas = await api.getAccounts();
      const freq: Record<string, number> = {};
      for (const c of contas) { const m = (c.label || '').match(/^(.*?)(\d+)$/); if (m) freq[m[1]] = (freq[m[1]] || 0) + 1; }
      const top = Object.keys(freq).sort((a, b) => freq[b] - freq[a])[0];
      if (top) pfx = top;
      const re = new RegExp('^' + pfx.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\d+)$', 'i');
      for (const c of contas) { const m = (c.label || '').match(re); if (m) n = Math.max(n, parseInt(m[1], 10)); }
      n += 1;
    } catch { n = 2; }
    setUsername((u) => u || (pfx + n));   // não sobrescreve se você já editou
  }, []);

  useEffect(() => {
    (async () => {
      try { setGrupos(await api.getGrupos()); } catch { /* offline */ }
      const s = await ssGet('qn_senha'); setSenha(s || gerarSenha());
      const nm = await ssGet('qn_nome'); setNome(nm || `${rnd(NOMES)} ${rnd(SOBRE)}`);
      try { const nb = JSON.parse((await ssGet('qn_nasc')) || '{}'); if (nb.dia) { setDia(String(nb.dia)); setMes(String(nb.mes)); setAno(String(nb.ano)); } else { const g = gerarNasc(); setDia(String(g.dia)); setMes(String(g.mes)); setAno(String(g.ano)); } } catch { const g = gerarNasc(); setDia(String(g.dia)); setMes(String(g.mes)); setAno(String(g.ano)); }
      const b = await ssGet('qn_bio'); if (b) setBio(b);
      try { const uf = await api.getUltimaFoto(); if (uf?.dataUrl) setFoto((f) => f || uf.dataUrl); } catch { /* sem foto salva */ }
      await carregarGmails();
      sugerirUsuario();
    })();
    return () => { if (codT.current) clearTimeout(codT.current); };
  }, [carregarGmails, sugerirUsuario]);

  // email é sempre derivado do @ + Gmail base (não edita direto)
  useEffect(() => { setEmail(recalcEmail(username.trim().replace(/^@/, ''), baseEmail)); }, [username, baseEmail]);

  async function addGmail() {
    const user = novoEmail.trim(), senha_app = novoPw.trim();
    if (!user || user.indexOf('@') < 0 || !senha_app) { setMsg('Põe o email e a senha de app.'); return; }
    try { await api.addGmailConta(user, senha_app); setNovoEmail(''); setNovoPw(''); setMsg(''); await carregarGmails(); setBaseEmail(user); }
    catch (e) { setMsg('Gmail: ' + ((e as Error).message || 'erro')); }
  }
  async function removerGmail(user: string) {
    try { await api.removerGmailConta(user); await carregarGmails(); } catch { /* ok */ }
  }

  async function escolherFoto() {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { setMsg('Libera o acesso às fotos pra escolher a foto.'); return; }
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.8, base64: true });
      if (r.canceled || !r.assets?.length) return;
      const a = r.assets[0];
      if (a.base64) setFoto(`data:image/jpeg;base64,${a.base64}`);
    } catch { setMsg('Não consegui abrir a galeria.'); }
  }

  const faltando = !username.trim() || !senha.trim() || !nome.trim() || !dia || !mes || !ano || !bio.trim() || !foto;

  async function abrir() {
    if (faltando) { setMsg('Preencha tudo (inclui bio e foto) pra rodar.'); return; }
    ssSet('qn_senha', senha); ssSet('qn_nome', nome); ssSet('qn_nasc', JSON.stringify({ dia, mes, ano })); ssSet('qn_bio', bio);
    // a credencial só é salva DEPOIS que a conta é criada de verdade (no capturar) — senão ela
    // apareceria na lista de Contas mesmo sem a conta existir.
    setLimpo(false);
    if (CookieManager) { await Promise.all([CookieManager.clearAll(true).catch(() => false), CookieManager.clearAll(false).catch(() => false)]); }
    setLimpo(true); setFase('web'); setStatus('idle'); setMsg(''); setCodMsg('');
    codFeito.current = false;
  }

  const injecao = `
    (function(){
      if (window.__qnSignup) return; window.__qnSignup = true;
      var E=${JSON.stringify(email)}, N=${JSON.stringify(nome)}, U=${JSON.stringify(username.replace(/^@/, ''))}, P=${JSON.stringify(senha)};
      var DIA=${JSON.stringify(String(dia))}, MES=${JSON.stringify(String(mes))}, ANO=${JSON.stringify(String(ano))};
      var sv=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
      function q(list){for(var i=0;i<list.length;i++){var el=document.querySelector(list[i]);if(el)return el;}return null;}
      function fillEl(el,val){if(el&&val&&!el.__qn&&!el.value){el.__qn=true;sv.call(el,val);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}}
      function fillOver(el,val){if(el&&val&&(el.__qtry||0)<8&&el.value!==val){el.__qtry=(el.__qtry||0)+1;sv.call(el,val);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}}
      var EMAIL=['input[name="emailOrPhone"]','input[type="email"]','input[autocomplete="email"]'];
      function selData(){
        var ss=[].slice.call(document.querySelectorAll('select'));
        ss.forEach(function(s){if(s.__qn||!s.options||!s.options.length)return;
          var nopt=s.options.length,done=false;
          var lab=((s.getAttribute('title')||'')+' '+(s.getAttribute('aria-label')||'')).toLowerCase();
          function pick(v){for(var i=0;i<nopt;i++){if((s.options[i].text||'').trim()===String(v)){s.selectedIndex=i;return true;}}return false;}
          var ehMes=(lab.indexOf('mês')>=0||lab.indexOf('mes')>=0||lab.indexOf('month')>=0)||(nopt>=12&&nopt<=13);
          var ehDia=(lab.indexOf('dia')>=0||lab.indexOf('day')>=0)||(nopt>=28&&nopt<=32);
          var ehAno=(lab.indexOf('ano')>=0||lab.indexOf('year')>=0)||(nopt>40);
          if(ehMes&&MES){if(!pick(MES)){s.selectedIndex=(nopt>=13?parseInt(MES,10):parseInt(MES,10)-1);}done=true;}
          else if(ehDia&&DIA){done=pick(DIA);}
          else if(ehAno&&ANO){done=pick(ANO);}
          if(done){s.__qn=true;s.dispatchEvent(new Event('input',{bubbles:true}));s.dispatchEvent(new Event('change',{bubbles:true}));}
        });
        var di=document.querySelector('input[type="date"]');
        if(di&&!di.__qn&&DIA&&MES&&ANO){di.__qn=true;var v=ANO+'-'+('0'+MES).slice(-2)+'-'+('0'+DIA).slice(-2);sv.call(di,v);di.dispatchEvent(new Event('input',{bubbles:true}));di.dispatchEvent(new Event('change',{bubbles:true}));}
      }
      var n=0;var iv=setInterval(function(){ n++; if(n>240){clearInterval(iv);return;}
        if(!q(EMAIL)){var bs=[].slice.call(document.querySelectorAll('button,div[role="button"],a,span[role="button"]'));var eb=bs.filter(function(x){var t=(x.textContent||'').trim().toLowerCase();return t.length<40&&(t.indexOf('e-mail')>=0||t.indexOf('email')>=0)&&t.indexOf('celular')<0&&t.indexOf('telefone')<0&&t.indexOf('phone')<0;})[0];if(eb){eb.click();return;}}
        fillEl(q(EMAIL),E);
        fillEl(q(['input[name="fullName"]','input[autocomplete="name"]','input[aria-label*="nome completo" i]','input[aria-label*="full name" i]']),N);
        fillOver(q(['input[name="username"]','input[autocomplete="username"]','input[aria-label*="usuário" i]','input[aria-label*="usuario" i]','input[aria-label*="username" i]']),U);
        fillEl(q(['input[name="password"]','input[type="password"]','input[aria-label*="senha" i]','input[aria-label*="password" i]']),P);
        selData();
      }, 600);
    })(); true;
  `;

  function injetarCodigo(code: string) {
    const js = `(function(){var c=${JSON.stringify(code)};
      var sel='input[name="email_confirmation_code"],input[name="confirmationCode"],input[autocomplete="one-time-code"]';
      var el=document.querySelector(sel);
      if(!el){var ins=[].slice.call(document.querySelectorAll('input'));el=ins.filter(function(x){var t=(x.type||'text').toLowerCase();return (t==='text'||t==='tel'||t==='number')&&!x.value&&x.offsetParent;})[0];}
      if(!el)return;var sv=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
      sv.call(el,c);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
      setTimeout(function(){var bs=[].slice.call(document.querySelectorAll('button,div[role="button"]'));var b=bs.filter(function(x){var t=(x.textContent||'').trim().toLowerCase();return t==='avançar'||t==='next'||t==='confirmar'||t==='continuar'||t==='seguinte';})[0];if(b)b.click();},500);
    })(); true;`;
    webRef.current?.injectJavaScript(js);
  }

  // auto-código: backend lê o Gmail por IMAP e a gente injeta no WebView
  function pollCodigo() {
    if (codT.current) clearTimeout(codT.current);
    const tick = async () => {
      if (fase !== 'web' || codFeito.current || !gmailOn) return;
      try {
        const r = await api.gmailCodigo(email);
        if (r.code) { injetarCodigo(r.code); codFeito.current = true; setCodMsg(`Código ${r.code} pego do email e preenchido.`); return; }
      } catch { /* sem código ainda */ }
      codT.current = setTimeout(tick, 6000);
    };
    codT.current = setTimeout(tick, 8000);
  }
  useEffect(() => { if (fase === 'web' && gmailOn) pollCodigo(); return () => { if (codT.current) clearTimeout(codT.current); }; /* eslint-disable-next-line */ }, [fase]);

  async function capturar() {
    if (jaCapturou.current || status === 'capturando' || !CookieManager) return;
    setStatus('capturando');
    let nomes: string[] = []; let bruto: Record<string, RawCookie> = {};
    for (let i = 0; i < 6; i++) {
      try { bruto = await CookieManager.get('https://www.instagram.com', true); nomes = Object.keys(bruto || {}); if (nomes.includes('sessionid')) break; } catch { /* retry */ }
      await sleep(700);
    }
    if (!nomes.includes('sessionid')) { setStatus('erro'); setMsg('Ainda não achei a sessão. Confirma que você entrou na conta e tenta de novo.'); return; }
    const cookies: IgCookie[] = nomes.map((n) => { const c = bruto[n]; return { name: c.name, value: c.value, domain: c.domain || '.instagram.com', path: c.path || '/', secure: c.secure ?? true, httpOnly: c.httpOnly ?? false, sameSite: 'Lax', session: true }; });
    try {
      jaCapturou.current = true;
      const res = await api.connectInstagram(cookies, username.trim().replace(/^@/, '') || undefined);
      if (!res.runs?.length) throw new Error('sem runs');
      const id = res.conta?.id;
      try { await salvarCredencial({ usuario: username.trim().replace(/^@/, ''), senha }); } catch { /* ok */ }   // conta criada → agora salva a credencial
      if (id && (bio || foto)) { try { await api.instagramPerfil(id, bio, foto || undefined); } catch { /* best-effort */ } }
      if (id && grupo) { try { const g = grupos.find((x) => x.nome === grupo); await api.editarGrupo(grupo, { contas: [...new Set([...(g ? g.contas : []), id])] }); } catch { /* ok */ } }
      if (codT.current) clearTimeout(codT.current);
      await garantirLA('Conectando Instagram');
      nav.replace('Run', { runId: res.runs[0].id, nome: 'Conectar Instagram' });
    } catch { jaCapturou.current = false; setStatus('erro'); setMsg('Não consegui enviar pro servidor. Confere a conexão e tenta de novo.'); }
  }

  if (fase === 'web') {
    return (
      <View style={styles.tela}>
        <View style={{ flex: 1 }}>
          {limpo && (
            <WebView ref={webRef} source={{ uri: SIGNUP_URL }} userAgent={UA} sharedCookiesEnabled thirdPartyCookiesEnabled
              injectedJavaScript={injecao} onLoadStart={() => setCarregandoPagina(true)}
              onLoadEnd={() => { setCarregandoPagina(false); webRef.current?.injectJavaScript(injecao); }} style={{ backgroundColor: colors.bg }} />
          )}
          {(!limpo || carregandoPagina) && (<View style={styles.overlay} pointerEvents="none"><LoadingDog size={48} /></View>)}
        </View>
        <View style={[styles.rodape, { paddingBottom: insets.bottom + 12 }]}>
          {status === 'erro' && <Text style={styles.erro}>{msg}</Text>}
          {!!codMsg && status !== 'erro' && <Text style={[styles.dica, { color: colors.ok, textAlign: 'center' }]}>{codMsg}</Text>}
          {status === 'capturando' ? (
            <View style={styles.capturando}><LoadingDog size={28} /><Text style={styles.capturandoTxt}>Registrando + aplicando bio/foto…</Text></View>
          ) : (
            <>
              <Text style={styles.dica}>Faça o cadastro de @{username}: aniversário ({dia}/{mes}/{ano}) e captcha. {gmailOn ? 'O código vem do email sozinho.' : 'Digite o código do email.'} Quando entrar na conta, toque em Conectar.</Text>
              <Botao title="Conectar sessão" onPress={capturar} />
              <View style={{ marginTop: 8 }}><Botao title="Voltar aos dados" cor={colors.card2} txtCor={colors.texto} onPress={() => { setFase('form'); setStatus('idle'); if (codT.current) clearTimeout(codT.current); }} /></View>
            </>
          )}
        </View>
      </View>
    );
  }

  return (
    <TecladoView style={styles.tela}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
        <Card>
          <Text style={styles.sec}>Dados da conta</Text>
          <Campo l="Usuário (@)" v={username} set={setUsername} />
          <Text style={styles.lbl}>Email base (Gmail) — o +alias de cada conta sai dele</Text>
          {gmails.length === 0 ? (
            <Text style={styles.dica}>Nenhuma conta de Gmail. Adicione uma na seção "Contas de Gmail" abaixo.</Text>
          ) : (
            <View style={styles.chips}>{gmails.map((g) => <Chip key={g.user} txt={g.user} on={baseEmail === g.user} onPress={() => setBaseEmail(g.user)} />)}</View>
          )}
          <Text style={styles.lbl}>Email da conta (do Gmail — não edita)</Text>
          <View style={[styles.input, { justifyContent: 'center' }]}><Text style={{ color: colors.textoFraco, fontSize: 15 }} numberOfLines={1}>{email || '—'}</Text></View>
          <Campo l="Senha" v={senha} set={setSenha} />
          <Campo l="Nome de exibição" v={nome} set={setNome} />
          <Text style={styles.lbl}>Nascimento (pra preencher na tela do aniversário)</Text>
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
          <View style={{ marginTop: 14 }}><Botao title="Abrir cadastro preenchido" onPress={abrir} disabled={faltando} /></View>
        </Card>

        <Card>
          <Text style={styles.sec}>Contas de Gmail ({gmails.length})</Text>
          {gmails.length === 0
            ? <Text style={styles.dica}>Nenhuma. Adicione o Gmail + a senha de app (não a senha normal; precisa de 2FA + IMAP ligados). Fica no servidor, compartilhada com o PC.</Text>
            : gmails.map((g) => {
              const on = !!gReveal[g.user];
              return (
                <View key={g.user} style={styles.credRow}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.credUser} numberOfLines={1}>{g.user}</Text>
                    <Text style={styles.credSenha} numberOfLines={1}>{on ? g.senha_app : '••••••••••••'}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setGReveal((r) => ({ ...r, [g.user]: !on }))} style={styles.credBtn}><Text style={styles.credBtnTxt}>{on ? 'ocultar' : 'ver'}</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => removerGmail(g.user)} style={styles.credBtn}><Text style={[styles.credBtnTxt, { color: colors.erro }]}>remover</Text></TouchableOpacity>
                </View>
              );
            })}
          <Text style={styles.lbl}>Adicionar conta de Gmail</Text>
          <TextInput style={styles.input} value={novoEmail} onChangeText={setNovoEmail} autoCapitalize="none" keyboardType="email-address" placeholder="seuemail@gmail.com" placeholderTextColor={colors.textoFraco} />
          <TextInput style={[styles.input, { marginTop: 8 }]} value={novoPw} onChangeText={setNovoPw} autoCapitalize="none" placeholder="senha de app (16 letras)" placeholderTextColor={colors.textoFraco} />
          <View style={{ marginTop: 10 }}><Botao title="Adicionar Gmail" cor={colors.card2} txtCor={colors.texto} onPress={addGmail} /></View>
        </Card>
      </ScrollView>
    </TecladoView>
  );
}

function Campo({ l, v, set }: { l: string; v: string; set: (t: string) => void }) {
  return (<><Text style={styles.lbl}>{l}</Text><TextInput style={styles.input} value={v} onChangeText={set} autoCapitalize="none" autoCorrect={false} placeholderTextColor={colors.textoFraco} /></>);
}
function Chip({ txt, on, onPress }: { txt: string; on: boolean; onPress: () => void }) {
  return (<TouchableOpacity onPress={onPress} style={[styles.chip, on && styles.chipOn]}><Text style={[styles.chipTxt, on && { color: '#1a0511' }]}>{txt}</Text></TouchableOpacity>);
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.bg },
  sec: { color: colors.textoFraco, fontSize: 12, fontWeight: '700', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  lbl: { color: colors.textoFraco, fontSize: 12.5, fontWeight: '600', marginTop: 10, marginBottom: 4 },
  input: { backgroundColor: colors.card2, borderWidth: 1, borderColor: colors.border, color: colors.texto, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  row: { flexDirection: 'row', gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: colors.card2, borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12 },
  chipOn: { backgroundColor: colors.marca, borderColor: colors.marca },
  chipTxt: { color: colors.texto, fontSize: 13, fontWeight: '700' },
  dica: { color: colors.textoFraco, fontSize: 12.5, lineHeight: 18, marginTop: 8 },
  fotoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fotoPrev: { width: 64, height: 64, borderRadius: 32, borderWidth: 1, borderColor: colors.border },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  rodape: { padding: 16, gap: 10, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card },
  erro: { color: colors.erro, fontSize: 13, textAlign: 'center', lineHeight: 18 },
  capturando: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 6 },
  capturandoTxt: { color: colors.texto, fontSize: 15, fontWeight: '600' },
  credRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: colors.border },
  credUser: { color: colors.texto, fontSize: 15, fontWeight: '700' },
  credSenha: { color: colors.textoFraco, fontSize: 13, fontFamily: 'monospace', marginTop: 2 },
  credBtn: { paddingVertical: 4, paddingHorizontal: 2 },
  credBtnTxt: { color: colors.marca, fontSize: 12.5, fontWeight: '700' },
});
