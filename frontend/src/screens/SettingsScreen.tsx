import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '@/theme';
import { Aparece, Botao, Card } from '@/ui/components';
import { OTA_VERSION, rodandoDeUpdate } from '@/constants/otaVersion';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function SettingsScreen() {
  const nav = useNavigation<Nav>();

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

      {/* rodapé: nº do OTA (sobe a cada eas update → prova de que o bundle novo baixou)
          + se está rodando de OTA ou do build embutido */}
      <Aparece delay={80}>
        <View style={styles.rodape}>
          <Text style={styles.rodapeVersao}>
            OTA #{OTA_VERSION}{'  ·  '}{rodandoDeUpdate() ? 'atualizado' : 'build'}
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
  rodape: { alignItems: 'center', marginTop: 18 },
  rodapeVersao: { color: colors.textoFraco, fontSize: 12, opacity: 0.8 },
});
