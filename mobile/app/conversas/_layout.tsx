import { Stack } from 'expo-router';

// Conversas Bloco 2 — pilha própria, apresentada como modal de tela
// cheia a partir da raiz (mesmo padrão de app/forum/_layout.tsx).
// Nunca uma aba (a spec CURRENT nunca previu Conversas como aba
// primária) — só alcançável a partir do booking, via "Ver conversa".
export default function ConversasLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="[conversationId]" />
    </Stack>
  );
}
