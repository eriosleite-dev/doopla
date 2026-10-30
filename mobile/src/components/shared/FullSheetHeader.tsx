import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/theme/tokens';
import { ChevronLeftIcon } from '@/components/icons/Icons';

// Cabeçalho comum das telas cheias (Fórum, Mais) — botão voltar
// opcional, título, "Fechar ✕". Mesma estrutura do fs-header do
// protótipo.
export function FullSheetHeader({
  title,
  onBack,
  onClose,
}: {
  title: string;
  onBack?: () => void;
  onClose: () => void;
}) {
  return (
    <View style={styles.header}>
      {onBack && (
        <Pressable onPress={onBack} hitSlop={8} style={styles.backBtn}>
          <ChevronLeftIcon size={20} color={colors.off} />
        </Pressable>
      )}
      <Text style={styles.title}>{title}</Text>
      <Pressable onPress={onClose} hitSlop={8}>
        <Text style={styles.close}>Fechar ✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  backBtn: {
    marginRight: -2,
  },
  title: {
    flex: 1,
    color: colors.off,
    fontFamily: fonts.subBold,
    fontSize: 15,
  },
  close: {
    color: colors.tx50,
    fontFamily: fonts.mono,
    fontSize: 11,
  },
});
