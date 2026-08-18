import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { api, Account } from '@/lib/api';
import { lerCredenciais } from '@/lib/credenciais';
import { colors } from '@/theme';
import { LoadingDog } from '@/ui/LoadingDog';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rt = RouteProp<RootStackParamList, 'VerificandoConta'>;
type Fase = 'verificando' | 'disponivel' | 'reconectar';

/**
 * Tela de transição do tap na notificação do cronograma. Antes a validação da conta
 * rolava em silêncio no RootNavigator e o usuário só via uma tela carregando sem saber o
 * que tava pegando. Aqui ele vê: "verificando @X" → "disponível, abrindo" OU "sessão caiu,
 * te levando pra reconectar", com o LoadingDog, e só então redireciona.
 */
export function VerificandoContaScreen() {
  const nav = useNavigation<Nav>();
  const { contaId, label, botId, nome } = useRoute<Rt>().params;
  const [fase, setFase] = useState<Fase>('verificando');
  const feito = useRef(false);

  useEffect(() => {
    if (feito.current) return;   // roda a verificação UMA vez só
    feito.current = true;
    let vivo = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    (async () => {
      let acc: Account | undefined;
      try {
        const contas = await api.validarContas();
        acc = contas.find(
          (c) => c.id === contaId || (!!label && c.label?.toLowerCase() === label.toLowerCase()));
      } catch { /* offline / falhou → trata como indisponível abaixo */ }
      if (!vivo) return;

      if (acc?.sessao_ok) {
        // sessão viva → deixa a conta ativa e abre o Bot pra rodar (mostra a msg antes)
        setFase('disponivel');
        if (!acc.ativa) await api.ativarConta(acc.id).catch(() => {});
        timers.push(setTimeout(() => { if (vivo) nav.replace('Bot', { botId, nome }); }, 900));
      } else {
        // sem sessão viva → reconectar, já com o login preenchido (se tiver credencial salva)
        setFase('reconectar');
        let senha: string | undefined;
        try {
          const creds = await lerCredenciais();
          senha = creds.find((c) => c.usuario?.toLowerCase() === (label || '').toLowerCase())?.senha;
        } catch { /* sem credencial → login manual */ }
        timers.push(setTimeout(() => { if (vivo) nav.replace('InstagramLogin', { label, senha }); }, 1500));
      }
    })();
    return () => { vivo = false; timers.forEach(clearTimeout); };
  }, [contaId, label, botId, nome, nav]);

  const conta = label ? `@${label}` : 'a conta';

  return (
    <View style={styles.tela}>
      <LoadingDog size={64} />
      {fase === 'verificando' && (
        <>
          <Text style={styles.titulo}>Verificando {conta}…</Text>
          <Text style={styles.sub}>Vendo se a sessão do Instagram tá ativa pra rodar o {nome}.</Text>
        </>
      )}
      {fase === 'disponivel' && (
        <>
          <View style={styles.badge}>
            <Ionicons name="checkmark-circle" size={20} color={colors.ok} />
            <Text style={[styles.titulo, { color: colors.ok, marginTop: 0 }]}>{conta} disponível</Text>
          </View>
          <Text style={styles.sub}>Sessão ativa. Abrindo o {nome}…</Text>
        </>
      )}
      {fase === 'reconectar' && (
        <>
          <View style={styles.badge}>
            <Ionicons name="link" size={20} color={colors.alerta} />
            <Text style={[styles.titulo, { color: colors.alerta, marginTop: 0 }]}>Sessão de {conta} caiu</Text>
          </View>
          <Text style={styles.sub}>Te levando pra reconectar — é só logar e conectar de novo.</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titulo: { color: colors.texto, fontSize: 19, fontWeight: '800', textAlign: 'center', marginTop: 8 },
  sub: { color: colors.textoFraco, fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
