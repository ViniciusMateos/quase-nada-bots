import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '@/theme';
import { Botao } from '@/ui/components';
import { LoadingDog } from '@/ui/LoadingDog';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * Variante WEB do login do Instagram.
 *
 * No app (celular) o login roda num WebView nativo e os cookies saem do CookieManager. Na web
 * isso é impossível: o `sessionid` é httpOnly e a Same-Origin Policy barra ler cookie de outro
 * site. Então aqui a gente delega pro HELPER LOCAL (o painel_sessao.py, que dirige um Chromium
 * de verdade pelo Playwright): ele abre a janela do login, você loga na mão, e ele lê os cookies
 * (inclusive httpOnly) e manda pro backend — o MESMO fim do fluxo nativo.
 */
const PAINEL = (process.env.EXPO_PUBLIC_PAINEL_URL || 'http://127.0.0.1:8777').replace(/\/$/, '');

type Fase = 'abrindo' | 'logando' | 'detectado' | 'enviando' | 'erro';

export function InstagramLoginScreen() {
  const nav = useNavigation<Nav>();
  const params = useRoute<RouteProp<RootStackParamList, 'InstagramLogin'>>().params;
  const label = (params?.label || '').replace(/^@/, '').trim();
  const senha = params?.senha || '';   // credencial salva (só pré-preenche o login no Chromium do helper)
  const [fase, setFase] = useState<Fase>('abrindo');
  const [msg, setMsg] = useState('');
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vivo = useRef(true);

  async function api(path: string, body?: unknown) {
    const r = await fetch(`${PAINEL}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((data as { detail?: string }).detail || r.statusText);
    return data;
  }

  function parar() {
    if (pollRef.current) { clearTimeout(pollRef.current); pollRef.current = null; }
  }

  function poll() {
    parar();
    const tick = async () => {
      if (!vivo.current || !label) return;
      try {
        const s = await api(`/api/status?label=${encodeURIComponent(label)}`) as { aberto?: boolean; sessionid?: boolean };
        if (!vivo.current) return;
        if (!s.aberto) { setFase('erro'); setMsg('A janela do navegador foi fechada. Volte e toque em reconectar de novo.'); return; }
        setFase(s.sessionid ? 'detectado' : 'logando');
      } catch { /* ignora e tenta de novo */ }
      pollRef.current = setTimeout(tick, 2000);
    };
    pollRef.current = setTimeout(tick, 1500);
  }

  useEffect(() => {
    vivo.current = true;
    if (!label) { setFase('erro'); setMsg('Faltou o @ da conta.'); return () => {}; }
    (async () => {
      try {
        setFase('abrindo');
        await api('/api/abrir', { label, senha });
        if (!vivo.current) return;
        setFase('logando');
        poll();
      } catch (e) {
        setFase('erro');
        setMsg(`Não consegui abrir o navegador de login. O painel local (${PAINEL}) está rodando? ` + ((e as Error).message || ''));
      }
    })();
    return () => { vivo.current = false; parar(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label]);

  async function conectar() {
    setFase('enviando');
    try {
      const res = await api('/api/conectar', { label }) as { runs?: { id: string }[] };
      parar();
      if (res.runs?.length) {
        nav.replace('Run', { runId: res.runs[0].id, nome: 'Conectar Instagram' });
      } else {
        nav.goBack();
      }
    } catch (e) {
      setFase('erro');
      setMsg((e as Error).message || 'Não consegui conectar a sessão.');
    }
  }

  async function recomecar() {
    // zera o perfil daquela conta no PC e reabre o login do zero — pra quando a conta trava num
    // fluxo quebrado da Meta ("adicione e-mail" + erro) ou o perfil ficou num estado ruim.
    setFase('abrindo'); setMsg('');
    try {
      await api('/api/abrir', { label, senha, limpar: true });
      setFase('logando');
      poll();
    } catch (e) {
      setFase('erro'); setMsg((e as Error).message || 'Não consegui reabrir.');
    }
  }

  async function cancelar() {
    parar();
    try { await api('/api/fechar', { label }); } catch { /* ok */ }
    nav.goBack();
  }

  const detectado = fase === 'detectado';
  const trabalhando = fase === 'abrindo' || fase === 'enviando';

  return (
    <View style={styles.tela}>
      <View style={styles.centro}>
        <LoadingDog size={56} />
        <Text style={styles.titulo}>Reconectar @{label}</Text>

        <View style={styles.passos}>
          <Passo n="1" txt="Abriu uma janela do navegador no login do Instagram. Entre na conta na mão (resolva o captcha/verificação se pedir)." />
          <Passo n="2" txt="Quando estiver dentro da conta (feed aberto), volte aqui e toque em Conectar sessão." />
        </View>

        <View style={[styles.estado, detectado && styles.estadoOk, fase === 'erro' && styles.estadoErro]}>
          <Text style={[styles.estadoTxt, detectado && { color: colors.ok }, fase === 'erro' && { color: colors.erro }]}>
            {fase === 'abrindo' && 'abrindo o navegador…'}
            {fase === 'logando' && 'faça login na janela que abriu…'}
            {fase === 'detectado' && 'sessão detectada — pode conectar.'}
            {fase === 'enviando' && 'capturando a sessão e enviando pro servidor…'}
            {fase === 'erro' && (msg || 'deu erro.')}
          </Text>
        </View>
      </View>

      <View style={styles.rodape}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Botao title="Cancelar" cor={colors.card2} txtCor={colors.texto} onPress={cancelar} />
          </View>
          <View style={{ flex: 1 }}>
            <Botao title={fase === 'enviando' ? 'Conectando…' : 'Conectar sessão'} onPress={conectar} disabled={trabalhando} />
          </View>
        </View>
        <TouchableOpacity onPress={recomecar} disabled={trabalhando} style={{ paddingTop: 12, alignItems: 'center' }}>
          <Text style={styles.recomecar}>Travou no "adicione e-mail" ou deu erro? Recomeçar do zero</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Passo({ n, txt }: { n: string; txt: string }) {
  return (
    <View style={styles.passo}>
      <View style={styles.passoN}><Text style={styles.passoNTxt}>{n}</Text></View>
      <Text style={styles.passoTxt}>{txt}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.bg, justifyContent: 'space-between' },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14, maxWidth: 480, width: '100%', alignSelf: 'center' },
  titulo: { color: colors.texto, fontSize: 20, fontWeight: '800' },
  passos: { gap: 12, marginTop: 6, width: '100%' },
  passo: { flexDirection: 'row', gap: 11, alignItems: 'flex-start' },
  passoN: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  passoNTxt: { color: colors.texto, fontSize: 12, fontWeight: '700' },
  passoTxt: { color: colors.textoFraco, fontSize: 14, lineHeight: 20, flex: 1 },
  estado: { marginTop: 8, paddingVertical: 11, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, width: '100%' },
  estadoOk: { borderColor: colors.ok },
  estadoErro: { borderColor: colors.erro },
  estadoTxt: { color: colors.textoFraco, fontSize: 13.5, fontWeight: '600', textAlign: 'center' },
  rodape: { padding: 16, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card, maxWidth: 480, width: '100%', alignSelf: 'center' },
  recomecar: { color: colors.textoFraco, fontSize: 12.5, fontWeight: '600', textDecorationLine: 'underline' },
});
