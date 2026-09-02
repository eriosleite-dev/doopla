import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';

import { colors, fonts, radii } from '@/theme/tokens';

type ToastItem = { id: number; text: string; opacity: Animated.Value };

type ToastContextValue = { show: (text: string) => void };

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

let nextId = 1;

// Reproduz o toast-stack do protótipo: pilha de mensagens no rodapé,
// fade-in/out, some sozinho depois de ~3.2s. Usado por botões de
// copiar/ações mockadas nesta fase (sem side-effect real ainda).
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const show = useCallback((text: string) => {
    const id = nextId++;
    const opacity = new Animated.Value(0);
    setToasts((prev) => [...prev, { id, text, opacity }]);
    Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();

    timers.current[id] = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      });
    }, 3200);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <Animated.View pointerEvents="none" style={styles.stack}>
        {toasts.map((t) => (
          <Animated.View key={t.id} style={[styles.toast, { opacity: t.opacity }]}>
            <Text style={styles.text}>{t.text}</Text>
          </Animated.View>
        ))}
      </Animated.View>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast() precisa ser chamado dentro de <ToastProvider>.');
  }
  return ctx;
}

const styles = StyleSheet.create({
  stack: {
    position: 'absolute',
    bottom: 96,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 8,
  },
  toast: {
    backgroundColor: '#1c1a1a',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.pill,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 8,
  },
  text: {
    color: colors.off,
    fontFamily: fonts.body,
    fontSize: 12.5,
  },
});
