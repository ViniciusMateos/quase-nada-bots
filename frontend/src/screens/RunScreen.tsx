import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, AppState, Easing, NativeScrollEvent, NativeSyntheticEvent, Pressable,
  ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { api, logsWsUrl } from '@/lib/api';
import { colors, statusCor } from '@/theme';
import { BarraProgresso, Botao, Pill, Pulsar } from '@/ui/components';
import { Contagem } from '@/ui/Contagem';
import { EsqueletoLinha } from '@/ui/Esqueleto';
import type { Progresso, Espera } from '@/lib/api';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Rt = RouteProp<RootStackParamList, 'Run'>;

// Log inteligente: detecta arte de terminal e renderiza como UI adaptável ao celular.
type Parsed =
  | { tipo: 'oculta' }
  | { tipo: 'conta'; user: string; pos: string }
  | { tipo: 'divisor' }
  | { tipo: 'titulo'; texto: string }
  | { tipo: 'kv'; label: string; valor: string }
  | { tipo: 'dmhead'; user: string; enviada: boolean }
  | { tipo: 'mensagem'; texto: string }
  | { tipo: 'sleep'; texto: string }
  | { tipo: 'texto'; hora: string; texto: string; cor: string; forte: boolean };

function corEvento(nivel: string, low: string): { cor: string; forte: boolean } {
  let cor = '#D8D8D8';
  let forte = false;
  if (nivel === 'ERROR' || low.includes('bloque') || low.includes('⛔') || low.includes('checkpoint')) {
    cor = colors.erro; forte = true;
  } else if (low.includes('seguiu @') || low.includes('+ seguiu')) {
    cor = colors.ok;
  } else if (low.includes('pedido')) {
    cor = colors.laranja;
  } else if (low.includes('pulou') || low.includes('pulad') || low.includes('já seguid') || low.includes('já seguia')) {
    cor = colors.textoFraco;
  } else if (nivel === 'WARNING' || nivel === 'WARN' || low.includes('transitório')) {
    cor = colors.alerta;
  }
  return { cor, forte };
}

// linhas TÉCNICAS (id do job/run, serial do device, fila do backend) — não interessam no log do app
// (pedido do Vinicius 20/10). O agente novo nem manda mais; isto limpa também os logs antigos.
const TECNICAS = [
  /^\[backend\]/, /^=== JOB /, /^device conectado/, /^não conectou em /, /^ação=/,
  /^aviso: não consegui garantir o IG aberto/,
];

function parseLinha(raw: string): Parsed {
  if (TECNICAS.some((re) => re.test(raw))) return { tipo: 'oculta' };
  // conta rodando agora (marcador do agente "[conta] user i/N") → faixa em destaque
  const ct = raw.match(/^\[conta\]\s+@?([A-Za-z0-9._]+)\s*(\d+\/\d+)?/);
  if (ct) return { tipo: 'conta', user: ct[1], pos: ct[2] ?? '' };
  // fecho do job: "=== SALDO: X follows, Y posts — resumo ===" → só o resumo legível
  const saldo = raw.match(/^=== SALDO:\s*(\d+) follows, (\d+) posts\s*[—-]\s*(.*?)\s*===$/);
  if (saldo) {
    const [, f, ps, resumo] = saldo;
    const nums = f !== '0' || ps !== '0' ? `${f} follows · ${ps} posts` : '';
    return { tipo: 'titulo', texto: [nums, resumo].filter(Boolean).join('  —  ') || 'fim' };
  }
  const fim = raw.match(/^===\s*(.+?)\s*===$/);   // "=== LOTE FIM: … ===" etc.
  if (fim) return { tipo: 'titulo', texto: fim[1] };
  const m = raw.match(/^\d{4}-\d{2}-\d{2}\s+(\d{2}:\d{2}:\d{2})\s+(\w+)\s+([\s\S]*)$/);
  const hora = m ? m[1] : '';
  const nivel = m ? m[2] : '';
  const resto = (m ? m[3] : raw).trimEnd();

  // separadores (───── / ═════) e cabeçalhos com traços (─── TÍTULO ───), sem pegar a árvore ┌─│└
  if (/[─—═]{3,}/.test(resto) || /-{5,}/.test(resto)) {
    const limpo = resto.replace(/[─—═]+/g, ' ').replace(/-{3,}/g, ' ').replace(/\s{2,}/g, ' ').trim();
    return limpo ? { tipo: 'titulo', texto: limpo } : { tipo: 'divisor' };
  }
  const wrap = resto.match(/^[─—]\s*(.+?)\s*[─—]$/);   // — Título —
  if (wrap) return { tipo: 'titulo', texto: wrap[1].trim() };

  // ── DM: organiza o bloco em vez de amontoar ──
  // cabeçalho "DM → @user": limpa o "│ [dry] DM →", o (pk …) e o rabicho de status.
  const dm = resto.match(/DM\s*→\s*@?([A-Za-z0-9._]+)/);
  if (dm) return { tipo: 'dmhead', user: dm[1], enviada: /enviada/i.test(resto) };
  // corpo da mensagem: linha indentada "│      <texto>" → preview discreto (itálico/cinza,
  // cortado em 2 linhas) pra não tomar a tela com a mensagem inteira.
  const msg = resto.match(/^│\s{3,}(.+)$/);
  if (msg) {
    const limpa = msg[1].replace(/⏎/g, ' ').replace(/\s{2,}/g, ' ').trim();
    return { tipo: 'mensagem', texto: limpa };
  }
  // pausas humanas ("dormiria/dormindo 3s (abrindo perfil)") = ruído de ritmo → bem discreto
  const soneca = resto.match(/dormi(?:ria|ndo)\s+(\S+)\s*\(([^)]+)\)/i);
  if (soneca) return { tipo: 'sleep', texto: `${soneca[2].trim()}  ·  ${soneca[1].trim()}` };

  // "label ..... valor" → linha com valor à direita
  const kv = resto.match(/^(.+?)\s*[.·]{2,}\s*(.+)$/);
  if (kv) return { tipo: 'kv', label: kv[1].trim(), valor: kv[2].trim() };

  const { cor, forte } = corEvento(nivel, resto.toLowerCase());
  return { tipo: 'texto', hora, texto: resto, cor, forte };
}

function LogLinha({ raw, onCopiar }: { raw: string; onCopiar: (t: string) => void }) {
  const p = parseLinha(raw);
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [anim]);
  const wrapStyle = {
    opacity: anim,
    transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }],
  };

  if (p.tipo === 'oculta') return null;
  let el;
  if (p.tipo === 'conta') {
    el = (
      <Animated.View style={[wrapStyle, styles.contaFaixa]}>
        <Ionicons name="person-circle" size={16} color={colors.marca} />
        <Text style={styles.contaUser}>@{p.user}</Text>
        {p.pos ? <Text style={styles.contaPos}>{p.pos}</Text> : null}
      </Animated.View>
    );
  } else if (p.tipo === 'divisor') {
    el = <Animated.View style={[wrapStyle, styles.divisorWrap]}><View style={styles.divisor} /></Animated.View>;
  } else if (p.tipo === 'titulo') {
    el = <Animated.View style={wrapStyle}><Text style={styles.titulo}>{p.texto}</Text></Animated.View>;
  } else if (p.tipo === 'kv') {
    el = (
      <Animated.View style={[wrapStyle, styles.kvRow]}>
        <Text style={styles.kvLabel}>{p.label}</Text>
        <Text style={styles.kvValor}>{p.valor}</Text>
      </Animated.View>
    );
  } else if (p.tipo === 'dmhead') {
    el = (
      <Animated.View style={[wrapStyle, styles.dmhead]}>
        <Ionicons name="paper-plane" size={13} color={colors.amarelo} />
        <Text style={styles.dmuser}>@{p.user}</Text>
        {p.enviada && <Ionicons name="checkmark-done" size={14} color={colors.ok} />}
      </Animated.View>
    );
  } else if (p.tipo === 'mensagem') {
    el = (
      <Animated.View style={wrapStyle}>
        <Text style={styles.mensagem} numberOfLines={2}>{p.texto}</Text>
      </Animated.View>
    );
  } else if (p.tipo === 'sleep') {
    el = (
      <Animated.View style={wrapStyle}>
        <Text style={styles.sleep} numberOfLines={1}>{p.texto}</Text>
      </Animated.View>
    );
  } else {
    el = (
      <Animated.View style={wrapStyle}>
        <Text style={[styles.linha, { color: p.cor }, p.forte && styles.forte]}>
          {p.hora ? <Text style={styles.hora}>{p.hora}  </Text> : null}
          {p.texto}
        </Text>
      </Animated.View>
    );
  }
  // segurar pra copiar a linha
  return <Pressable onLongPress={() => onCopiar(raw)} delayLongPress={280}>{el}</Pressable>;
}

// ── SEÇÕES POR CONTA (23/10/2026): cada "[conta] @user" abre um card que dobra/desdobra com as
// linhas daquela conta embaixo. O que vem antes da 1ª conta (abertura) e depois do fecho do lote
// (═════ / === SALDO) fica solto, sempre à mostra.
const RE_CONTA = /^\[conta\]\s+@?([A-Za-z0-9._]+)\s*(\d+\/\d+)?/;
const RE_FECHO = /^═{3,}\s*$|^=== SALDO:/;

type SecaoConta = {
  tipo: 'conta'; key: string; user: string; pos: string; idx: number[];
  visiveis: number; erro: boolean;
};
type Secao = { tipo: 'solta'; key: string; idx: number[] } | SecaoConta;

function agrupar(linhas: string[]): Secao[] {
  const out: Secao[] = [];
  let conta: SecaoConta | null = null;
  let fechou = false;
  linhas.forEach((raw, i) => {
    const ct = fechou ? null : raw.match(RE_CONTA);
    if (ct) {
      // a mesma conta marcada de novo (ex: o agente reemite no meio) continua no mesmo card
      if (conta && conta.user === ct[1]) { if (ct[2]) conta.pos = ct[2]; return; }
      conta = { tipo: 'conta', key: `${ct[1]}#${i}`, user: ct[1], pos: ct[2] ?? '', idx: [], visiveis: 0, erro: false };
      out.push(conta);
      return;
    }
    if (conta && RE_FECHO.test(raw)) { fechou = true; conta = null; }   // resumo do lote: fora dos cards
    if (conta) {
      const p = parseLinha(raw);
      conta.idx.push(i);
      if (p.tipo !== 'oculta') conta.visiveis += 1;
      if ((p.tipo === 'texto' && p.cor === colors.erro) || raw.includes('!!')) conta.erro = true;
      return;
    }
    const ult = out[out.length - 1];
    if (ult && ult.tipo === 'solta') ult.idx.push(i);
    else out.push({ tipo: 'solta', key: `s#${i}`, idx: [i] });
  });
  return out;
}

function CartaoConta({ s, aberta, agora, linhas, onToggle, onCopiar }: {
  s: SecaoConta; aberta: boolean; agora: boolean; linhas: string[];
  onToggle: () => void; onCopiar: (t: string, msg: string) => void;
}) {
  return (
    <View>
      <TouchableOpacity activeOpacity={0.8} onPress={onToggle} delayLongPress={280}
        onLongPress={() => onCopiar([`[conta] @${s.user}`, ...s.idx.map((i) => linhas[i])].join('\n'),
          `log da @${s.user} copiado`)}
        style={[styles.contaFaixa, !aberta && styles.contaFaixaFechada]}>
        <Ionicons name={aberta ? 'chevron-down' : 'chevron-forward'} size={15} color={colors.textoFraco} />
        <Ionicons name="person-circle" size={16} color={colors.marca} />
        <Text style={styles.contaUser} numberOfLines={1}>@{s.user}</Text>
        {s.erro ? <Ionicons name="alert-circle" size={15} color={colors.erro} /> : null}
        {agora ? <Text style={styles.contaAgora}>agora</Text> : null}
        {!aberta ? <Text style={styles.contaQtd}>{s.visiveis} {s.visiveis === 1 ? 'linha' : 'linhas'}</Text> : null}
        {s.pos ? <Text style={styles.contaPos}>{s.pos}</Text> : null}
      </TouchableOpacity>
      {aberta && s.idx.length > 0 ? (
        <>
          <View style={styles.contaCorpo}>
            {s.idx.map((i) => (
              <LogLinha key={i} raw={linhas[i]} onCopiar={(t) => onCopiar(t, 'linha copiada')} />
            ))}
          </View>
          <TouchableOpacity activeOpacity={0.8} onPress={onToggle} style={styles.contaFechar}>
            <Ionicons name="chevron-up" size={13} color={colors.textoFraco} />
            <Text style={styles.contaFecharTxt}>fechar @{s.user}</Text>
          </TouchableOpacity>
        </>
      ) : null}
    </View>
  );
}

function parseProgresso(txt: string): Progresso | null {
  const resto = txt.slice('[progress]'.length).trim();
  const m = resto.match(/^(\d+)\s+(\d+)\s*(.*)$/);
  if (!m) return null;
  return { done: parseInt(m[1], 10), total: parseInt(m[2], 10), label: m[3].trim() };
}

function parseEspera(txt: string): Espera | null {
  const resto = txt.slice('[espera]'.length).trim();
  const m = resto.match(/^(\d+)\s*(.*)$/);
  if (!m) return null;
  const restam = parseInt(m[1], 10);
  return { ate: Date.now() / 1000 + restam, restam, motivo: m[2].trim() };
}

// larguras fake das linhas do skeleton do log — irregulares de propósito pra lembrar log de verdade
const LARGURAS_LOG = ['38%', '72%', '55%', '66%', '44%', '80%', '50%', '63%', '35%', '70%', '58%', '48%'] as const;

export function RunScreen() {
  const { runId } = useRoute<Rt>().params;
  const [linhas, setLinhas] = useState<string[]>([]);
  const [status, setStatus] = useState('rodando');
  const [conectando, setConectando] = useState(true);
  const [parando, setParando] = useState(false);
  const [progresso, setProgresso] = useState<Progresso | null>(null);
  const [espera, setEspera] = useState<Espera | null>(null);
  const [copiadoMsg, setCopiadoMsg] = useState<string | null>(null);
  const copiadoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const atBottomRef = useRef(true);
  const [mostrarVoltar, setMostrarVoltar] = useState(false);
  const botaoAnim = useRef(new Animated.Value(0)).current;
  // cards de conta: o que você abriu/fechou na mão (o resto segue o padrão — ver `abertaPadrao`)
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});

  useEffect(() => {
    Animated.spring(botaoAnim, { toValue: mostrarVoltar ? 1 : 0, useNativeDriver: true, friction: 7, tension: 60 }).start();
  }, [mostrarVoltar, botaoAnim]);

  function aoScrollar(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    const perto = contentSize.height - (contentOffset.y + layoutMeasurement.height) < 60;
    atBottomRef.current = perto;
    setMostrarVoltar((atual) => (atual === !perto ? atual : !perto));
  }
  function irAoFinal() {
    scrollRef.current?.scrollToEnd({ animated: true });
    atBottomRef.current = true;
    setMostrarVoltar(false);
  }

  useEffect(() => {
    let alive = true;

    // Troca de run: zera AGORA. O ws.onopen também zera, mas só quando a conexão abre —
    // até lá a tela mostraria o log e a barra do bot ANTERIOR, como se fossem deste.
    // (Na reconexão do AppState isso não roda: o effect só refaz quando o runId muda.)
    setLinhas([]);
    setProgresso(null);
    setEspera(null);
    setConectando(true);
    setAbertos({});

    const conectar = async () => {
      if (!alive) return;
      try { wsRef.current?.close(); } catch { /* sem socket antigo */ }
      setConectando(true);
      try {
        const d = await api.getRun(runId);
        // semeia o log JÁ do getRun: assim o histórico → run FINALIZADA mostra o log na hora,
        // sem depender do replay do WS (que pode nem abrir pra run que já acabou). Pra run
        // rodando, o ws.onopen rezera e o server reenvia — sem duplicar.
        if (alive) { setStatus(d.status); if (d.log && d.log.length) setLinhas(d.log); }
      } catch {}
      if (!alive) return;
      const url = await logsWsUrl(runId);
      const ws = new WebSocket(url);
      wsRef.current = ws;
      // o server reenvia TODO o histórico ao conectar → zera as linhas, senão cada volta
      // do segundo plano duplicaria o log inteiro
      ws.onopen = () => { if (alive) setLinhas([]); };
      ws.onmessage = (e) => {
        if (!alive) return;
        setConectando(false);
        const txt = String(e.data);
        if (txt.startsWith('[progress]')) {          // barra, não vira linha de log
          const p = parseProgresso(txt);
          if (p) setProgresso(p);
          setEspera(null);                           // andou o progresso → não está mais em pausa
          return;
        }
        if (txt.startsWith('[espera-fim]')) { setEspera(null); return; }
        if (txt.startsWith('[espera]')) {            // pausa em contagem, não vira linha de log
          const e2 = parseEspera(txt);
          if (e2) setEspera(e2);
          return;
        }
        setLinhas((prev) => [...prev, txt]);
      };
      ws.onerror = () => { if (alive) setConectando(false); };
      ws.onclose = async () => {
        if (alive) setConectando(false);
        try { const d = await api.getRun(runId); if (alive) setStatus(d.status); } catch {}
      };
    };

    conectar();
    // o iOS MATA o WebSocket quando o app vai pro segundo plano — sem reconectar aqui, o
    // log congela nas linhas antigas e nunca mais anda
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active' && alive) conectar();
    });
    return () => { alive = false; wsRef.current?.close(); sub.remove(); };
  }, [runId]);

  // Trocar de run pelo widget flutuante mantém a MESMA tela: o React Navigation só
  // atualiza os params. Sem isso o conteúdo trocava seco — o nome mudava e o log pipocava.
  // Aqui a tela some e volta, então dá pra perceber que virou outro processo.
  const troca = useRef(new Animated.Value(1)).current;
  const primeiroRun = useRef(true);
  useEffect(() => {
    if (primeiroRun.current) { primeiroRun.current = false; return; }  // não anima ao abrir
    troca.setValue(0);
    Animated.timing(troca, {
      toValue: 1, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true,
    }).start();
  }, [runId, troca]);

  async function parar() {
    setParando(true);
    try { await api.stopRun(runId); setStatus('parado'); } catch {} finally { setParando(false); }
  }

  async function copiar(texto: string, msg: string) {
    try { await Clipboard.setStringAsync(texto); } catch {}
    setCopiadoMsg(msg);
    if (copiadoTimer.current) clearTimeout(copiadoTimer.current);
    copiadoTimer.current = setTimeout(() => setCopiadoMsg(null), 1400);
  }

  const rodando = ['rodando', 'iniciando'].includes(status);

  const secoes = useMemo(() => agrupar(linhas), [linhas]);
  const contas = secoes.filter((s): s is SecaoConta => s.tipo === 'conta');
  const ultimaConta = contas.length ? contas[contas.length - 1].key : null;
  // padrão: rodando → só a conta da vez aberta (as anteriores vão fechando sozinhas); terminada →
  // tudo fechado com o resumo à mostra (uma conta só = aberta)
  const abertaPadrao = (s: SecaoConta) => contas.length === 1 || (rodando && s.key === ultimaConta);
  const estaAberta = (s: SecaoConta) => abertos[s.key] ?? abertaPadrao(s);
  const todasAbertas = contas.length > 0 && contas.every(estaAberta);
  function alternar(s: SecaoConta) {
    setAbertos((prev) => ({ ...prev, [s.key]: !(prev[s.key] ?? abertaPadrao(s)) }));
  }
  function abrirTodas(valor: boolean) {
    setAbertos(Object.fromEntries(contas.map((s) => [s.key, valor])));
  }

  return (
    <Animated.View style={[styles.tela, {
      opacity: troca,
      transform: [{ translateY: troca.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
    }]}>
      <View style={styles.topo}>
        <Pulsar ativo={rodando}>
          <Pill texto={status} cor={statusCor[status] ?? colors.textoFraco} />
        </Pulsar>
        <View style={styles.topoAcoes}>
          {contas.length > 1 && (
            <TouchableOpacity style={styles.copiarBtn} hitSlop={8} onPress={() => abrirTodas(!todasAbertas)}>
              <Ionicons name={todasAbertas ? 'contract-outline' : 'expand-outline'} size={16} color={colors.texto} />
              <Text style={styles.copiarTxt}>{todasAbertas ? 'fechar' : 'abrir'}</Text>
            </TouchableOpacity>
          )}
          {linhas.length > 0 && (
            <TouchableOpacity style={styles.copiarBtn} hitSlop={8}
              onPress={() => copiar(linhas.join('\n'), 'log copiado')}>
              <Ionicons name="copy-outline" size={16} color={colors.texto} />
              <Text style={styles.copiarTxt}>copiar log</Text>
            </TouchableOpacity>
          )}
          {rodando && <Botao title="Parar" cor={colors.erro} txtCor="#fff" onPress={parar} loading={parando} />}
        </View>
      </View>
      {progresso && progresso.total > 0 && (
        <View style={styles.barraWrap}>
          <BarraProgresso done={progresso.done} total={progresso.total} label={progresso.label} />
        </View>
      )}
      {espera && rodando && (
        <View style={styles.esperaWrap}>
          <Contagem espera={espera} />
        </View>
      )}
      {conectando && linhas.length === 0 ? (
        // skeleton no formato do log (linhas monoespaçadas de larguras variadas) em vez do dog de
        // tela cheia — assim quando o log real começa a pipocar a troca é suave, sem "flash".
        <View style={[styles.logBox, { marginBottom: insets.bottom + 12, padding: 12, gap: 9 }]}>
          {LARGURAS_LOG.map((w, i) => <EsqueletoLinha key={i} width={w} height={11} />)}
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          style={[styles.logBox, { marginBottom: insets.bottom + 12 }]}
          contentContainerStyle={{ padding: 12 }}
          onScroll={aoScrollar}
          scrollEventThrottle={32}
          onContentSizeChange={() => { if (atBottomRef.current) scrollRef.current?.scrollToEnd({ animated: true }); }}>
          {secoes.map((s) => (s.tipo === 'conta' ? (
            <CartaoConta key={s.key} s={s} linhas={linhas} aberta={estaAberta(s)}
              agora={rodando && s.key === ultimaConta} onToggle={() => alternar(s)} onCopiar={copiar} />
          ) : (
            <React.Fragment key={s.key}>
              {s.idx.map((i) => (
                <LogLinha key={i} raw={linhas[i]} onCopiar={(t) => copiar(t, 'linha copiada')} />
              ))}
            </React.Fragment>
          )))}
        </ScrollView>
      )}
      {copiadoMsg && (
        <View style={[styles.copiadoPill, { bottom: insets.bottom + 70 }]} pointerEvents="none">
          <Ionicons name="checkmark" size={14} color="#0F0F0F" />
          <Text style={styles.copiadoTxt}>{copiadoMsg}</Text>
        </View>
      )}
      <Animated.View
        pointerEvents={mostrarVoltar ? 'auto' : 'none'}
        style={[styles.voltarWrap, {
          bottom: insets.bottom + 22,
          opacity: botaoAnim,
          transform: [
            { translateY: botaoAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) },
            { scale: botaoAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) },
          ],
        }]}>
        <TouchableOpacity style={styles.voltarBtn} onPress={irAoFinal} activeOpacity={0.85}>
          <Text style={styles.voltarTxt}>↓ Ir ao final</Text>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.bg },
  topo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  topoAcoes: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  copiarBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  copiarTxt: { color: colors.texto, fontSize: 13, fontWeight: '600' },
  copiadoPill: { position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.ok, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  copiadoTxt: { color: '#0F0F0F', fontWeight: '700', fontSize: 13 },
  barraWrap: { paddingHorizontal: 16, paddingBottom: 12 },
  esperaWrap: { paddingHorizontal: 16, paddingBottom: 12, marginTop: -4 },
  logBox: { flex: 1, backgroundColor: '#0A0A0A', marginHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  loadingBox: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingTxt: { color: colors.textoFraco, fontSize: 13 },
  linha: { fontFamily: 'monospace', fontSize: 12, lineHeight: 18 },
  hora: { color: '#5A5A5A', fontSize: 11 },
  forte: { fontWeight: '700' },
  divisorWrap: { paddingVertical: 7 },
  divisor: { height: 1, backgroundColor: colors.border },
  titulo: { color: colors.laranja, fontSize: 13, fontWeight: '700', marginTop: 8, marginBottom: 2, letterSpacing: 0.3 },
  kvRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, paddingVertical: 2 },
  kvLabel: { color: colors.textoFraco, fontSize: 13, flexShrink: 1 },
  kvValor: { color: colors.texto, fontSize: 13, fontWeight: '600' },
  dmhead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 9, marginBottom: 1 },
  // faixa da CONTA rodando agora (marcador [conta]): destaque no log
  contaFaixa: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12, marginBottom: 4,
    paddingVertical: 7, paddingHorizontal: 10, borderRadius: 10, backgroundColor: colors.card2,
    borderLeftWidth: 3, borderLeftColor: colors.marca },
  contaFaixaFechada: { marginBottom: 0, opacity: 0.85 },
  contaUser: { color: colors.texto, fontSize: 15, fontWeight: '800', flex: 1 },
  contaPos: { color: colors.textoFraco, fontSize: 12, fontWeight: '700' },
  contaQtd: { color: colors.textoFraco, fontSize: 11, fontWeight: '600' },
  contaAgora: { color: colors.marca, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  // linhas da conta: recuadas com um fio à esquerda, pra ficar claro de quem é cada linha
  contaCorpo: { marginLeft: 8, paddingLeft: 10, borderLeftWidth: 1, borderLeftColor: colors.border, marginBottom: 4 },
  // rodapé do bloco aberto: fecha a conta sem precisar rolar de volta pro cabeçalho
  contaFechar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    marginLeft: 8, marginBottom: 10, paddingVertical: 6, opacity: 0.8 },
  contaFecharTxt: { color: colors.textoFraco, fontSize: 11, fontWeight: '700' },
  dmuser: { color: colors.texto, fontSize: 13.5, fontWeight: '700' },
  mensagem: { fontFamily: 'monospace', fontSize: 11, lineHeight: 16, color: colors.textoFraco, fontStyle: 'italic', paddingLeft: 18, opacity: 0.8 },
  sleep: { color: '#5A5A5A', fontSize: 10.5, fontStyle: 'italic', paddingLeft: 18, paddingVertical: 1 },
  voltarWrap: { position: 'absolute', right: 22 },
  voltarBtn: {
    backgroundColor: colors.laranja, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 6,
  },
  voltarTxt: { color: '#0F0F0F', fontWeight: '700', fontSize: 13 },
});

