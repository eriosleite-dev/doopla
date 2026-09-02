import { StyleSheet, Text, View } from 'react-native';

// Placeholder de fundação — nenhuma tela do layout aprovado foi
// implementada aqui ainda. Só prova que o Expo Router está
// configurado e o app inicia.
export default function IndexScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Doopla Mobile — fundação Expo Router</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 16,
  },
});
