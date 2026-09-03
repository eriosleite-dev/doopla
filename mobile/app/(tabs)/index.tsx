import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '@/theme/tokens';
import { useAuth } from '@/hooks/useAuth';
import { HomeTopbar } from '@/components/home/HomeTopbar';
import { HomeHero } from '@/components/home/HomeHero';
import { StatsCarousel } from '@/components/home/StatsCarousel';
import { StatCard } from '@/components/home/StatCard';
import { AccordionSection } from '@/components/home/AccordionSection';
import { BookingRow } from '@/components/home/BookingRow';
import { ChannelsCard } from '@/components/home/ChannelsCard';
import { IndiqueGanheCard } from '@/components/home/IndiqueGanheCard';
import { FalarComDooplaCard } from '@/components/home/FalarComDooplaCard';
import { useToast } from '@/components/shared/Toast';
import { NegotiationIcon, HourglassIcon, CheckIcon, MoneyIcon, LinkIcon, HashIcon } from '@/components/icons/Icons';
import { STATUS_LABELS, computeArtistStats, fetchUserBookings, type BookingWithOtherParty } from '@/lib/data/bookings';
import { fetchReferralSummary, type ReferralSummary } from '@/lib/data/referrals';
import { formatCentsAsBRL, monthDayParts } from '@/lib/format';

export default function HomeScreen() {
  const router = useRouter();
  const { show } = useToast();
  const { professionalId, profile } = useAuth();
  const [bookings, setBookings] = useState<BookingWithOtherParty[]>([]);
  const [referralSummary, setReferralSummary] = useState<ReferralSummary | null>(null);

  useEffect(() => {
    if (!professionalId) return;
    fetchUserBookings(professionalId).then(setBookings).catch(() => setBookings([]));
    if (profile?.referral_code) {
      fetchReferralSummary(professionalId, profile.referral_code).then(setReferralSummary).catch(() => setReferralSummary(null));
    }
  }, [professionalId, profile?.referral_code]);

  const stats = computeArtistStats(bookings);
  const upcoming = bookings
    .filter((b) => ['proposta_enviada', 'aceita', 'aguardando_pagamento'].includes(b.status))
    .slice(0, 5);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <HomeTopbar notificationsCount={0} forumHasNew={false} onOpenForum={() => router.push('/forum')} />

        <View style={styles.main}>
          <HomeHero firstName={profile?.full_name?.split(' ')[0] ?? ''} />

          <StatsCarousel>
            <StatCard icon={<NegotiationIcon size={14} color={colors.red} />} tone="red" num={String(stats.activeCount)} label="Em andamento" />
            <StatCard icon={<HourglassIcon size={14} color={colors.amber} />} tone="amber" num={String(stats.awaitingPaymentCount)} label="Aguardando pagamento" />
            <StatCard icon={<CheckIcon size={14} color={colors.green} />} tone="green" num={String(stats.closedCount)} label="Concluídos" />
            <StatCard icon={<MoneyIcon size={14} color={colors.off} />} tone="off" num={formatCentsAsBRL(stats.monthNetReceivedCents)} label="Este mês" />
          </StatsCarousel>

          <AccordionSection title="Próximos bookings" linkLabel="Ver todos" onLinkPress={() => router.push('/(tabs)/bookings')}>
            {upcoming.length === 0 ? (
              <BookingRow month="" day="—" name="Nenhum booking em andamento" place="" statusLabel="" statusTone="green" />
            ) : (
              upcoming.map((b, i) => {
                const { month, day } = b.event_date ? monthDayParts(b.event_date) : { month: '', day: '—' };
                return (
                  <BookingRow
                    key={b.id}
                    month={month}
                    day={day}
                    name={b.description || b.otherPartyName}
                    place={b.event_location ?? ''}
                    statusLabel={STATUS_LABELS[b.status]}
                    statusTone={b.status === 'aceita' || b.status === 'aguardando_pagamento' ? 'green' : 'amber'}
                    bordered={i > 0}
                  />
                );
              })
            )}
          </AccordionSection>

          <ChannelsCard
            title="Seus canais de booking"
            rows={[
              ...(profile?.slug
                ? [{ key: 'link', icon: <LinkIcon size={13} color={colors.off} />, label: 'Seu link', value: `doopla.com/${profile.slug}`, onCopy: () => show('Link copiado.') }]
                : []),
              ...(profile?.referral_code
                ? [{ key: 'code', icon: <HashIcon size={13} color={colors.off} />, label: 'Seu código', value: profile.referral_code, onCopy: () => show('Código copiado.') }]
                : []),
            ]}
          />

          <IndiqueGanheCard
            earnedCents={referralSummary?.qualifiedTotalCents ?? null}
            pendingCount={referralSummary?.pendingCount ?? 0}
            onVerGanhos={() => router.push('/(tabs)/mais/indique-e-ganhe')}
          />

          <FalarComDooplaCard onPress={() => show('Abrindo WhatsApp… (mock)')} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingBottom: 24,
  },
  main: {
    paddingHorizontal: 16,
    paddingTop: 6,
  },
});
