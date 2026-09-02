import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radii } from '@/theme/tokens';
import { WhatsAppLogoIcon } from '@/components/icons/Icons';

// Nesta fase (telas estáticas, sem integração real) o card não abre
// o WhatsApp de verdade — só reproduz a interação visual. Ligar isso
// ao WhatsApp real é integração de regra de negócio, fora do escopo
// desta etapa.
export function FalarComDooplaCard({ onPress }: { onPress: () => void }) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.head}>
        <View style={styles.ball}>
          <View style={styles.eye} />
          <View style={styles.eye} />
        </View>
        <View>
          <Text style={styles.title}>Falar com minha Doopla</Text>
          <Text style={styles.sub}>Pergunte algo ou peça uma ação</Text>
        </View>
      </View>
      <View style={styles.waBtn}>
        <WhatsAppLogoIcon size={17} color="#fff" />
        <Text style={styles.waText}>Abrir WhatsApp</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.lg,
    padding: 16,
    marginBottom: 12,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  ball: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  eye: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.black,
  },
  title: {
    color: colors.off,
    fontFamily: fonts.subBold,
    fontSize: 12.5,
  },
  sub: {
    color: colors.tx50,
    fontFamily: fonts.body,
    fontSize: 10.5,
  },
  waBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.whatsapp,
    borderRadius: 999,
    paddingVertical: 12,
  },
  waText: {
    color: '#fff',
    fontFamily: fonts.subBold,
    fontSize: 12.5,
  },
});
