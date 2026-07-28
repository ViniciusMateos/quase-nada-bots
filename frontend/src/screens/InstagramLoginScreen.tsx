import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, IgCookie } from '@/lib/api';
import { garantirLA } from '@/lib/la';
import { colors } from '@/theme';
import { Botao } from '@/ui/components';
import { LoadingDog } from '@/ui/LoadingDog';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const LOGIN_URL = 'https://www.instagram.com/accounts/login/';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

type RawCookie = { name: string; value: string; domain?: string; path?: string; secure?: boolean; httpOnly?: boolean };
type CookieMgr = {
  get: (url: string, useWebKit?: boolean) => Promise<Record<string, RawCookie>>;
  clearAll: (useWebKit?: boolean) => Promise<boolean>;
};

let CookieManager: CookieMgr | null = null;
try {
  const mod = require('@react-native-cookies/cookies');
  CookieManager = (mod && mod.default ? mod.default : mod) as CookieMgr;
} catch {
  CookieManager = null;
}
const semNativo = !CookieManager;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function InstagramLoginScreen() {
  const nav = useNavigation<Nav>();
  const params = useRoute<RouteProp<RootStackParamList, 'InstagramLogin'>>().params;
  const usuario = (params?.label || '').replace(/^@/, '').trim();
  const senha = params?.senha || '';
  const autoLogin = !!(usuario && senha);   // tem credencial salva → login automático
  const insets = useSafeAreaInsets();
  const [carregandoPagina, setCarregandoPagina] = useState(true);
  const [status, setStatus] = useState<'idle' | 'capturando' | 'erro'>('idle');
  const [msg, setMsg] = useState('');
  const [limpo, setLimpo] = useState(false);   // cookies do IG já foram zerados? (login novo obrigatório)
  const jaCapturou = useRef(false);
  const webRef = useRef<WebView>(null);

  // SEMPRE começa deslogado: zera os cookies do IG no webview ANTES de carregar. Sem isso, com uma
  // conta já conectada, o webview abria logado e o auto-capture pegava a conta ERRADA (a de antes).
  useEffect(() => {
    if (!CookieManager) { setLimpo(true); return; }
    let vivo = true;
    Promise.all([
      CookieManager.clearAll(true).catch(() => false),    // store do WKWebView (o que o get lê)
      CookieManager.clearAll(false).catch(() => false),   // store nativo compartilhado
    ]).finally(() => { if (vivo) setLimpo(true); });
    return () => { vivo = false; };
  }, []);

  // JS injetado no webview: preenche @usuário (e senha, se houver) nos campos React-controlados
  // (setter nativo + evento 'input') e, no modo auto, clica no botão "Entrar" quando os dois
  // campos estão prontos. NÃO mexe em captcha — se aparecer, é você quem resolve na hora.
  const injecao = usuario ? `
    (function(){
      if (window.__qnFill) return; window.__qnFill = true;
      var u = ${JSON.stringify(usuario)}, p = ${JSON.stringify(senha)}, auto = ${autoLogin ? 'true' : 'false'};
      var n = 0, clicou = false;
      var set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      function fill(el, val){
        if (el && val && el.value !== val) {
          set.call(el, val);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      function campos(){
        var pi = document.querySelector('input[type="password"], input[name="password"]');
        var ui = document.querySelector('input[name="username"], input[autocomplete="username"], input[type="email"], input[inputmode="email"]');
        if (!ui) {
          var todos = Array.prototype.slice.call(document.querySelectorAll('input'));
          ui = todos.filter(function(x){ var t=(x.type||'text').toLowerCase(); return t!=='password'&&t!=='hidden'&&t!=='checkbox'&&t!=='submit'&&t!=='button'&&t!=='radio'; })[0];
        }
        return { ui: ui, pi: pi };
      }
      var iv = setInterval(function(){
        n++;
        var c = campos();
        if (n <= 30) { fill(c.ui, u); fill(c.pi, p); }
        if (auto && !clicou && c.ui && c.pi && c.ui.value && c.pi.value && n > 3) {
          var cands = Array.prototype.slice.call(document.querySelectorAll('button, div[role="button"], [type="submit"]'));
          var btn = cands.filter(function(b){
            var t = (b.textContent || b.innerText || '').trim().toLowerCase();
            return t==='entrar' || t==='log in' || t==='continuar' || t==='acessar' || t==='iniciar sessão';
          })[0];
          if (!btn && c.pi.form) { btn = c.pi.form.querySelector('button[type="submit"]') || c.pi.form.querySelector('button'); }
          if (btn) { btn.click(); clicou = true; }
          else if (c.pi.form) { try { (c.pi.form.requestSubmit ? c.pi.form.requestSubmit() : c.pi.form.submit()); clicou = true; } catch (e) {} }
        }
        if (n > 60 || clicou) clearInterval(iv);
      }, 300);
    })(); true;
  ` : undefined;

  async function capturar() {
    if (jaCapturou.current || status === 'capturando' || !CookieManager) return;
    setStatus('capturando');
    let nomes: string[] = [];
    let bruto: Record<string, RawCookie> = {};
    for (let i = 0; i < 6; i++) {
      try {
        bruto = await CookieManager.get('https://www.instagram.com', true);
        nomes = Object.keys(bruto || {});
        if (nomes.includes('sessionid')) break;
      } catch { /* tenta de novo */ }
      await sleep(700);
    }
    if (!nomes.includes('sessionid')) {
      setStatus('erro');
      setMsg('Ainda não achei a sessão. Confirma que você entrou na conta e tenta de novo.');
      return;
    }
    const cookies: IgCookie[] = nomes.map((n) => {
      const c = bruto[n];
      return {
        name: c.name, value: c.value,
        domain: c.domain || '.instagram.com', path: c.path || '/',
        secure: c.secure ?? true, httpOnly: c.httpOnly ?? false,
        sameSite: 'Lax', session: true,
      };
    });
    try {
      jaCapturou.current = true;
      const res = await api.connectInstagram(cookies, usuario || undefined);
      if (!res.runs?.length) throw new Error('sem runs');
      await garantirLA('Conectando Instagram');
      nav.replace('Run', { runId: res.runs[0].id, nome: 'Conectar Instagram' });
    } catch {
      jaCapturou.current = false;
      setStatus('erro');
      setMsg('Não consegui enviar pro servidor. Confere a conexão e tenta de novo.');
    }
  }

  // Auto-captura: assim que o sessionid aparecer (login OK — na hora, ou depois de você resolver
  // um captcha), captura sozinho. Só no modo auto (tem credencial). Manual continua no botão.
  useEffect(() => {
    if (!CookieManager || !autoLogin || !limpo) return;   // só depois de zerar os cookies antigos
    const iv = setInterval(async () => {
      if (jaCapturou.current) { clearInterval(iv); return; }
      try {
        const c = await CookieManager!.get('https://www.instagram.com', true);
        if (c && c.sessionid && c.sessionid.value) { clearInterval(iv); capturar(); }
      } catch { /* segue tentando */ }
    }, 2000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLogin, limpo]);

  return (
    <View style={styles.tela}>
      <View style={{ flex: 1 }}>
        {limpo && (
          <WebView
            ref={webRef}
            source={{ uri: LOGIN_URL }}
            userAgent={UA}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            incognito={false}
            injectedJavaScript={injecao}
            onLoadStart={() => setCarregandoPagina(true)}
            onLoadEnd={() => { setCarregandoPagina(false); if (injecao) webRef.current?.injectJavaScript(injecao); }}
            style={{ backgroundColor: colors.bg }}
          />
        )}
        {(!limpo || carregandoPagina) && (
          <View style={styles.overlayPagina} pointerEvents="none">
            <LoadingDog size={48} />
          </View>
        )}
      </View>

      <View style={[styles.rodape, { paddingBottom: insets.bottom + 12 }]}>
        {status === 'erro' && <Text style={styles.erro}>{msg}</Text>}
        {semNativo ? (
          <Text style={styles.aviso}>
            O login do Instagram só funciona no app instalado. No Expo Go o iOS não entrega
            os cookies da sessão pro app, então não tem como capturar o login daqui.
          </Text>
        ) : status === 'capturando' ? (
          <View style={styles.capturando}>
            <LoadingDog size={30} />
            <Text style={styles.capturandoTxt}>Conectando sua conta…</Text>
          </View>
        ) : autoLogin ? (
          <>
            <Text style={styles.dica}>
              Preenchi o login de @{usuario}. Se pedir captcha, resolve aí que eu capturo a sessão
              sozinho. Se travar, toca em Conectar.
            </Text>
            <Botao title="Conectar sessão" onPress={() => capturar()} />
          </>
        ) : (
          <>
            <Text style={styles.dica}>Entre na conta que quer usar. Quando estiver logado, toque em Conectar.</Text>
            <Botao title="Conectar sessão" onPress={() => capturar()} />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.bg },
  overlayPagina: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  rodape: { padding: 16, gap: 10, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card },
  dica: { color: colors.textoFraco, fontSize: 13, textAlign: 'center', lineHeight: 18 },
  aviso: { color: colors.alerta, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  erro: { color: colors.erro, fontSize: 13, textAlign: 'center', lineHeight: 18 },
  capturando: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 6 },
  capturandoTxt: { color: colors.texto, fontSize: 15, fontWeight: '600' },
});
