import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Account, api, Bot, EmuladorStatus, locaisDe, RunInfo } from '@/lib/api';
import { CONTA_BRECHO, ehUsername, sincronizarEmulador } from '@/lib/syncEmulador';
import { cmpTexto } from '@/lib/ordenar';
import { colors } from '@/theme';
import { Aparece, Card, CartaoTocavel, Pill, Pulsar } from '@/ui/components';
import { Esqueleto, EsqueletoCartao } from '@/ui/Esqueleto';
import { BarraTopo } from '@/ui/BarraTopo';
import { useDogRefresh } from '@/ui/DogRefresh';
import { RodandoAgora } from '@/ui/RodandoAgora';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

// Bots que rodam NO EMULADOR (device real): auto-follow e DM (desde 19/10) e o story do brechó
// (20/10, numa instância do MuMu só dele). Fallback cobre backend que não devolva o bot em /bots.
const BOTS_EMULADOR: {
  id: string; icone: keyof typeof Ionicons.glyphMap; nomeFallback: string; descFallback: string;
}[] = [
  { id: 'auto-follow', icone: 'person-add', nomeFallback: 'Auto Follow',
    descFallback: 'Segue os curtidores dos posts compartilhados num chat.' },
  { id: 'dm-followers', icone: 'chatbubbles', nomeFallback: 'DM Followers',
    descFallback: 'Manda DM de obrigado pros novos seguidores de cada conta.' },
  // story da conta do brechó, pelo app de verdade, numa instância do MuMu só dela (20/10)
  { id: 'story-brecho', icone: 'images', nomeFallback: 'Story Repost',
    descFallback: 'Posta as peças disponíveis no story do brechó pelo app.' },
];

export function EmuladorScreen() {
  const nav = useNavigation<Nav>();
  const [bots, setBots] = useState<Record<string, Bot>>({});
  const [status, setStatus] = useState<EmuladorStatus | null>(null);
  const [semStatus, setSemStatus] = useState(false);   // backend não expõe /emulador/status
  const [loading, setLoading] = useState(false);
  const [runs, setRuns] = useState<RunInfo[]>([]);
  const [contas, setContas] = useState<Account[] | null>(null);   // contas cadastradas (todas)
  const [sincronizando, setSincronizando] = useState(false);

  // busca o status do agente isolado — pode falhar sozinho (endpoint ausente) sem derrubar a tela
  const puxarStatus = useCallback(async () => {
    try { setStatus(await api.emuladorStatus()); setSemStatus(false); }
    catch { setSemStatus(true); setStatus(null); }
  }, []);

  // o que está rodando (emulador E servidor — cada um com o rótulo de onde roda)
  const puxarRuns = useCallback(async () => {
    try { setRuns(await api.listRuns()); } catch { /* offline */ }
  }, []);

  const puxarContas = useCallback(async () => {
    try { setContas(await api.getAccounts()); } catch { /* offline: mantém a última */ }
  }, []);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [b] = await Promise.all([
        api.listBots().catch(() => ({} as Record<string, Bot>)),
        puxarStatus(),
        puxarRuns(),
        puxarContas(),
      ]);
      setBots(b);
    } finally { setLoading(false); }
  }, [puxarStatus, puxarRuns, puxarContas]);

  // VERIFICAR = sincroniza com o emulador E verifica a fundo (20/10). Primeiro a sincronização:
  // conta do emulador que o app não tem entra no app; conta do app fora do emulador vai pra fila
  // de login (o brechó no emulador dele). Depois enfileira a verificação profunda — a fila é uma por
  // vez, então ela roda DEPOIS dos logins e já pega as contas novas. O poll de 5s acompanha.
  const verificar = useCallback(async () => {
    if (status?.verificando_sessoes || sincronizando) return;
    setSincronizando(true);
    let r: Awaited<ReturnType<typeof sincronizarEmulador>> | null = null;
    try { r = await sincronizarEmulador(); } catch { /* segue pra verificação mesmo assim */ }
    try { await api.verificarSessoes(); } catch { /* backend pode não expor ainda */ }
    setSincronizando(false);
    puxarStatus(); puxarContas();
    if (r && (r.adicionadas.length || r.logando.length || r.semSenha.length || r.senhaIncorreta.length)) {
      const partes: string[] = [];
      if (r.adicionadas.length) partes.push(`Entraram no app: ${r.adicionadas.map((u) => '@' + u).join(', ')}`);
      if (r.logando.length) partes.push(`Logando: ${r.logando.map((u) => '@' + u).join(', ')}`);
      if (r.semSenha.length) partes.push(`Sem senha salva (edite a conta e ponha a senha): ${r.semSenha.map((u) => '@' + u).join(', ')}`);
      if (r.senhaIncorreta.length) partes.push(`Senha incorreta (o Instagram recusou; edite a conta e corrija): ${r.senhaIncorreta.map((u) => '@' + u).join(', ')}`);
      Alert.alert('Sincronizado', partes.join('\n\n'));
    }
  }, [status?.verificando_sessoes, sincronizando, puxarStatus, puxarContas]);

  useFocusEffect(useCallback(() => {
    carregar();
    // mantém o status do agente vivo enquanto a aba está aberta (leve: 1 GET a cada 5s) e o
    // "Rodando agora" andando sozinho (2,5s, igual a aba Servidor)
    const id = setInterval(puxarStatus, 5000);
    const idRuns = setInterval(puxarRuns, 2500);
    return () => { clearInterval(id); clearInterval(idRuns); };
  }, [carregar, puxarStatus, puxarRuns]));

  const { scrollProps, dog, spacerEl } = useDogRefresh(carregar);

  // loading inicial → skeleton no formato da tela (com a barra de cima), em vez de dog de tela cheia
  if (loading && !Object.keys(bots).length && !status && !semStatus) {
    return (
      <View style={styles.tela}>
        <BarraTopo />
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <EsqueletoCartao linhas={1} />
          <EsqueletoCartao linhas={1} />
          <EsqueletoCartao linhas={1} />
        </ScrollView>
      </View>
    );
  }

  const online = !!status?.online;
  const statusTxt = semStatus ? 'indisponível' : online ? 'online' : 'offline';
  const corStatus = semStatus ? colors.textoFraco : online ? colors.ok : colors.erro;
  const statusSub = semStatus ? 'sem status do PC agora'
    : online ? 'conectado e pronto pra rodar'
    : 'o PC não está respondendo';
  const verificando = !!status?.verificando_sessoes || sincronizando;   // sincronizando/verificando?
  // TODAS as contas marcadas pro emulador (+ as logadas lá que ainda não estão no app), cada uma
  // com o estado: sessão ok / bloqueada / não sincronizada (fora do emulador) / cadeado.
  const logadas = new Set((status?.contas_logadas ?? []).map((u) => u.toLowerCase()));
  const porLabel = new Map((contas ?? []).map((a) => [(a.label || '').toLowerCase(), a]));
  const nomesEmu = new Set<string>();
  for (const a of contas ?? []) if (locaisDe(a).includes('emulador') && a.label) nomesEmu.add(a.label);
  for (const u of status?.contas_logadas ?? []) {
    const a = porLabel.get(u.toLowerCase());
    if (ehUsername(u) && (!a || locaisDe(a).includes('emulador'))) nomesEmu.add(u);
  }
  const contasEmu = [...nomesEmu].filter((u) => u.toLowerCase() !== CONTA_BRECHO).sort(cmpTexto);
  // PRINCIPAL = a conta do brechó (emulador próprio, desligado): o estado é o último que os jobs
  // dela reportaram; AUXILIARES = as outras (emulador das segue)
  const temBrecho = (contas ?? []).some((a) => (a.label || '').toLowerCase() === CONTA_BRECHO);
  const stBrecho = status?.sessoes?.[CONTA_BRECHO];
  const brechoTxt = stBrecho === 'ok' ? 'logada' : stBrecho === 'senha_incorreta' ? 'senha incorreta'
    : stBrecho === 'bloqueada' ? 'bloqueada' : 'não sincronizada';
  const brechoCor = stBrecho === 'ok' ? colors.ok
    : stBrecho === 'senha_incorreta' || stBrecho === 'bloqueada' ? colors.erro : colors.laranja;
  const ativos = runs.filter((r) => ['rodando', 'iniciando'].includes(r.status)).reverse();

  return (
    <View style={styles.tela}>
      <BarraTopo />
      <View style={{ flex: 1 }}>
      {dog}
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} {...scrollProps}>
        {spacerEl}

        {/* status do PC (agente + emulador que rodam os bots) */}
        <Aparece>
          <Card>
            <View style={styles.statusHead}>
              <View style={styles.statusEsq}>
                <Ionicons name="phone-portrait" size={22} color={colors.marca} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.statusTitulo}>Emulador</Text>
                  <Text style={styles.statusSub} numberOfLines={1}>{statusSub}</Text>
                </View>
              </View>
              <Pill texto={statusTxt} cor={corStatus} />
            </View>
          </Card>
        </Aparece>

        {/* o que está rodando agora */}
        {ativos.length > 0 && (
          <Aparece delay={15}>
            <RodandoAgora runs={ativos}
              onAbrir={(r) => nav.navigate('Run', { runId: r.id, nome: r.titulo ?? r.bot })} />
          </Aparece>
        )}

        {/* TODAS as contas com o estado de cada uma + verificar (que já sincroniza) */}
        <Aparece delay={30}>
          <Card>
            <View style={styles.contasHead}>
              <Text style={styles.secao}>Contas</Text>
              {/* ações no próprio cartão: verificar (já sincroniza) + gerenciar */}
              <View style={styles.contasAcoes}>
                <TouchableOpacity onPress={verificar} disabled={verificando || semStatus} hitSlop={8} style={styles.verBtn}>
                  <Ionicons name="shield-checkmark-outline" size={14}
                    color={verificando || semStatus ? colors.textoFraco : colors.marca} />
                  <Text style={[styles.verTxt, (verificando || semStatus) && { color: colors.textoFraco }]}>
                    {sincronizando ? 'sincronizando…' : verificando ? 'verificando…' : 'verificar'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => nav.navigate('ContasIg')} hitSlop={8}>
                  <Text style={styles.verTxt}>gerenciar</Text>
                </TouchableOpacity>
              </View>
            </View>
            {(status === null && !semStatus) || contas === null ? (
              [0, 1, 2, 3].map((i) => (
                <View key={i} style={styles.contaLinha}>
                  <Esqueleto width={9} height={9} radius={999} />
                  <Esqueleto width={130} height={12} />
                </View>
              ))
            ) : contasEmu.length === 0 && !temBrecho ? (
              <Text style={styles.vazio}>
                {semStatus ? 'sem status do PC agora.'
                  : 'Nenhuma conta ainda. Adicione em "gerenciar" — ao verificar, o agente loga sozinho.'}
              </Text>
            ) : (
              <>
              {temBrecho ? (
                <>
                  <Text style={styles.grupoTitulo}>Principal</Text>
                  <View style={styles.contaLinha}>
                    <View style={[styles.contaDot, { backgroundColor: brechoCor }]} />
                    <Text style={styles.contaNome} numberOfLines={1}>@{CONTA_BRECHO}</Text>
                    <Text style={[styles.contaStatus, { color: brechoCor }]}>{brechoTxt}</Text>
                  </View>
                  <Text style={styles.grupoSub}>emulador próprio — liga só na hora do story</Text>
                </>
              ) : null}
              {contasEmu.length ? <Text style={styles.grupoTitulo}>Auxiliares</Text> : null}
              {contasEmu.map((u) => {
              const st = status?.sessoes?.[u];
              const noDevice = logadas.has(u.toLowerCase());
              // enquanto verifica, as do device ficam "verificando" — nunca mostra o status velho
              // em cache (ok/desconhecida/etc.) de uma checagem anterior.
              const checando = verificando && noDevice;
              let txt: string, cor: string;
              if (!noDevice) {
                // fora do emulador: o verificar loga ela
                txt = 'não sincronizada'; cor = colors.laranja;
              }
              else if (checando) { txt = 'verificando…'; cor = colors.textoFraco; }
              else if (st === 'ok') { txt = 'sessão ok'; cor = colors.ok; }
              else if (st === 'bloqueada') { txt = 'bloqueada'; cor = colors.erro; }
              else if (st === 'desconhecida') { txt = 'desconhecida'; cor = colors.textoFraco; }
              else { txt = 'logada'; cor = colors.texto; }   // no device, ainda não verificada a fundo
              return (
                <View key={u} style={styles.contaLinha}>
                  <Pulsar ativo={checando}><View style={[styles.contaDot, { backgroundColor: cor }]} /></Pulsar>
                  <Text style={styles.contaNome} numberOfLines={1}>
                    @{u}{u === status?.conta_ativa ? ' · ativa' : ''}
                  </Text>
                  <Text style={[styles.contaStatus, { color: cor }]}>{txt}</Text>
                </View>
              );
            })}
              </>
            )}
            <Text style={styles.dica}>
              "Verificar" já sincroniza: loga as contas que faltam (a do brechó no emulador dela), traz
              pro app as que já estavam logadas e entra em cada auxiliar pra confirmar quem está ok ou
              bloqueada.
            </Text>
          </Card>
        </Aparece>

        {/* bots do device — tocam pra tela de rodar (BotScreen reusado: modos, conta, fila,
            garantirLA e navegação pro Run já vivem lá). */}
        {BOTS_EMULADOR.map((b, i) => {
          const real = bots[b.id];
          const nome = real?.nome ?? b.nomeFallback;
          const desc = real?.descricao ?? b.descFallback;
          return (
            <Aparece key={b.id} delay={(i + 1) * 60}>
              <CartaoTocavel onPress={() => nav.navigate('Bot', { botId: b.id, nome })}>
                <View style={styles.linha}>
                  <Ionicons name={b.icone} size={24} color={colors.marca} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.botNome}>{nome}</Text>
                    <Text style={styles.botDesc}>{desc}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textoFraco} />
                </View>
              </CartaoTocavel>
            </Aparece>
          );
        })}
      </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.bg },
  statusHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  statusEsq: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  statusTitulo: { color: colors.texto, fontSize: 16, fontWeight: '800' },
  statusSub: { color: colors.textoFraco, fontSize: 12, marginTop: 2 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  botNome: { color: colors.texto, fontSize: 18, fontWeight: '700' },
  botDesc: { color: colors.textoFraco, fontSize: 13, marginTop: 4 },
  // seção "Contas no emulador"
  contasHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  secao: { color: colors.textoFraco, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  contasAcoes: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  verBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  verTxt: { color: colors.marca, fontSize: 12, fontWeight: '700' },
  contaLinha: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 6 },
  grupoTitulo: { color: colors.textoFraco, fontSize: 11, fontWeight: '700', marginTop: 8, marginBottom: 2 },
  grupoSub: { color: colors.textoFraco, fontSize: 11, marginLeft: 18, marginTop: -4, marginBottom: 2 },
  contaDot: { width: 9, height: 9, borderRadius: 999 },
  contaNome: { color: colors.texto, fontSize: 14, fontWeight: '700', flex: 1 },
  contaStatus: { fontSize: 11, fontWeight: '600' },
  vazio: { color: colors.textoFraco, fontSize: 13, lineHeight: 18, paddingVertical: 4 },
  dica: { color: colors.textoFraco, fontSize: 11, lineHeight: 15, marginTop: 8 },
});
