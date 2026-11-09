import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts } from '@/theme/tokens';

// Placeholder mínimo pras telas de destino que ainda não têm layout
// aprovado (Bookings, Conversas, Agenda, e os itens do menu Mais) —
// só existe pra manter a navegação inteira testável, sem inventar
// nenhum conteúdo real dessas telas.
export function PlaceholderScreen({ title }: { title: string }) {
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.center}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.sub}>Em breve</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  title: {
    color: colors.off,
    fontFamily: fonts.subBold,
    fontSize: 17,
  },
  sub: {
    color: colors.tx50,
    fontFamily: fonts.body,
    fontSize: 13,
  },
});
