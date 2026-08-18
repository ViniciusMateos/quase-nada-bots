import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme';
import { Aparece, Botao, Card } from '@/ui/components';
import { OTA_VERSION, rodandoDeUpdate } from '@/constants/otaVersion';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type EstadoOta = 'checando' | 'atualizado' | 'disponivel' | 'baixando' | 'erro';

// expo-updates guardado: em dev client / Expo Go o módulo pode nem existir.
function getUpdates(): {
  checkForUpdateAsync?: () => Promise<{ isAvailable: boolean }>;
  fetchUpdateAsync?: () => Promise<unknown>;
  reloadAsync?: () => Promise<void>;
} | null {
  try { return require('expo-updates'); } catch { return null; }
}

export function SettingsScreen() {
  const nav = useNavigation<Nav>();
  const [ota, setOta] = useState<EstadoOta>('checando');

  // ao abrir: pergunta ao servidor de OTA se tem versão mais nova que a que está rodando
  useEffect(() => {
    let vivo = true;
    (async () => {
      const U = getUpdates();
      if (!U?.checkForUpdateAsync) { if (vivo) setOta('atualizado'); return; }  // dev/expo go
      try {
        const r = await U.checkForUpdateAsync();
        if (vivo) setOta(r.isAvailable ? 'disponivel' : 'atualizado');
      } catch { if (vivo) setOta('atualizado'); }   // offline/erro → não alarma
    })();
    return () => { vivo = false; };
  }, []);

  async function atualizarAgora() {
    const U = getUpdates();
    if (!U?.fetchUpdateAsync || !U?.reloadAsync) return;
    setOta('baixando');
    try {
      await U.fetchUpdateAsync();
      await U.reloadAsync();   // reinicia já com o bundle novo
    } catch { setOta('erro'); }
  }

  const estado =
    ota === 'checando' ? 'verificando…'
    : ota === 'disponivel' ? 'desatualizado'
    : ota === 'baixando' ? 'baixando…'
    : ota === 'erro' ? 'erro ao atualizar'
    : rodandoDeUpdate() ? 'atualizado' : 'build';
  const estadoCor = ota === 'disponivel' || ota === 'erro' ? colors.alerta : colors.textoFraco;

  return (
    <ScrollView style={styles.tela} contentContainerStyle={styles.conteudo}
      showsVerticalScrollIndicator={false}>
      <Aparece>
        <Card style={{ gap: 12 }}>
          <Text style={styles.label}>Instagram</Text>
          <Text style={styles.dica}>Conecte uma ou mais contas e escolha qual fica ativa (a que os bots rodam). Dá pra trocar num toque, sem relogar.</Text>
          <Botao title="Contas do Instagram" cor={colors.marca} txtCor="#fff"
            onPress={() => nav.navigate('ContasIg')} />
        </Card>
      </Aparece>

      <Aparece delay={60}>
        <Card style={{ gap: 12 }}>
          <Text style={styles.label}>Cronograma</Text>
          <Text style={styles.dica}>Lembretes na hora certa de rodar cada bot, seguindo o ciclo de drops. Toca pra ver o plano de hoje e ligar/desligar.</Text>
          <Botao title="Ver cronograma" onPress={() => nav.navigate('Cronograma')} />
        </Card>
      </Aparece>

      {/* atualização OTA: só aparece quando há versão nova esperando (ou baixando) */}
      {(ota === 'disponivel' || ota === 'baixando') && (
        <Aparece delay={80}>
          <Card style={{ gap: 10, borderColor: colors.alerta }}>
            <View style={styles.otaHead}>
              <Ionicons name="cloud-download-outline" size={18} color={colors.alerta} />
              <Text style={styles.otaTitulo}>Atualização disponível</Text>
            </View>
            <Text style={styles.dica}>
              Tem uma versão nova do app esperando. Toca pra baixar e reabrir já atualizado
              (ou reabra o app depois que ela baixa sozinha).
            </Text>
            <Botao title="Atualizar agora" cor={colors.marca} txtCor="#fff"
              loading={ota === 'baixando'} onPress={atualizarAgora} />
          </Card>
        </Aparece>
      )}

      {/* rodapé: nº do OTA (sobe a cada eas update → prova de que o bundle novo baixou)
          + estado: verificando / atualizado / desatualizado / build */}
      <Aparece delay={100}>
        <View style={styles.rodape}>
          <Text style={styles.rodapeVersao}>
            OTA #{OTA_VERSION}{'  ·  '}<Text style={{ color: estadoCor }}>{estado}</Text>
          </Text>
        </View>
      </Aparece>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.bg },
  conteudo: { padding: 16, gap: 12, paddingBottom: 48 },
  label: { color: colors.textoFraco, fontSize: 12, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase' },
  dica: { color: colors.textoFraco, fontSize: 12, lineHeight: 17 },
  otaHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  otaTitulo: { color: colors.texto, fontSize: 15, fontWeight: '800' },
  rodape: { alignItems: 'center', marginTop: 18 },
  rodapeVersao: { color: colors.textoFraco, fontSize: 12, opacity: 0.8 },
});
