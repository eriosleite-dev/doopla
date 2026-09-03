import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts } from '@/theme/tokens';
import { useAuth } from '@/hooks/useAuth';
import { AccountCard } from '@/components/mais/AccountCard';
import { MaisMenuRow } from '@/components/mais/MaisMenuRow';
import { DecisoesIcon, MoneyIcon, MateriaisIcon, AnalyticsIcon, ForumPeopleIcon, ConfiguracoesIcon } from '@/components/icons/Icons';
import { fetchArtistProfile, fetchArtistSubscription } from '@/lib/data/artistProfile';
import type { ArtistProfile, ArtistSubscription } from '@/types/artistProfile';

const MENU = [
  { key: 'decisoes', label: 'Decisões', route: '/(tabs)/mais/decisoes', icon: <DecisoesIcon size={18} color={colors.tx70} /> },
  { key: 'financeiro', label: 'Dinheiro', route: '/(tabs)/mais/financeiro', icon: <MoneyIcon size={18} color={colors.tx70} /> },
  { key: 'materiais', label: 'Materiais', route: '/(tabs)/mais/materiais', icon: <MateriaisIcon size={18} color={colors.tx70} /> },
  { key: 'analytics', label: 'Analytics', route: '/(tabs)/mais/analytics', icon: <AnalyticsIcon size={18} color={colors.tx70} /> },
  { key: 'equipe', label: 'Minha equipe', route: '/(tabs)/mais/equipe', icon: <ForumPeopleIcon size={18} color={colors.tx70} /> },
  { key: 'indique', label: 'Indique e ganhe', route: '/(tabs)/mais/indique-e-ganhe', icon: <MoneyIcon size={18} color={colors.tx70} /> },
  { key: 'config', label: 'Configurações', route: '/(tabs)/mais/configuracoes', icon: <ConfiguracoesIcon size={18} color={colors.tx70} /> },
] as const;

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function MaisScreen() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const [artistProfile, setArtistProfile] = useState<ArtistProfile | null>(null);
  const [subscription, setSubscription] = useState<ArtistSubscription | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchArtistProfile(user.id).then(setArtistProfile).catch(() => setArtistProfile(null));
    fetchArtistSubscription(user.id).then(setSubscription).catch(() => setSubscription(null));
  }, [user]);

  const displayName = artistProfile?.stage_name || profile?.full_name || 'Sua conta';
  const sub = profile?.city ?? '';
  const planBadge = subscription?.artist_plan === 'pro' ? 'PRO' : subscription?.artist_plan === 'doopla' ? 'DOOPLA' : '';

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Mais</Text>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <AccountCard initials={initialsFromName(displayName)} name={displayName} sub={sub} planBadge={planBadge} />
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
