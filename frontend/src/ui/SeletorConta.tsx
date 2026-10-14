import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { api, Account, Grupo } from '@/lib/api';
import { cmpTexto } from '@/lib/ordenar';
import { Credencial, lerCredenciais } from '@/lib/credenciais';
import { colors } from '@/theme';
import { LoadingDog } from '@/ui/LoadingDog';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;
// uma linha = credencial local (user+senha) e/ou conta do backend, casadas por @user
type Entry = { usuario: string; senha?: string; id?: string; ativa?: boolean; sessaoOk?: boolean };

/**
 * Popup pra escolher qual conta os bots vão usar. Mostra TODAS as contas com o status de
 * sessão colorido (mesmo padrão do Hub): ativa/sessão ok/sessão caiu/sem sessão.
 *  - sessão viva → ativa a conta (api.ativarConta) e chama onTrocou;
 *  - sem sessão/caída → manda pro reconectar (InstagramLogin, login preenchido).
 */
export function SeletorConta({ visible, onClose, onTrocou }: {
  visible: boolean; onClose: () => void; onTrocou?: () => void;
}) {
  const nav = useNavigation<Nav>();
  const [entries, setEntries] = useState<Entry[] | null>(null);   // null = carregando
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setEntries(null);
    const [contas, creds, gs] = await Promise.all([
      api.validarContas().catch(() => [] as Account[]),   // traz sessao_ok junto
      lerCredenciais().catch(() => [] as Credencial[]),
      api.getGrupos().catch(() => [] as Grupo[]),
    ]);
    setGrupos(gs);
    const map = new Map<string, Entry>();
    for (const c of creds) map.set(c.usuario.toLowerCase(), { usuario: c.usuario, senha: c.senha });
    for (const a of contas) {
      const k = (a.label || '').toLowerCase();
      const prev = map.get(k);
      map.set(k, { usuario: prev?.usuario || a.label, senha: prev?.senha,
        id: a.id, ativa: a.ativa, sessaoOk: a.sessao_ok });
    }
    setEntries([...map.values()].sort((a, b) => cmpTexto(a.usuario, b.usuario)));
  }, []);

  useEffect(() => { if (visible) carregar(); else setEntries(null); }, [visible, carregar]);

  function escolher(e: Entry) {
    if (busy) return;
    // sem sessão viva → reconectar (com o login preenchido, se tiver credencial salva)
    if (!e.id || e.sessaoOk === false) {
      onClose();
      nav.navigate('InstagramLogin', { label: e.usuario, senha: e.senha });
      return;
    }
    if (e.ativa) { onClose(); return; }   // já é a ativa
    setBusy(e.usuario);
    api.ativarConta(e.id).then(() => { onTrocou?.(); onClose(); })
      .catch(() => {}).finally(() => setBusy(null));
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.wrap} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.titulo}>Trocar conta</Text>
          <Text style={styles.dica}>A conta que os bots vão usar. Sem sessão viva, cai no reconectar.</Text>
          {entries === null ? (
            <View style={styles.center}><LoadingDog size={34} /></View>
          ) : entries.length === 0 ? (
            <Text style={styles.vazio}>Nenhuma conta ainda. Conecta uma na tela de Contas.</Text>
          ) : (
            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 2 }}>
              {secoes(entries, grupos).map((s) => (
              <View key={s.titulo ?? '__todas'}>
              {s.titulo ? (
                <View style={styles.grupoHead}>
                  <Text style={styles.grupoTitulo}>{s.titulo}</Text>
                  <Text style={styles.grupoQtd}>{s.itens.length}</Text>
                </View>
              ) : null}
              {s.itens.map((e) => {
                let status: string, cor: string;
                if (!e.id) { status = 'sem sessão'; cor = colors.erro; }
                else if (e.sessaoOk === false) { status = 'sessão caiu'; cor = colors.erro; }
                else if (e.ativa) { status = 'ativa · em uso'; cor = colors.ok; }
                else { status = 'sessão ok'; cor = colors.texto; }
                const reconectar = !e.id || e.sessaoOk === false;
                return (
                  <TouchableOpacity key={e.usuario} style={styles.linha} onPress={() => escolher(e)}
                    disabled={!!busy} activeOpacity={0.7}>
                    <View style={[styles.dot, { backgroundColor: cor }]} />
                    <Text style={styles.nome} numberOfLines={1}>@{e.usuario}</Text>
                    <Text style={[styles.status, { color: cor }]}>{status}</Text>
                    {busy === e.usuario ? <LoadingDog size={18} />
                      : reconectar ? (
                        <View style={styles.acaoWrap}>
                          <Ionicons name="link" size={15} color={colors.marca} />
                          <Text style={[styles.acao, { color: colors.marca }]}>{e.id ? 'reconectar' : 'conectar'}</Text>
                        </View>
                      ) : e.ativa ? (
                        <Ionicons name="checkmark" size={18} color={colors.ok} />
                      ) : (
                        <View style={styles.acaoWrap}>
                          <Ionicons name="power" size={15} color={colors.texto} />
                          <Text style={[styles.acao, { color: colors.texto }]}>usar</Text>
                        </View>
                      )}
                  </TouchableOpacity>
                );
              })}
              </View>
              ))}
            </ScrollView>
          )}
          <TouchableOpacity onPress={onClose} style={styles.fechar} hitSlop={8}>
            <Text style={styles.fecharTxt}>fechar</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// contas separadas por GRUPO (ordem dos grupos) + "Avulsas" — igual o card de Contas do Hub.
// Sem nenhum grupo com conta → uma seção só, sem título.
function secoes(entries: Entry[], grupos: Grupo[]): { titulo: string | null; itens: Entry[] }[] {
  const out: { titulo: string | null; itens: Entry[] }[] = [];
  const comGrupo = new Set<string>();
  for (const g of grupos) {
    const itens = entries.filter((e) => e.id && g.contas.includes(e.id));
    if (!itens.length) continue;
    itens.forEach((e) => comGrupo.add(e.usuario));
    out.push({ titulo: g.nome, itens });
  }
  const avulsas = entries.filter((e) => !comGrupo.has(e.usuario));
  if (avulsas.length) out.push({ titulo: out.length ? 'Avulsas' : null, itens: avulsas });
  return out;
}

const styles = StyleSheet.create({
  grupoHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, marginBottom: 2 },
  grupoTitulo: { color: colors.marca, fontSize: 12, fontWeight: '800' },
  grupoQtd: { color: colors.textoFraco, fontSize: 11, fontWeight: '700' },
  wrap: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.55)' },
  card: { backgroundColor: '#171717', borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 18, gap: 10 },
  titulo: { color: colors.texto, fontSize: 18, fontWeight: '800' },
  dica: { color: colors.textoFraco, fontSize: 12, lineHeight: 16 },
  center: { paddingVertical: 24, alignItems: 'center' },
  vazio: { color: colors.textoFraco, textAlign: 'center', paddingVertical: 20 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  dot: { width: 9, height: 9, borderRadius: 999 },
  nome: { color: colors.texto, fontSize: 14, fontWeight: '700', flex: 1 },
  status: { fontSize: 11, fontWeight: '600' },
  acaoWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  acao: { fontSize: 12, fontWeight: '700' },
  fechar: { alignSelf: 'center', paddingVertical: 6, marginTop: 2 },
  fecharTxt: { color: colors.textoFraco, fontSize: 14, fontWeight: '600' },
});
