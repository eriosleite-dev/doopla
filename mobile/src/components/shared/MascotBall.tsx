import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { colors } from '@/theme/tokens';

// Mascote: bolinha vermelha com glow, olho preto + pupila branca. Sem
// mouse no app (touch), os olhos vagam sozinhos o tempo todo desde que
// a tela carrega — mesmo comportamento descrito no prompt do layout,
// nunca pupila preta dentro de olho branco.
export function MascotBall({ size = 120 }: { size?: number }) {
  const pupilX = useRef(new Animated.Value(0)).current;
  const pupilY = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;

    function wander() {
      if (cancelled) return;
      const ox = Math.random() * 8 - 4;
      const oy = Math.random() * 5 - 2.5;
      Animated.parallel([
        Animated.timing(pupilX, { toValue: ox, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pupilY, { toValue: oy, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]).start(() => {
        const delay = 1400 + Math.random() * 1600;
        setTimeout(wander, delay);
      });
    }

    const initial = setTimeout(wander, 1000);
    return () => {
      cancelled = true;
      clearTimeout(initial);
    };
  }, [pupilX, pupilY]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 1700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 1700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breathe]);

  const glowScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  const ballSize = size * 0.65;
  const eyeSize = size * 0.158;
  const pupilSize = eyeSize * 0.42;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={[
          styles.glow,
          { width: size, height: size, borderRadius: size / 2, transform: [{ scale: glowScale }] },
        ]}
      />
      <View style={[styles.ball, { width: ballSize, height: ballSize, borderRadius: ballSize / 2 }]}>
        <View style={[styles.eye, { width: eyeSize, height: eyeSize, borderRadius: eyeSize / 2 }]}>
          <Animated.View
            style={[
              styles.pupil,
              { width: pupilSize, height: pupilSize, borderRadius: pupilSize / 2, transform: [{ translateX: pupilX }, { translateY: pupilY }] },
            ]}
          />
        </View>
        <View style={[styles.eye, { width: eyeSize, height: eyeSize, borderRadius: eyeSize / 2 }]}>
          <Animated.View
            style={[
              styles.pupil,
              { width: pupilSize, height: pupilSize, borderRadius: pupilSize / 2, transform: [{ translateX: pupilX }, { translateY: pupilY }] },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  glow: {
    position: 'absolute',
    backgroundColor: colors.red,
    opacity: 0.35,
  },
  ball: {
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5,
    shadowColor: colors.red,
    shadowOpacity: 0.6,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  eye: {
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pupil: {
    backgroundColor: colors.off,
  },
});
