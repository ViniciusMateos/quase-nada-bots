import React, { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, IgCookie } from '@/lib/api';
import { colors } from '@/theme';
import { Botao } from '@/ui/components';
import { LoadingDog } from '@/ui/LoadingDog';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const LOGIN_URL = 'https://www.instagram.com/accounts/login/';
// UA de iPhone real — a WebView "pelada" às vezes toma "navegador não suportado" do IG.
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

// o cookie manager é NATIVO: no Expo Go ele lança Invariant já no import.
// Por isso carregamos lazy com try/catch — assim a tela abre no Expo Go e só a
// captura da sessão (que precisa de dev build) fica indisponível.
type RawCookie = { name: string; value: string; domain?: string; path?: string; secure?: boolean; httpOnly?: boolean };
type CookieMgr = { get: (url: string, useWebKit?: boolean) => Promise<Record<string, RawCookie>> };

let CookieManager: CookieMgr | null = null;
try {
  CookieManager = require('@react-native-cookies/cookies').default as CookieMgr;
} catch {
  CookieManager = null;   // Expo Go / módulo nativo ausente
}
const nativoOk = CookieManager != null && typeof CookieManager.get === 'function';

export function InstagramLoginScreen() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const [carregandoPagina, setCarregandoPagina] = useState(true);
  const [status, setStatus] = useState<'idle' | 'capturando' | 'erro'>('idle');
  const [msg, setMsg] = useState('');
  const jaCapturou = useRef(false);

  async function capturar(auto = false) {
    if (jaCapturou.current || status === 'capturando') return;
    const cm = CookieManager;
    if (!cm) {
      setStatus('erro');
      setMsg('A captura de sessão precisa de um dev build (o Expo Go não lê o cookie sessionid). Faça o build de dev pra conectar.');
      return;
    }
    setStatus('capturando');
    try {
      const bruto = await cm.get('https://www.instagram.com', true);
      const nomes = Object.keys(bruto || {});
      if (!nomes.includes('sessionid')) {
        if (auto) { setStatus('idle'); return; }        // ainda não logou; segue navegando
        setStatus('erro');
        setMsg('Ainda não achei a sessão. Confirme que você entrou na conta e tente de novo.');
        return;
      }
      const cookies: IgCookie[] = nomes.map((n) => {
        const c = bruto[n];
        return {
          name: c.name, value: c.value,
          domain: c.domain || '.instagram.com',
          path: c.path || '/',
          secure: c.secure ?? true,
          httpOnly: c.httpOnly ?? false,
          sameSite: 'Lax',
          session: true,                                // sem expires → o worker importa como sessão
        };
      });
      jaCapturou.current = true;
      const res = await api.connectInstagram(cookies);
      if (!res.runs?.length) throw new Error('sem runs');
      // acompanha a importação do 1º bot; os demais aparecem em "Rodando agora"
      nav.replace('Run', { runId: res.runs[0].id, nome: 'Conectar Instagram' });
    } catch (e) {
      jaCapturou.current = false;
      setStatus('erro');
      setMsg('Não consegui conectar. Confira o servidor/token em Configurações e tente de novo.');
    }
  }

  function aoNavegar(s: WebViewNavigation) {
    // logou → o IG sai de /accounts/login. Tenta capturar em silêncio.
    const logado = s.url.includes('instagram.com') && !s.url.includes('/accounts/login')
      && !s.url.includes('/accounts/emailsignup') && !s.loading;
    if (logado) capturar(true);
  }

  return (
    <View style={styles.tela}>
      {!nativoOk && (
        <View style={styles.banner}>
          <Text style={styles.bannerTxt}>
            ⚠️ No Expo Go dá pra logar, mas a captura da sessão só funciona no dev build.
          </Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <WebView
          source={{ uri: LOGIN_URL }}
          userAgent={UA}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          incognito={false}
          onLoadStart={() => setCarregandoPagina(true)}
          onLoadEnd={() => setCarregandoPagina(false)}
          onNavigationStateChange={aoNavegar}
          style={{ backgroundColor: colors.bg }}
        />
        {carregandoPagina && (
          <View style={styles.overlayPagina} pointerEvents="none">
            <LoadingDog size={48} />
          </View>
        )}
      </View>

      <View style={[styles.rodape, { paddingBottom: insets.bottom + 12 }]}>
        {status === 'erro' && <Text style={styles.erro}>{msg}</Text>}
        {status === 'capturando' ? (
          <View style={styles.capturando}>
            <LoadingDog size={30} />
            <Text style={styles.capturandoTxt}>Conectando sua conta…</Text>
          </View>
        ) : (
          <>
            <Text style={styles.dica}>Entrou na sua conta? Toca aqui pra conectar os bots.</Text>
            <Botao title="Conectar sessão" onPress={() => capturar(false)} />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.bg },
  banner: { backgroundColor: colors.card2, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  bannerTxt: { color: colors.alerta, fontSize: 12, lineHeight: 17 },
  overlayPagina: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  rodape: { padding: 16, gap: 10, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card },
  dica: { color: colors.textoFraco, fontSize: 13, textAlign: 'center' },
  erro: { color: colors.erro, fontSize: 13, textAlign: 'center', lineHeight: 18 },
  capturando: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 6 },
  capturandoTxt: { color: colors.texto, fontSize: 15, fontWeight: '600' },
});
