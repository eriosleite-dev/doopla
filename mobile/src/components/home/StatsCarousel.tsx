import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { colors } from '@/theme/tokens';
import { ChevronRightIcon } from '@/components/icons/Icons';

// Carrossel horizontal dos stat cards. Bug já corrigido no protótipo
// preservado aqui: NUNCA usar scroll-snap (pulava a posição inicial e
// cortava a margem esquerda) — só ScrollView livre. A seta de "dá pra
// arrastar" precisa ficar bem visível e sumir sozinha ao chegar no fim.
export function StatsCarousel({ children }: { children: ReactNode }) {
  const [showFade, setShowFade] = useState(true);

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    const atEnd = contentOffset.x + layoutMeasurement.width >= contentSize.width - 4;
    setShowFade(!atEnd);
  }

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        onScroll={onScroll}
        scrollEventThrottle={32}
      >
        {children}
      </ScrollView>
      {showFade && (
        <LinearGradient
          pointerEvents="none"
          colors={['transparent', colors.bg]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.fade}
        >
          <ChevronRightIcon size={24} color={colors.off} strokeWidth={2.6} />
        </LinearGradient>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 16,
  },
  scrollContent: {
    gap: 10,
    paddingRight: 16,
  },
  fade: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 4,
    width: 52,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 2,
  },
});
