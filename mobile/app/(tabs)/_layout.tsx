import { Tabs } from 'expo-router';

import { colors, fonts } from '@/theme/tokens';
import { HomeTabIcon, BookingsTabIcon, NegotiationIcon, AgendaTabIcon, MaisTabIcon } from '@/components/icons/Icons';

// Bottom nav fixa com 5 destinos (Início · Bookings · Conversas ·
// Agenda · Mais), mesma ordem/ícones do protótipo mobile. Contador
// só aparece em Bookings, mesmo que no HTML (bn-count).
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
          tabBarBadge: 4,
          tabBarIcon: ({ color, size }) => <BookingsTabIcon color={String(color)} size={size} />,
        }}
      />
      <Tabs.Screen
        name="conversas"
        options={{ title: 'Conversas', tabBarIcon: ({ color, size }) => <NegotiationIcon color={String(color)} size={size} /> }}
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
