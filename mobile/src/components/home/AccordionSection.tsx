import { useRef, useState, type ReactNode } from 'react';
import { Animated, LayoutAnimation, Platform, Pressable, StyleSheet, Text, UIManager, View } from 'react-native';

import { colors, fonts, radii } from '@/theme/tokens';
import { ChevronDownIcon } from '@/components/icons/Icons';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Nascem fechados, expandem no próprio lugar, empurram o conteúdo
// abaixo — nunca navegam pra outra tela (mesmo comportamento do
// accordion do protótipo).
export function AccordionSection({
  title,
  count,
  linkLabel,
  onLinkPress,
  defaultOpen = false,
  children,
}: {
  title: string;
  count?: number;
  linkLabel?: string;
  onLinkPress?: () => void;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const rotate = useRef(new Animated.Value(defaultOpen ? 1 : 0)).current;

  function toggle() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    Animated.timing(rotate, { toValue: open ? 0 : 1, duration: 250, useNativeDriver: true }).start();
    setOpen((v) => !v);
  }

  const rotateDeg = rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  return (
    <View style={styles.card}>
      <Pressable onPress={toggle} style={styles.bar}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{title}</Text>
          {typeof count === 'number' && (
            <View style={styles.countPill}>
              <Text style={styles.countText}>{count}</Text>
            </View>
          )}
        </View>
        <View style={styles.right}>
          {linkLabel && (
            <Pressable onPress={onLinkPress} hitSlop={8}>
              <Text style={styles.link}>{linkLabel}</Text>
            </Pressable>
          )}
          <Animated.View style={{ transform: [{ rotate: rotateDeg }] }}>
            <ChevronDownIcon size={16} color={colors.tx70} />
          </Animated.View>
        </View>
      </Pressable>
      {open && <View style={styles.body}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.lg,
    marginBottom: 12,
    overflow: 'hidden',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  title: {
    color: colors.off,
    fontFamily: fonts.subBold,
    fontSize: 14.5,
  },
  countPill: {
    backgroundColor: colors.red,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  countText: {
    color: colors.off,
    fontFamily: fonts.mono,
    fontSize: 10,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  link: {
    color: colors.red,
    fontFamily: fonts.subBold,
    fontSize: 11,
  },
  body: {
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
});
