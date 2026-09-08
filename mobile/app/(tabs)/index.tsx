import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';

import { colors, fonts } from '@/theme/tokens';
import { useAuth } from '@/hooks/useAuth';
import { HomeTopbar } from '@/components/home/HomeTopbar';
import { NotificationsSheet } from '@/components/home/NotificationsSheet';
import { HomeHero } from '@/components/home/HomeHero';
import { StatsCarousel } from '@/components/home/StatsCarousel';
import { StatCard } from '@/components/home/StatCard';
import { AccordionSection } from '@/components/home/AccordionSection';
import { BookingRow } from '@/components/home/BookingRow';
import { DecisionCard } from '@/components/home/DecisionCard';
import { ChannelsCard } from '@/components/home/ChannelsCard';
import { IndiqueGanheCard } from '@/components/home/IndiqueGanheCard';
import { FalarComDooplaCard } from '@/components/home/FalarComDooplaCard';
import { ReadinessCard, type ReadinessRowData } from '@/components/home/ReadinessCard';
import { useToast } from '@/components/shared/Toast';
import { NegotiationIcon, HourglassIcon, CheckIcon, MoneyIcon, LinkIcon, HashIcon, WhatsAppLogoIcon } from '@/components/icons/Icons';
import { STATUS_LABELS, computeArtistStats, fetchUserBookings, type BookingWithOtherParty } from '@/lib/data/bookings';
import { fetchReferralSummary, type ReferralSummary } from '@/lib/data/referrals';
import { fetchProfessionalHomeFacts, type ProfessionalHomeFacts } from '@/lib/data/home-facts';
import { fetchActionableDecisions, groupDecisionsByConversation, sortDecisionsByPriority, type DecisionItem } from '@/lib/data/decisions';
import { fetchActivePaymentDetails } from '@/lib/data/payments';
import type { PaymentDetails } from '@/types/payment';
import { fetchNotificationCards, markCommunityNotificationRead, type NotificationCard } from '@/lib/data/notifications';
import { buildTalkToYourDooplaUrl } from '@/lib/professional-doopla-cta';
import { dooplaWhatsappNumber } from '@/lib/env';
import { capitalizeName, monthDayParts } from '@/lib/format';

export default function HomeScreen() {
  const router = useRouter();
  const { show } = useToast();
  const { professionalId, profile } = useAuth();
  const [bookings, setBookings] = useState<BookingWithOtherParty[]>([]);
  const [referralSummary, setReferralSummary] = useState<ReferralSummary | null>(null);
  const [homeFacts, setHomeFacts] = useState<ProfessionalHomeFacts | null>(null);
  const [decisions, setDecisions] = useState<DecisionItem[]>([]);
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetails | null | undefined>(undefined);
  const [notifications, setNotifications] = useState<NotificationCard[]>([]);
  const [notificationsPhase, setNotificationsPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const loadNotifications = useCallback(() => {
    setNotificationsPhase('loading');
    fetchNotificationCards()
      .then((data) => {
        setNotifications(data);
        setNotificationsPhase('ready');
      })
      .catch(() => setNotificationsPhase('error'));
  }, []);

  useEffect(() => {
    if (!professionalId) return;
    fetchUserBookings(professionalId).then(setBookings).catch(() => setBookings([]));
    if (profile?.referral_code) {
      fetchReferralSummary(professionalId, profile.referral_code).then(setReferralSummary).catch(() => setReferralSummary(null));
    }
    fetchProfessionalHomeFacts().then(setHomeFacts).catch(() => setHomeFacts(null));
    // Mesma regra de dedupe/prioridade da tela de Decisões (1 card por
    // conversa) — nunca contar a lista crua aqui, senão a Home pode
    // divergir do card de estatística ao lado (mesma classe de bug já
    // corrigida no painel Web).
    fetchActionableDecisions()
      .then((items) => setDecisions(sortDecisionsByPriority(groupDecisionsByConversation(items))))
      .catch(() => setDecisions([]));
    // Bloco 4 (progressive profiling, 08/09/2026) — mesma fonte canônica
    // da tela Dinheiro (fetchActivePaymentDetails, mesma RLS/tabela do
    // Web). Falha vira `null` (nunca trava a Home nem finge "pronto").
    fetchActivePaymentDetails(professionalId).then(setPaymentDetails).catch(() => setPaymentDetails(null));
  }, [professionalId, profile?.referral_code]);

  // Badge de não lidas precisa existir mesmo com o sheet fechado —
  // mesma lógica do popover web (busca uma vez ao montar).
  useEffect(() => {
    const timer = setTimeout(loadNotifications, 0);
    return () => clearTimeout(timer);
  }, [loadNotifications]);

  const unreadNotificationsCount = notifications.filter((n) => n.unread).length;

  function handleNotificationPress(item: NotificationCard) {
    setNotifications((prev) => prev.map((n) => (n.id === item.id ? { ...n, unread: false } : n)));
    markCommunityNotificationRead(item.id).catch(() => {});
    setNotificationsOpen(false);
    router.push(`/forum/${item.topicId}`);
  }

  const stats = computeArtistStats(bookings);
  const bookingById = new Map(bookings.map((b) => [b.id, b]));
  const upcoming = bookings
    .filter((b) => ['proposta_enviada', 'aceita', 'aguardando_pagamento'].includes(b.status))
    .slice(0, 5);

  // Bloco 4 — nudge progressivo (08/09/2026). `undefined` (ainda
  // carregando) nunca mostra a linha — evita um falso positivo piscando
  // antes do fetch resolver. Só "Dados de recebimento" no App nesta
  // rodada: "Contexto profissional" (regions/careerStage/helpAreas)
  // não tem superfície de edição real no App ainda (gap real,
  // registrado no PROGRESS.md) — nunca aponta pra uma tela que não
  // existe.
  const readinessRows: ReadinessRowData[] =
    paymentDetails === null
      ? [
          {
            key: 'payment',
            label: 'Dados de recebimento',
            description: 'Sem isso, a Doopla não consegue fechar pagamento com o cliente.',
            ctaLabel: 'Completar →',
            onPress: () => router.push('/(tabs)/mais/financeiro'),
          },
        ]
      : [];

  const whatsappNumber = (() => {
    try {
      return dooplaWhatsappNumber();
    } catch {
      return null;
    }
  })();
  const whatsappUrl = whatsappNumber ? buildTalkToYourDooplaUrl(whatsappNumber) : null;
  const identityVerified = homeFacts?.whatsappIdentityStatus === 'verified';

  // Mesmo padrão de mais/indique-e-ganhe.tsx — clipboard real, toast só
  // depois do side effect (nunca sucesso mockado).
  async function copy(text: string, label: string) {
    await Clipboard.setStringAsync(text);
    show(`${label} copiado.`);
  }
  const slug = profile?.slug;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <HomeTopbar
          notificationsCount={unreadNotificationsCount}
          forumHasNew={false}
          onOpenForum={() => router.push('/forum')}
          onOpenNotifications={() => setNotificationsOpen(true)}
        />

        <View style={styles.main}>
          <HomeHero
            firstName={capitalizeName(profile?.full_name?.split(' ')[0] ?? '')}
            needsYouCount={homeFacts?.conversationsNeedingYouCount ?? 0}
            hasDooplaPro={homeFacts?.hasDooplaPro ?? false}
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
              <BookingRow month="" day="-" name="Nenhum booking em andamento" place="" statusLabel="" statusTone="green" />
            ) : (
              upcoming.map((b, i) => {
                const { month, day } = b.event_date ? monthDayParts(b.event_date) : { month: '', day: '-' };
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

          {/* Correção 06/09/2026 — "Seus canais de booking" mostra só
             canais de entrada de cliente: link de orçamento, WhatsApp
             da Doopla (real ou "Em configuração" — número oficial
             ainda em análise no WhatsApp/Meta, nunca escondido) e
             código ID (profile.slug, mesma fonte canônica do web —
             nunca referral_code, que é de outro conceito/Indique e
             ganhe). Booker não é canal de booking — vive só em Minha
             equipe, removido daqui. */}
          <ReadinessCard rows={readinessRows} />

          <ChannelsCard
            title="Seus canais de booking"
            rows={[
              ...(slug
                ? [{ key: 'link', icon: <LinkIcon size={13} color={colors.off} />, label: 'Seu link', value: `doopla.com/${slug}`, onCopy: () => copy(`doopla.com/${slug}`, 'Link') }]
                : []),
              {
                key: 'whatsapp',
                icon: <WhatsAppLogoIcon size={13} color={colors.off} />,
                label: 'WhatsApp da Doopla',
                value: whatsappNumber ?? 'Em configuração',
              },
              ...(slug
                ? [{ key: 'code', icon: <HashIcon size={13} color={colors.off} />, label: 'Seu código ID', value: slug, onCopy: () => copy(slug, 'Código') }]
                : []),
            ]}
          />

          <IndiqueGanheCard
            earnedCents={referralSummary?.qualifiedTotalCents ?? null}
            pendingCount={referralSummary?.pendingCount ?? 0}
            onVerGanhos={() => router.push('/(tabs)/mais/indique-e-ganhe')}
          />

          <FalarComDooplaCard whatsappUrl={whatsappUrl} identityVerified={identityVerified} />
        </View>
      </ScrollView>

      <NotificationsSheet
        visible={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        phase={notificationsPhase}
        items={notifications}
        onRetry={loadNotifications}
        onItemPress={handleNotificationPress}
      />
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
});
