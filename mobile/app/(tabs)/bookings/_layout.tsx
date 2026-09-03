import { Stack } from 'expo-router';

// Lista -> detalhe (nunca modal, per spec) — mesmo padrão de pilha
// aninhada já usado em (tabs)/mais/_layout.tsx.
export default function BookingsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
