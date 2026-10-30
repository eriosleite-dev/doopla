import { Tabs } from 'expo-router';

import { colors, fonts } from '@/theme/tokens';
import { HomeTabIcon, BookingsTabIcon, AgendaTabIcon, MaisTabIcon } from '@/components/icons/Icons';

// Bottom nav fixa com 4 destinos (Início · Bookings · Agenda · Mais).
// Conversas Bloco 2 (revisão de roadmap, 03/09/2026): a aba "Conversas"
// era um PlaceholderScreen (nunca teve dado real) e foi removida — a
// spec CURRENT nunca previu Conversas como aba primária, "Ver
// conversa" agora é contextual a partir do booking (app/conversas/
// [conversationId].tsx + seção em bookings/[id].tsx), mesma decisão já
// tomada pro painel web. Contador do bn-count só aparece em Bookings,
// mesmo que no HTML original.
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.off,
        tabBarInactiveTintColor: colors.tx30,
        tabBarStyle: {
          backgroundColor: '#0e0d0d',
          borderTopColor: colors.line,
          borderTopWidth: 1,
          height: 64,
          paddingTop: 10,
          paddingBottom: 10,
        },
        tabBarLabelStyle: {
          fontFamily: fonts.mono,
          fontSize: 9,
        },
        tabBarBadgeStyle: {
          backgroundColor: 'transparent',
          color: colors.red,
          fontFamily: fonts.display,
          fontSize: 10,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Início', tabBarIcon: ({ color, size }) => <HomeTabIcon color={String(color)} size={size} /> }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: 'Bookings',
          tabBarIcon: ({ color, size }) => <BookingsTabIcon color={String(color)} size={size} />,
        }}
      />
      <Tabs.Screen
        name="agenda"
        options={{ title: 'Agenda', tabBarIcon: ({ color, size }) => <AgendaTabIcon color={String(color)} size={size} /> }}
      />
      <Tabs.Screen
        name="mais"
        options={{ title: 'Mais', tabBarIcon: ({ color, size }) => <MaisTabIcon color={String(color)} size={size} /> }}
      />
    </Tabs>
  );
}
