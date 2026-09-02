import { useEffect } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { colors } from '@/theme/tokens';
import { useAppFonts } from '@/theme/useAppFonts';
import { AuthProvider } from '@/hooks/useAuth';
import { ToastProvider } from '@/components/shared/Toast';

SplashScreen.preventAutoHideAsync().catch(() => {});

// AuthProvider continua só restaurando a sessão (nenhuma tela real
// depende disso ainda nesta fase). ToastProvider fica acima do Stack
// pra qualquer tela poder disparar toast. "forum" é apresentado como
// modal de tela cheia, empilhado sobre (tabs).
export default function RootLayout() {
  const { fontsLoaded, fontsError } = useAppFonts();

  useEffect(() => {
    if (fontsLoaded || fontsError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontsError]);

  if (!fontsLoaded && !fontsError) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  return (
    <AuthProvider>
      <ToastProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="forum" options={{ presentation: 'modal' }} />
        </Stack>
      </ToastProvider>
    </AuthProvider>
  );
}
