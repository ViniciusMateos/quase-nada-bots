import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { api, Bot, RunInfo, Account } from '@/lib/api';
import { cmpTexto } from '@/lib/ordenar';
import { Credencial, lerCredenciais } from '@/lib/credenciais';
import { colors, statusCor } from '@/theme';
import { Aparece, BarraProgresso, Card, CartaoTocavel, Pill, Pulsar } from '@/ui/components';
import { Contagem } from '@/ui/Contagem';
import { TelaCarregando } from '@/ui/LoadingDog';
import { useDogRefresh } from '@/ui/DogRefresh';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type AccEntry = { usuario: string; senha?: string; id?: string; ativa?: boolean };

export function HubScreen() {
  const nav = useNavigation<Nav>();
  const [bots, setBots] = useState<[string, Bot][]>([]);
  const [runs, setRuns] = useState<RunInfo[]>([]);
  const [contas, setContas] = useState<Account[]>([]);
  const [creds, setCreds] = useState<Credencial[]>([]);
  const [busyConta, setBusyConta] = useState<string | null>(null);
  const [sessoes, setSessoes] = useState<Record<string, boolean>>({});   // id → sessão viva?
  const [verificando, setVerificando] = useState(false);
  const jaValidou = useRef(false);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // revalidação automática ao terminar uma conexão (import de cookies): sem isto, depois de
  // conectar/reconectar pelo Hub a conta ficava com status velho até tocar "sincronizar" na mão.
  const validarRef = useRef<() => void>(() => {});
  const importVistos = useRef<Set<string>>(new Set());
  const primeiraCargaRuns = useRef(true);
  const checarConexaoNova = useCallback((rs: RunInfo[]) => {
    // conexões (import) que JÁ terminaram e ainda não tratei → revalida as sessões sozinho
    const novas = rs.filter((r) =>
      (r.params as { import_cookies?: unknown })?.import_cookies &&
      ['finalizado', 'parado', 'erro'].includes(r.status) &&
      !importVistos.current.has(r.id));
    novas.forEach((r) => importVistos.current.add(r.id));
    if (primeiraCargaRuns.current) { primeiraCargaRuns.current = false; return; } // 1ª carga: só marca
    if (novas.length) validarRef.current();   // uma conexão acabou desde a última vez → sincroniza
  }, []);

  const carregar = useCallback(async () => {
    setLoading(true); setErro(null);
    try {
      const [b, r, cs, cr] = await Promise.all([
        api.listBots(), api.listRuns(),
        api.getAccounts().catch(() => [] as Account[]),
        lerCredenciais().catch(() => [] as Credencial[]),
      ]);
      setBots(Object.entries(b));
      setRuns(r);
      checarConexaoNova(r);
      setContas(cs);
      setCreds(cr);
    } catch {
      // a URL vem cravada do build (não há config manual) — mandar "confira em
      // Configurações" era mentira: não tem o que configurar lá.
      setErro('Não consegui conectar no servidor. Puxe pra atualizar; se persistir, o server pode estar fora.');
    } finally {
      setLoading(false);
    }
  }, [checarConexaoNova]);

  // só as runs (leve) — pra atualizar "Rodando agora" e a barra de progresso sem recarregar
  // a lista de bots inteira. Também detecta conexão que acabou → revalida sozinho.
  const atualizarRuns = useCallback(async () => {
    try { const rs = await api.listRuns(); setRuns(rs); checarConexaoNova(rs); } catch { /* offline */ }
  }, [checarConexaoNova]);

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
  useEffect(() => { validarRef.current = validar; }, [validar]);

  useFocusEffect(useCallback(() => {
    carregar();
    // valida as sessões UMA vez ao abrir (não a cada foco — é pesado-ish e bate no IG).
    // pull-to-refresh revalida quando você quiser.
    if (!jaValidou.current) { jaValidou.current = true; validar(); }
    // POLL enquanto a Home está aberta: antes só recarregava ao focar, então parado na tela
    // o "Rodando agora" congelava e o progresso não andava até você sair e voltar. Agora
    // atualiza sozinho a cada 2,5s, independente de você entrar no log.
    const id = setInterval(atualizarRuns, 2500);
    return () => clearInterval(id);
  }, [carregar, atualizarRuns, validar]));

  const { scrollProps, dog, spacerEl } = useDogRefresh(async () => { await carregar(); await validar(); });

  const ativos = runs.filter((r) => ['rodando', 'iniciando'].includes(r.status)).reverse();

  // contas (backend + credenciais locais), casadas por @user e em ordem alfabética
  const entradas = useMemo<AccEntry[]>(() => {
    const map = new Map<string, AccEntry>();
    for (const c of creds) map.set(c.usuario.toLowerCase(), { usuario: c.usuario, senha: c.senha });
    for (const a of contas) {
      const k = (a.label || '').toLowerCase();
      const prev = map.get(k);
      map.set(k, { usuario: prev?.usuario || a.label, senha: prev?.senha, id: a.id, ativa: a.ativa });
    }
    return [...map.values()].sort((a, b) => cmpTexto(a.usuario, b.usuario));
  }, [creds, contas]);

  function ativarConta(e: AccEntry) {
    if (!e.id || e.ativa || busyConta) return;
    setBusyConta(e.usuario);
    api.ativarConta(e.id).then(carregar).catch(() => {}).finally(() => setBusyConta(null));
  }

  if (loading && bots.length === 0 && !erro) return <TelaCarregando />;

  return (
    <View style={styles.tela}>
      {dog}
      <FlatList
        data={bots}
        keyExtractor={([id]) => id}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        {...scrollProps}
        ListHeaderComponent={
          <>
          {spacerEl}
          <View style={{ gap: 12, marginBottom: 4 }}>
            <View style={styles.topo}>
              <Text style={styles.titulo}>Seus bots</Text>
              <View style={styles.topoAcoes}>
                <TouchableOpacity onPress={() => nav.navigate('Historico')} hitSlop={8}>
                  <Ionicons name="time-outline" size={23} color={colors.textoFraco} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => nav.navigate('Settings')} hitSlop={8}>
                  <Ionicons name="settings-outline" size={22} color={colors.textoFraco} />
                </TouchableOpacity>
              </View>
            </View>
            {erro && (
              <Card style={{ borderColor: colors.erro }}>
                <Text style={{ color: colors.erro }}>{erro}</Text>
              </Card>
            )}
            {ativos.length > 0 && (
              <Card>
                <Text style={styles.secao}>Rodando agora</Text>
                {ativos.map((r) => (
                  <TouchableOpacity key={r.id} style={styles.runItem}
                    onPress={() => nav.navigate('Run', { runId: r.id, nome: r.titulo ?? r.bot })}>
                    <View style={styles.runLinha}>
                      {/* titulo é universal: "Conectando Instagram" no connect, "Auto Follow"
                          numa run normal — em vez do id cru "auto-follow" */}
                      <Text style={styles.runTxt}>{r.titulo ?? r.bot}</Text>
                      <Pulsar>
                        <Pill texto={r.status} cor={statusCor[r.status] ?? colors.textoFraco} />
                      </Pulsar>
                    </View>
                    {/* a LINHA VIVA do log embaixo do nome — o que o bot está fazendo AGORA */}
                    {r.espera ? (
                      <Contagem espera={r.espera} />
                    ) : r.status_log ? (
                      <Text style={styles.runLog} numberOfLines={1}>{r.status_log}</Text>
                    ) : null}
                    {r.progress && r.progress.total > 0 && (
                      <BarraProgresso done={r.progress.done} total={r.progress.total} label={r.progress.label} />
                    )}
                  </TouchableOpacity>
                ))}
              </Card>
            )}
            {entradas.length > 0 && (
              <Card>
                <View style={styles.contasHead}>
                  <Text style={styles.secao}>Contas {verificando ? '· verificando…' : ''}</Text>
                  <View style={styles.contasAcoes}>
                    <TouchableOpacity onPress={() => { if (!verificando) validar(); }} disabled={verificando}
                      hitSlop={8} style={styles.contaBtn}>
                      <Ionicons name="sync" size={14} color={verificando ? colors.textoFraco : colors.marca} />
                      <Text style={[styles.gerenciar, verificando && { color: colors.textoFraco }]}>sincronizar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => nav.navigate('ContasIg')} hitSlop={8}>
                      <Text style={styles.gerenciar}>gerenciar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                {entradas.map((e) => {
                  const sess = e.id ? sessoes[e.id] : undefined;   // true/false/undefined(=não checou)
                  const checando = verificando && !!e.id && sess === undefined;
                  const caiu = !!e.id && sess === false;
                  // verde SÓ na conta ativa (a que os bots usam) — é o único estado "pertinente"
                  // pra destacar. Sessão ok (mas não ativa) fica branca/neutra; problema fica
                  // vermelho; verificando cinza.
                  let status: string, cor: string;
                  if (!e.id) { status = 'sem sessão'; cor = colors.erro; }
                  else if (checando) { status = 'verificando…'; cor = colors.textoFraco; }
                  else if (caiu) { status = 'sessão caiu'; cor = colors.erro; }
                  else if (e.ativa) { status = 'ativa · em uso'; cor = colors.ok; }
                  else { status = 'sessão ok'; cor = colors.texto; }
                  return (
                    <View key={e.usuario} style={styles.contaLinha}>
                      <View style={[styles.contaDot, { backgroundColor: cor }]} />
                      <Text style={styles.contaNome} numberOfLines={1}>@{e.usuario}</Text>
                      <Text style={[styles.contaStatus, { color: cor }]}>{status}</Text>
                      {busyConta === e.usuario ? (
                        <Text style={styles.contaAcao}>…</Text>
                      ) : checando ? null
                        : (!!e.id && !caiu && !e.ativa) ? (
                          <TouchableOpacity onPress={() => ativarConta(e)} hitSlop={8} style={styles.contaBtn}>
                            <Ionicons name="power" size={17} color={colors.texto} />
                            <Text style={[styles.contaAcao, { color: colors.texto }]}>ativar</Text>
                          </TouchableOpacity>
                        ) : (!e.id || caiu) ? (
                          <TouchableOpacity onPress={() => nav.navigate('InstagramLogin', { label: e.usuario, senha: e.senha })}
                            hitSlop={8} style={styles.contaBtn}>
                            <Ionicons name="link" size={16} color={colors.marca} />
                            <Text style={[styles.contaAcao, { color: colors.marca }]}>{caiu ? 'reconectar' : 'conectar'}</Text>
                          </TouchableOpacity>
                        ) : null}
                    </View>
                  );
                })}
              </Card>
            )}
          </View>
          </>
        }
        renderItem={({ item: [id, bot], index }) => (
          <Aparece delay={index * 60}>
            <CartaoTocavel onPress={() => nav.navigate('Bot', { botId: id, nome: bot.nome })}>
              <Text style={styles.botNome}>{bot.nome}</Text>
              <Text style={styles.botDesc}>{bot.descricao}</Text>
            </CartaoTocavel>
          </Aparece>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.bg },
  topo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  topoAcoes: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  titulo: { color: colors.texto, fontSize: 24, fontWeight: '800' },
  secao: { color: colors.textoFraco, fontSize: 12, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase' },
  runItem: { paddingVertical: 8, gap: 8 },
  runLinha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  runTxt: { color: colors.texto, fontSize: 15 },
  runLog: { color: colors.textoFraco, fontSize: 12, fontFamily: 'monospace', marginTop: -2 },
  botNome: { color: colors.texto, fontSize: 18, fontWeight: '700' },
  botDesc: { color: colors.textoFraco, fontSize: 13, marginTop: 4 },
  contasHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  contasAcoes: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  gerenciar: { color: colors.marca, fontSize: 12, fontWeight: '700' },
  contaLinha: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 6 },
  contaDot: { width: 9, height: 9, borderRadius: 999 },
  contaNome: { color: colors.texto, fontSize: 14, fontWeight: '700', flex: 1 },
  contaStatus: { fontSize: 11, fontWeight: '600' },
  contaBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  contaAcao: { fontSize: 12, fontWeight: '700', color: colors.textoFraco },
});
