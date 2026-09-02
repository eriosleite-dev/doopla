import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/theme/tokens';

export function ForumTopicRow({
  title,
  meta,
  lastActivity,
  hasNew,
  bordered,
  onPress,
}: {
  title: string;
  meta: string;
  lastActivity: string;
  hasNew: boolean;
  bordered?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.topic, bordered && styles.bordered]} onPress={onPress}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.meta}>{meta}</Text>
      <View style={styles.foot}>
        {hasNew && <Text style={styles.new}>Nova resposta</Text>}
        <Text style={styles.time}>{lastActivity}</Text>
      </View>
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
  title: {
    color: colors.off,
    fontFamily: fonts.subBold,
    fontSize: 13,
    marginBottom: 3,
  },
  meta: {
    color: colors.tx50,
    fontFamily: fonts.body,
    fontSize: 10.5,
    marginBottom: 5,
  },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  new: {
    color: colors.red,
    fontFamily: fonts.bodySemiBold,
    fontSize: 10.5,
  },
  time: {
    color: colors.tx30,
    fontFamily: fonts.body,
    fontSize: 10.5,
  },
});
