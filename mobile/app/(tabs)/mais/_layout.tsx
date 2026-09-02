import { Stack } from 'expo-router';

import { colors, fonts } from '@/theme/tokens';

// Pilha interna da aba Mais: menu -> sub-telas (todas placeholder por
// enquanto, sem layout aprovado ainda). Header nativo simples com
// botão voltar nas sub-telas; o menu (index) não mostra header nativo
// porque já é a raiz da aba.
export default function MaisLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.panelSolid },
        headerTintColor: colors.off,
        headerTitleStyle: { fontFamily: fonts.subBold, fontSize: 15 },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Mais', headerShown: false }} />
      <Stack.Screen name="decisoes" options={{ title: 'Decisões' }} />
      <Stack.Screen name="financeiro" options={{ title: 'Financeiro' }} />
      <Stack.Screen name="materiais" options={{ title: 'Materiais' }} />
      <Stack.Screen name="analytics" options={{ title: 'Analytics' }} />
      <Stack.Screen name="equipe" options={{ title: 'Minha equipe' }} />
      <Stack.Screen name="indique-e-ganhe" options={{ title: 'Indique e ganhe' }} />
      <Stack.Screen name="configuracoes" options={{ title: 'Configurações' }} />
    </Stack>
  );
}
