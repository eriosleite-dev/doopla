import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts } from '@/theme/tokens';
import { AccountCard } from '@/components/mais/AccountCard';
import { MaisMenuRow } from '@/components/mais/MaisMenuRow';
import { DecisoesIcon, MoneyIcon, MateriaisIcon, AnalyticsIcon, ForumPeopleIcon, ConfiguracoesIcon } from '@/components/icons/Icons';
import { mockUser } from '@/data/homeMock';

const MENU = [
  { key: 'decisoes', label: 'Decisões', route: '/(tabs)/mais/decisoes', icon: <DecisoesIcon size={18} color={colors.tx70} /> },
  { key: 'financeiro', label: 'Financeiro', route: '/(tabs)/mais/financeiro', icon: <MoneyIcon size={18} color={colors.tx70} /> },
  { key: 'materiais', label: 'Materiais', route: '/(tabs)/mais/materiais', icon: <MateriaisIcon size={18} color={colors.tx70} /> },
  { key: 'analytics', label: 'Analytics', route: '/(tabs)/mais/analytics', icon: <AnalyticsIcon size={18} color={colors.tx70} /> },
  { key: 'equipe', label: 'Minha equipe', route: '/(tabs)/mais/equipe', icon: <ForumPeopleIcon size={18} color={colors.tx70} /> },
  { key: 'indique', label: 'Indique e ganhe', route: '/(tabs)/mais/indique-e-ganhe', icon: <MoneyIcon size={18} color={colors.tx70} /> },
  { key: 'config', label: 'Configurações', route: '/(tabs)/mais/configuracoes', icon: <ConfiguracoesIcon size={18} color={colors.tx70} /> },
] as const;

export default function MaisScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Mais</Text>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <AccountCard initials={mockUser.initials} name={mockUser.fullName} sub={mockUser.studio} planBadge={mockUser.planBadge} />
        {MENU.map((item) => (
          <MaisMenuRow key={item.key} icon={item.icon} label={item.label} onPress={() => router.push(item.route)} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.panelSolid,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  title: {
    color: colors.off,
    fontFamily: fonts.subBold,
    fontSize: 15,
  },
  body: {
    padding: 16,
  },
});
