import { Stack } from 'expo-router';

// Pilha interna do Fórum (lista de tópicos -> conversa), apresentada
// como modal de tela cheia a partir da raiz. Cabeçalho próprio
// (FullSheetHeader) em cada tela, então sem header nativo aqui.
export default function ForumLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[topicId]" />
    </Stack>
  );
}
