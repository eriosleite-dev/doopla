import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';

import { colors, fonts, radii } from '@/theme/tokens';
import { BottomSheet } from '@/components/shared/BottomSheet';
import { LoadingState, ErrorState } from '@/components/shared/ScreenState';
import type { NotificationCard } from '@/lib/data/notifications';

type Phase = 'loading' | 'ready' | 'error';

// Correção de UX do sino (07/09/2026) — equivalente mobile do popover
// do painel web (mesma fonte: community_notifications). Convenção
// mobile já usada no produto (ver BottomSheet.tsx): ancorado embaixo,
// nunca modal central, nunca navega a Home sozinho como o sino fazia
// antes (aqui nunca navegava nada — só existia o ícone com badge
// zerado, nunca funcional).
export function NotificationsSheet({
  visible,
  onClose,
  phase,
  items,
  onRetry,
  onItemPress,
}: {
  visible: boolean;
  onClose: () => void;
  phase: Phase;
  items: NotificationCard[];
  onRetry: () => void;
  onItemPress: (item: NotificationCard) => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={styles.title}>Notificações</Text>

      {phase === 'loading' && <LoadingState label="Carregando notificações…" />}
      {phase === 'error' && <ErrorState message="Não deu pra carregar suas notificações agora." onRetry={onRetry} />}
      {phase === 'ready' && items.length === 0 && <Text style={styles.emptyText}>Nenhuma notificação por aqui.</Text>}

      {phase === 'ready' && items.length > 0 && (
        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          {items.map((item, i) => (
            <Pressable
              key={item.id}
              onPress={() => onItemPress(item)}
              style={[styles.item, i > 0 && styles.itemBordered]}
            >
              <View style={styles.itemHead}>
                {item.unread && <View style={styles.dot} />}
                <Text style={[styles.message, item.unread ? styles.messageUnread : undefined]}>{item.message}</Text>
              </View>
              <Text style={styles.time}>{item.timeLabel}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.off,
    fontFamily: fonts.subBold,
    fontSize: 14,
    marginBottom: 12,
  },
  emptyText: {
    color: colors.tx50,
    fontFamily: fonts.body,
    fontSize: 12.5,
    textAlign: 'center',
    paddingVertical: 24,
  },
  list: {
    maxHeight: 360,
  },
  item: {
    paddingVertical: 12,
  },
  itemBordered: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  itemHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.red,
    marginTop: 5,
  },
  message: {
    flex: 1,
    color: colors.tx50,
    fontFamily: fonts.body,
    fontSize: 12.5,
    lineHeight: 17,
  },
  messageUnread: {
    color: colors.off,
    fontFamily: fonts.bodyMedium,
  },
  time: {
    color: colors.tx30,
    fontFamily: fonts.mono,
    fontSize: 10,
    marginTop: 5,
    marginLeft: 13,
  },
});
