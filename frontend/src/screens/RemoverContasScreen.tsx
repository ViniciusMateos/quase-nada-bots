import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/lib/api';
import { garantirLA } from '@/lib/la';
import { ehUsername } from '@/lib/syncEmulador';
import { cmpTexto } from '@/lib/ordenar';
import { colors } from '@/theme';
import { Botao, Card } from '@/ui/components';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * Remover Contas DO EMULADOR (27/10/2026): o agente do PC entra em cada conta escolhida e termina a
 * sessão no app do IG (Definições → Terminar sessão), uma por vez — libera vaga no teto de ~10 contas
 * por aparelho. A conta NÃO é apagada do Instagram nem do app: só sai do emulador (o agente tira o
 * "emulador" dos locais dela, senão o "verificar e sincronizar" logaria de volta).
 */
export function RemoverContasScreen() {
  const nav = useNavigation<Nav>();
  const [logadas, setLogadas] = useState<string[]>([]);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [carregando, setCarregando] = useState(true);
  const [msg, setMsg] = useState('');
  const [disparando, setDisparando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const st = await api.emuladorStatus();
      setLogadas((st?.contas_logadas ?? []).filter(ehUsername).sort(cmpTexto));
      setMsg('');
    } catch { setMsg('Não consegui ler as contas do emulador.'); }
    setCarregando(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  function alternar(u: string) {
    setMarcadas((s) => { const n = new Set(s); n.has(u) ? n.delete(u) : n.add(u); return n; });
  }

  const escolhidas = logadas.filter((u) => marcadas.has(u));

  function confirmar() {
    if (!escolhidas.length) return;
    const lista = escolhidas.map((u) => `@${u}`).join(', ');
    Alert.alert('Tirar do emulador', `Terminar a sessão de ${lista} no emulador? A conta continua existindo no Instagram e salva no app.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Tirar', style: 'destructive', onPress: remover },
    ]);
  }

  async function remover() {
    setDisparando(true); setMsg('');
    try {
      const run = await api.startRun('remover-conta', { contas: escolhidas });
      const n = escolhidas.length;
      const nome = n === 1 ? `Remover · @${escolhidas[0]}` : `Remover Contas · ${n}`;
      garantirLA(nome);   // barra viva no lock screen: enche conta a conta
      nav.navigate('Run', { runId: run.id, nome });
    } catch (e) {
      setMsg((e as Error).message || 'erro ao disparar');
    }
    setDisparando(false);
  }

  return (
    <ScrollView style={styles.tela} contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
      <Card>
        <View style={styles.infoHead}>
          <Ionicons name="information-circle-outline" size={16} color={colors.marca} />
          <Text style={styles.sec}>Como funciona</Text>
        </View>
        <Text style={styles.dica}>
          O bot entra em cada conta marcada e termina a sessão no app do Instagram do emulador, uma por
          vez. Serve pra abrir vaga no limite de ~10 contas por aparelho. A conta não é apagada: continua
          no Instagram e aqui no app, só deixa de ser usada no emulador.
        </Text>
      </Card>

      <Card>
        <View style={styles.cabecalho}>
          <Text style={[styles.sec, { marginBottom: 0 }]}>Logadas no emulador ({logadas.length})</Text>
          <TouchableOpacity onPress={carregar} hitSlop={8}>
            <Ionicons name="refresh" size={18} color={colors.marca} />
          </TouchableOpacity>
        </View>
        {carregando ? (
          <Text style={styles.dica}>Carregando…</Text>
        ) : logadas.length === 0 ? (
          <Text style={styles.dica}>Nenhuma conta logada (ou o PC do emulador está offline).</Text>
        ) : logadas.map((u) => {
          const on = marcadas.has(u);
          return (
            <TouchableOpacity key={u} onPress={() => alternar(u)} style={styles.linha} activeOpacity={0.7}>
              <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? colors.erro : colors.textoFraco} />
              <Text style={styles.user} numberOfLines={1}>@{u}</Text>
            </TouchableOpacity>
          );
        })}
        {!!msg && <Text style={[styles.dica, { color: colors.erro }]}>{msg}</Text>}
        <View style={{ marginTop: 14 }}>
          <Botao
            title={disparando ? 'Disparando…' : escolhidas.length ? `Tirar ${escolhidas.length} do emulador` : 'Marque as contas'}
            cor={colors.erro} onPress={confirmar} disabled={!escolhidas.length || disparando} loading={disparando} />
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.bg },
  infoHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  cabecalho: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  sec: { color: colors.textoFraco, fontSize: 12, fontWeight: '700', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  dica: { color: colors.textoFraco, fontSize: 12.5, lineHeight: 18, marginTop: 8 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderTopWidth: 1, borderTopColor: colors.border },
  user: { color: colors.texto, fontSize: 15, fontWeight: '700', flex: 1 },
});
