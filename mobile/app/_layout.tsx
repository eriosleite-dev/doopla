import { Stack } from 'expo-router';

import { AuthProvider } from '@/hooks/useAuth';

// AuthProvider aqui é só plumbing (restaura a sessão do SecureStore
// assim que o app abre) — nenhuma tela real do layout aprovado foi
// adicionada, isso não decide UI nenhuma, só disponibiliza useAuth()
// pra qualquer rota abaixo.
export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack />
    </AuthProvider>
  );
}
