import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { colors, fonts, radii } from '@/theme/tokens';

const AnimatedPath = Animated.createAnimatedComponent(Path);

// "Sua Doopla em ação": mesmo path do gráfico do protótipo (dados
// mockados, viewBox 0 0 320 60) + as 3 métricas que o backend real
// vai calcular depois — nada inventado além do que já está no HTML.
const CHART_PATH = 'M0,42 L40,38 L80,44 L120,22 L160,28 L200,15 L240,24 L280,10 L320,18';
const CHART_LENGTH = 420; // aproximação suficiente pro dash-offset de entrada

export function ChartCard({
  metrics,
  onVerPress,
}: {
  metrics: { num: string; label: string }[];
  onVerPress?: () => void;
}) {
  const dashOffset = useRef(new Animated.Value(CHART_LENGTH)).current;

  useEffect(() => {
    Animated.timing(dashOffset, { toValue: 0, duration: 1400, useNativeDriver: false }).start();
  }, [dashOffset]);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Sua Doopla em ação</Text>
        <Pressable onPress={onVerPress} hitSlop={8}>
          <Text style={styles.link}>Ver →</Text>
        </Pressable>
      </View>
      <Svg width="100%" height={50} viewBox="0 0 320 60" style={styles.svg}>
        <AnimatedPath
          d={CHART_PATH}
          fill="none"
          stroke={colors.red}
          strokeWidth={2.4}
          strokeDasharray={CHART_LENGTH}
          strokeDashoffset={dashOffset}
        />
      </Svg>
      <View style={styles.metrics}>
        {metrics.map((m) => (
          <View key={m.label}>
            <Text style={styles.metricNum}>{m.num}</Text>
            <Text style={styles.metricLabel}>{m.label}</Text>
          </View>
        ))}
      </View>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    color: colors.off,
    fontFamily: fonts.subBold,
    fontSize: 14.5,
  },
  link: {
    color: colors.red,
    fontFamily: fonts.subBold,
    fontSize: 11,
  },
  svg: {
    marginBottom: 14,
  },
  metrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricNum: {
    color: colors.off,
    fontFamily: fonts.display,
    fontSize: 17,
  },
  metricLabel: {
    color: colors.tx50,
    fontFamily: fonts.body,
    fontSize: 9.5,
    marginTop: 2,
  },
});
