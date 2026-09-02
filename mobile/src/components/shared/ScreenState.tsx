import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/theme/tokens';

// Estados visuais obrigatórios em qualquer feature (loading/empty/erro),
// conforme o prompt do layout. Ainda sem dado real — usados aqui só
// pra deixar a estrutura pronta pra quando a integração acontecer.
export function LoadingState({ label = 'Carregando…' }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.red} />
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

export function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.center}>
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.text}>{subtitle}</Text>}
    </View>
  );
}

export function ErrorState({ message = 'Não deu pra carregar agora.', onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <Text style={styles.title}>Algo deu errado</Text>
      <Text style={styles.text}>{message}</Text>
      {onRetry && (
        <Pressable style={styles.retryBtn} onPress={onRetry}>
          <Text style={styles.retryText}>Tentar de novo</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
    gap: 6,
  },
  title: {
    color: colors.off,
    fontFamily: fonts.subBold,
    fontSize: 14,
    textAlign: 'center',
  },
  text: {
    color: colors.tx50,
    fontFamily: fonts.body,
    fontSize: 12.5,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  retryText: {
    color: colors.off,
    fontFamily: fonts.subBold,
    fontSize: 12,
  },
});
