import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts } from '@/theme/tokens';
import { useAuth } from '@/hooks/useAuth';
import { HomeTopbar } from '@/components/home/HomeTopbar';
import { HomeHero } from '@/components/home/HomeHero';
import { StatsCarousel } from '@/components/home/StatsCarousel';
import { StatCard } from '@/components/home/StatCard';
import { AccordionSection } from '@/components/home/AccordionSection';
import { BookingRow } from '@/components/home/BookingRow';
import { DecisionCard } from '@/components/home/DecisionCard';
import { ChannelsCard } from '@/components/home/ChannelsCard';
import { IndiqueGanheCard } from '@/components/home/IndiqueGanheCard';
import { FalarComDooplaCard } from '@/components/home/FalarComDooplaCard';
import { useToast } from '@/components/shared/Toast';
import { NegotiationIcon, HourglassIcon, CheckIcon, MoneyIcon, LinkIcon, HashIcon } from '@/components/icons/Icons';
import { STATUS_LABELS, computeArtistStats, fetchUserBookings, type BookingWithOtherParty } from '@/lib/data/bookings';
import { fetchReferralSummary, type ReferralSummary } from '@/lib/data/referrals';
import { fetchProfessionalHomeFacts, type ProfessionalHomeFacts } from '@/lib/data/home-facts';
import { fetchActionableDecisions, type DecisionItem } from '@/lib/data/decisions';
import { fetchMyBookerFacts, type ProfessionalBookerFacts } from '@/lib/data/booker';
import { buildTalkToYourDooplaUrl } from '@/lib/professional-doopla-cta';
import { dooplaWhatsappNumber } from '@/lib/env';
import { formatCentsAsBRL, monthDayParts } from '@/lib/format';

export default function HomeScreen() {
  const router = useRouter();
  const { show } = useToast();
  const { professionalId, profile } = useAuth();
  const [bookings, setBookings] = useState<BookingWithOtherParty[]>([]);
  const [referralSummary, setReferralSummary] = useState<ReferralSummary | null>(null);
  const [homeFacts, setHomeFacts] = useState<ProfessionalHomeFacts | null>(null);
  const [decisions, setDecisions] = useState<DecisionItem[]>([]);
  const [bookerFacts, setBookerFacts] = useState<ProfessionalBookerFacts | null>(null);

  useEffect(() => {
    if (!professionalId) return;
    fetchUserBookings(professionalId).then(setBookings).catch(() => setBookings([]));
    if (profile?.referral_code) {
      fetchReferralSummary(professionalId, profile.referral_code).then(setReferralSummary).catch(() => setReferralSummary(null));
    }
    fetchProfessionalHomeFacts().then(setHomeFacts).catch(() => setHomeFacts(null));
    fetchActionableDecisions().then(setDecisions).catch(() => setDecisions([]));
    fetchMyBookerFacts(professionalId).then(setBookerFacts).catch(() => setBookerFacts(null));
  }, [professionalId, profile?.referral_code]);

  const stats = computeArtistStats(bookings);
  const bookingById = new Map(bookings.map((b) => [b.id, b]));
  const upcoming = bookings
    .filter((b) => ['proposta_enviada', 'aceita', 'aguardando_pagamento'].includes(b.status))
    .slice(0, 5);

  const whatsappNumber = (() => {
    try {
      return dooplaWhatsappNumber();
    } catch {
      return null;
    }
  })();
  const whatsappUrl = whatsappNumber ? buildTalkToYourDooplaUrl(whatsappNumber) : null;
  const identityVerified = homeFacts?.whatsappIdentityStatus === 'verified';

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <HomeTopbar notificationsCount={0} forumHasNew={false} onOpenForum={() => router.push('/forum')} />

        <View style={styles.main}>
          <HomeHero
            firstName={profile?.full_name?.split(' ')[0] ?? ''}
            needsYouCount={homeFacts?.conversationsNeedingYouCount ?? 0}
          />

          <StatsCarousel>
            <StatCard
              icon={<NegotiationIcon size={14} color={colors.red} />}
              tone="red"
              num={String(homeFacts?.bookingsAwaitingResponseCount ?? stats.activeCount)}
              label="Aguardando sua resposta"
            />
            <StatCard
              icon={<HourglassIcon size={14} color={colors.amber} />}
              tone="amber"
              num={String(homeFacts?.conversationsNeedingYouCount ?? 0)}
              label="Conversas que precisam de você"
            />
            <StatCard
              icon={<CheckIcon size={14} color={colors.green} />}
              tone="green"
              num={String(homeFacts?.bookingsConfirmedCount ?? stats.closedCount)}
              label="Bookings confirmados"
            />
            <StatCard
              icon={<MoneyIcon size={14} color={colors.off} />}
              tone="off"
              num={String(homeFacts?.bookingsCompletedCount ?? 0)}
              label="Bookings concluídos"
            />
          </StatsCarousel>

          <AccordionSection title="Precisa de você" count={decisions.length}>
            {decisions.length === 0 ? (
              <Text style={styles.emptyText}>Tudo certo por aqui.</Text>
            ) : (
              decisions.map((d, i) => {
                const booking = d.relatedBookingId ? bookingById.get(d.relatedBookingId) : undefined;
                return (
                  <DecisionCard
                    key={d.id}
                    otherPartyName={booking?.otherPartyName ?? 'Conversa em andamento'}
                    kind={d.kind}
                    blockReason={d.blockReason}
                    preparedContent={d.preparedContent}
                    createdAt={d.createdAt}
                    bordered={i > 0}
                    onPress={() => router.push(`/conversas/${d.conversationId}`)}
                  />
                );
              })
            )}
          </AccordionSection>

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

          <AccordionSection title="Atividade da Doopla">
            <Text style={styles.emptyText}>Nenhuma atividade registrada ainda.</Text>
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

          {bookerFacts && (bookerFacts.active.length > 0 || bookerFacts.pending.length > 0) && (
            <Text style={styles.bookerLine}>
              {bookerFacts.active.length > 0
                ? `Representado por ${bookerFacts.active.length} booker${bookerFacts.active.length > 1 ? 's' : ''}`
                : `${bookerFacts.pending.length} convite${bookerFacts.pending.length > 1 ? 's' : ''} de booker pendente${bookerFacts.pending.length > 1 ? 's' : ''}`}
            </Text>
          )}

          <IndiqueGanheCard
            earnedCents={referralSummary?.qualifiedTotalCents ?? null}
            pendingCount={referralSummary?.pendingCount ?? 0}
            onVerGanhos={() => router.push('/(tabs)/mais/indique-e-ganhe')}
          />

          <FalarComDooplaCard whatsappUrl={whatsappUrl} identityVerified={identityVerified} />
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
  emptyText: {
    color: colors.tx50,
    fontFamily: fonts.body,
    fontSize: 12,
    paddingVertical: 6,
  },
  bookerLine: {
    color: colors.tx70,
    fontFamily: fonts.body,
    fontSize: 11.5,
    marginTop: -4,
    marginBottom: 12,
    paddingHorizontal: 2,
  },
});
