import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/theme/tokens';
import { BookmarkIcon } from '@/components/icons/Icons';

// Item 6 (08/09/2026, correção do ••• ausente nos cards) — onDelete
// opcional: só o chamador sabe se o tópico do card é do autor logado
// (comparação por profile_id, feita em quem monta a lista — nunca
// aqui). Sem onDelete, o card fica exatamente como sempre foi.
export function ForumTopicRow({
  title,
  meta,
  lastActivity,
  saved,
  onToggleSave,
  bordered,
  onPress,
  onDelete,
  deleting,
}: {
  title: string;
  meta: string;
  lastActivity: string;
  saved: boolean;
  onToggleSave: () => void;
  bordered?: boolean;
  onPress: () => void;
  onDelete?: () => void;
  deleting?: boolean;
}) {
  return (
    <Pressable style={[styles.topic, bordered && styles.bordered]} onPress={onPress}>
      <View style={styles.head}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.rowActions}>
          {onDelete && (
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              hitSlop={8}
              disabled={deleting}
              accessibilityRole="button"
              accessibilityLabel="Mais opções"
            >
              <Text style={styles.moreText}>•••</Text>
            </Pressable>
          )}
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onToggleSave();
            }}
            hitSlop={8}
            style={styles.saveBtn}
          >
            <BookmarkIcon size={16} color={saved ? colors.red : colors.tx30} filled={saved} strokeWidth={1.8} />
          </Pressable>
        </View>
      </View>
      <Text style={styles.meta}>{meta}</Text>
      <Text style={styles.time}>{lastActivity}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topic: {
    paddingVertical: 12,
  },
  bordered: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    flex: 1,
    color: colors.off,
    fontFamily: fonts.subBold,
    fontSize: 13,
    marginBottom: 3,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: -2,
  },
  saveBtn: {},
  moreText: {
    color: colors.tx30,
    fontFamily: fonts.subBold,
    fontSize: 13,
    letterSpacing: 1,
  },
  meta: {
    color: colors.tx50,
    fontFamily: fonts.body,
    fontSize: 10.5,
    marginBottom: 5,
  },
  time: {
    color: colors.tx30,
    fontFamily: fonts.body,
    fontSize: 10.5,
  },
});
