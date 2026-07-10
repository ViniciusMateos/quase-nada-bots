import React, { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, IgCookie } from '@/lib/api';
import { colors } from '@/theme';
import { Botao } from '@/ui/components';
import { LoadingDog } from '@/ui/LoadingDog';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const LOGIN_URL = 'https://www.instagram.com/accounts/login/';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

type RawCookie = { name: string; value: string; domain?: string; path?: string; secure?: boolean; httpOnly?: boolean };
type CookieMgr = { get: (url: string, useWebKit?: boolean) => Promise<Record<string, RawCookie>> };

// O pacote exporta CommonJS (module.exports = {...}), sem "default" — por isso
// pega o .default se existir (interop) ou o próprio módulo.
let CookieManager: CookieMgr | null = null;
try {
  const mod = require('@react-native-cookies/cookies');
  CookieManager = (mod && mod.default ? mod.default : mod) as CookieMgr;
} catch {
  CookieManager = null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function InstagramLoginScreen() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const [carregandoPagina, setCarregandoPagina] = useState(true);
  const [status, setStatus] = useState<'idle' | 'capturando' | 'erro'>('idle');
  const [msg, setMsg] = useState('');
  const jaCapturou = useRef(false);

  async function capturar() {
    if (jaCapturou.current || status === 'capturando' || !CookieManager) return;
    setStatus('capturando');
    // o WKWebView faz flush dos cookies de forma assíncrona — tenta algumas vezes
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
      const res = await api.connectInstagram(cookies);
      if (!res.runs?.length) throw new Error('sem runs');
      nav.replace('Run', { runId: res.runs[0].id, nome: 'Conectar Instagram' });
    } catch {
      jaCapturou.current = false;
      setStatus('erro');
      setMsg('Não consegui enviar pro servidor. Confere a conexão e tenta de novo.');
    }
  }

  return (
    <View style={styles.tela}>
      <View style={{ flex: 1 }}>
        <WebView
          source={{ uri: LOGIN_URL }}
          userAgent={UA}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          incognito={false}
          onLoadStart={() => setCarregandoPagina(true)}
          onLoadEnd={() => setCarregandoPagina(false)}
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
            <Text style={styles.dica}>Entre na conta que quer usar (dá pra trocar de conta aqui). Quando estiver logado nela, toque em Conectar.</Text>
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
  dica: { color: colors.textoFraco, fontSize: 13, textAlign: 'center' },
  erro: { color: colors.erro, fontSize: 13, textAlign: 'center', lineHeight: 18 },
  capturando: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 6 },
  capturandoTxt: { color: colors.texto, fontSize: 15, fontWeight: '600' },
});
