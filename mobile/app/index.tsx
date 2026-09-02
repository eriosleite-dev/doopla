import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/hooks/useAuth';

// Placeholder de fundação — nenhuma tela do layout aprovado foi
// implementada aqui ainda. Só prova que o Expo Router + AuthProvider
// estão funcionando de ponta a ponta (loading/sessão/professional_id).
export default function IndexScreen() {
  const { loading, professionalId, profile } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.text}>Doopla Mobile — fundação Expo Router</Text>
      <Text style={styles.text}>
        {loading ? 'Carregando sessão…' : professionalId ? `Autenticada como ${profile?.full_name ?? professionalId}` : 'Sem sessão ativa'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  text: {
    fontSize: 16,
  },
});
