import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '@/theme';

/** Marca/desmarca a conta na ORDEM de execução — igual selecionar fotos de um carrossel no
 * Instagram: marcar põe no fim da fila; desmarcar tira e os números das outras se ajustam. */
export function alternarNaOrdem(ordem: string[], u: string): string[] {
  return ordem.includes(u) ? ordem.filter((x) => x !== u) : [...ordem, u];
}

/** Lista de contas pra rodar um bot em lote. Cada conta marcada mostra o NÚMERO da vez dela (a
 * posição em `ordem`, que pode juntar contas de mais de uma lista — ex: as segue + a do brechó). */
export function SeletorContas({ contas, ordem, onChange }: {
  contas: string[]; ordem: string[]; onChange: (ordem: string[]) => void;
}) {
  return (
    <View>
      {contas.map((u) => {
        const pos = ordem.indexOf(u);
        const on = pos >= 0;
        return (
          <TouchableOpacity key={u} style={styles.linha} onPress={() => onChange(alternarNaOrdem(ordem, u))}
            accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
            <View style={[styles.caixa, on && styles.caixaOn]}>
              {on ? <Text style={styles.num}>{pos + 1}</Text> : null}
            </View>
            <Text style={styles.txt} numberOfLines={1}>@{u}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  linha: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  caixa: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: colors.textoFraco,
    alignItems: 'center', justifyContent: 'center' },
  caixaOn: { backgroundColor: colors.marca, borderColor: colors.marca },
  num: { color: '#fff', fontSize: 12, fontWeight: '800' },
  txt: { color: colors.texto, fontSize: 14, fontWeight: '600', flex: 1 },
});
