import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/theme/tokens';
import { BookmarkIcon } from '@/components/icons/Icons';

export function ForumTopicRow({
  title,
  meta,
  lastActivity,
  saved,
  onToggleSave,
  bordered,
  onPress,
}: {
  title: string;
  meta: string;
  lastActivity: string;
  saved: boolean;
  onToggleSave: () => void;
  bordered?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.topic, bordered && styles.bordered]} onPress={onPress}>
      <View style={styles.head}>
        <Text style={styles.title}>{title}</Text>
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
  saveBtn: {
    marginTop: -2,
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
