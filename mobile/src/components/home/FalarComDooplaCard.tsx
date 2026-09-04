import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radii } from '@/theme/tokens';
import { WhatsAppLogoIcon } from '@/components/icons/Icons';

// Shell + Home bloco — CTA real (não mais mock). whatsappUrl vem de
// buildTalkToYourDooplaUrl (professional-doopla-cta.ts), nunca reusa o
// CTA de cliente. identityVerified só decide o texto de contexto — o
// botão sempre abre o WhatsApp quando whatsappUrl existe (nenhum modal
// intermediário, nenhum bloqueio: representar o estado real, não
// impedir a ação).
export function FalarComDooplaCard({ whatsappUrl, identityVerified }: { whatsappUrl: string | null; identityVerified: boolean }) {
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.ball}>
          <View style={styles.eye} />
          <View style={styles.eye} />
        </View>
        <View style={styles.headText}>
          <Text style={styles.title}>Falar com minha Doopla</Text>
          <Text style={styles.sub}>Pergunte algo ou peça uma ação</Text>
        </View>
      </View>
      {!identityVerified && (
        <Text style={styles.warn}>
          Seu WhatsApp ainda não está verificado — a Doopla pode não te reconhecer automaticamente nessa conversa.
        </Text>
      )}
      {whatsappUrl ? (
        <Pressable style={styles.waBtn} onPress={() => Linking.openURL(whatsappUrl)}>
          <WhatsAppLogoIcon size={17} color="#fff" />
          <Text style={styles.waText}>Abrir WhatsApp</Text>
        </Pressable>
      ) : (
        <Text style={styles.warn}>Número da Doopla indisponível no momento.</Text>
      )}
    </View>
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
  headText: {
    flex: 1,
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
  warn: {
    color: colors.tx50,
    fontFamily: fonts.body,
    fontSize: 10.5,
    lineHeight: 15,
    marginBottom: 10,
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
