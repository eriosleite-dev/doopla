import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '@/theme/tokens';
import { HomeTopbar } from '@/components/home/HomeTopbar';
import { HomeHero } from '@/components/home/HomeHero';
import { StatsCarousel } from '@/components/home/StatsCarousel';
import { StatCard } from '@/components/home/StatCard';
import { AccordionSection } from '@/components/home/AccordionSection';
import { DealCard } from '@/components/home/DealCard';
import { BookingRow } from '@/components/home/BookingRow';
import { ActivityRow } from '@/components/home/ActivityRow';
import { ChartCard } from '@/components/home/ChartCard';
import { ChannelsCard } from '@/components/home/ChannelsCard';
import { IndiqueGanheCard } from '@/components/home/IndiqueGanheCard';
import { FalarComDooplaCard } from '@/components/home/FalarComDooplaCard';
import { BottomSheet } from '@/components/shared/BottomSheet';
import { DecisionSheetContent } from '@/components/home/DecisionSheetContent';
import { useToast } from '@/components/shared/Toast';
import {
  DealTagIcon,
  ClockIcon,
  NegotiationIcon,
  HourglassIcon,
  CheckIcon,
  MoneyIcon,
  MailIcon,
  LinkIcon,
  ChatBubbleOutlineIcon,
  HashIcon,
} from '@/components/icons/Icons';
import {
  mockUser,
  mockStats,
  mockDeals,
  mockBookings,
  mockActivity,
  mockChartMetrics,
  mockChannels,
  mockIndique,
  type DecisionModalKind,
} from '@/data/homeMock';

const STAT_ICONS = {
  negociacoes: <NegotiationIcon size={14} color={colors.red} />,
  aguardando: <HourglassIcon size={14} color={colors.amber} />,
  confirmados: <CheckIcon size={14} color={colors.green} />,
  mes: <MoneyIcon size={14} color={colors.off} />,
} as const;

const DEAL_ICONS = {
  marina: <DealTagIcon size={12} color={colors.red} />,
  alma: <ClockIcon size={12} color={colors.red} />,
} as const;

const ACTIVITY_ICONS = {
  chat: <NegotiationIcon size={11} color={colors.tx70} />,
  mail: <MailIcon size={11} color={colors.tx70} />,
} as const;

export default function HomeScreen() {
  const router = useRouter();
  const { show } = useToast();
  const [sheetKind, setSheetKind] = useState<DecisionModalKind | null>(null);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <HomeTopbar notificationsCount={3} forumHasNew onOpenForum={() => router.push('/forum')} />

        <View style={styles.main}>
          <HomeHero firstName={mockUser.firstName} />

          <StatsCarousel>
            {mockStats.map((s) => (
              <StatCard key={s.key} icon={STAT_ICONS[s.key as keyof typeof STAT_ICONS]} tone={s.tone} num={s.num} label={s.label} />
            ))}
          </StatsCarousel>

          <AccordionSection title="Precisa de você" count={mockDeals.length} linkLabel="Ver todas" onLinkPress={() => show('Em breve: lista completa.')}>
            {mockDeals.map((deal) => (
              <DealCard
                key={deal.key}
                icon={DEAL_ICONS[deal.key as keyof typeof DEAL_ICONS]}
                name={deal.name}
                meta={deal.meta}
                note={deal.note}
                when={deal.when}
                onDetalhes={() => setSheetKind('conversation')}
                onDecidir={() => setSheetKind(deal.modal)}
              />
            ))}
          </AccordionSection>

          <AccordionSection title="Próximos bookings" linkLabel="Ver agenda" onLinkPress={() => router.push('/(tabs)/agenda')}>
            {mockBookings.map((b, i) => (
              <BookingRow
                key={b.key}
                month={b.month}
                day={b.day}
                name={b.name}
                place={b.place}
                statusLabel={b.statusLabel}
                statusTone={b.statusTone}
                bordered={i > 0}
              />
            ))}
          </AccordionSection>

          <AccordionSection title="Atividade da Doopla" linkLabel="Ver todas" onLinkPress={() => show('Em breve: histórico completo.')}>
            {mockActivity.map((a, i) => (
              <ActivityRow
                key={a.key}
                icon={ACTIVITY_ICONS[a.kind]}
                text={a.text}
                boldPart={a.boldPart}
                sub={a.sub}
                time={a.time}
                bordered={i > 0}
              />
            ))}
          </AccordionSection>

          <ChartCard metrics={mockChartMetrics} onVerPress={() => show('Em breve: analytics completo.')} />

          <ChannelsCard
            title="Seus canais de booking"
            rows={[
              { key: 'link', icon: <LinkIcon size={13} color={colors.off} />, label: 'Seu link', value: mockChannels.link, onCopy: () => show('Link copiado.') },
              { key: 'wa', icon: <ChatBubbleOutlineIcon size={13} color={colors.off} />, label: 'WhatsApp da Doopla', value: mockChannels.whatsapp },
              { key: 'code', icon: <HashIcon size={13} color={colors.off} />, label: 'Seu código ID', value: mockChannels.code, onCopy: () => show('Código copiado.') },
            ]}
          />

          <IndiqueGanheCard
            earned={mockIndique.earned}
            activeSubscribers={mockIndique.activeSubscribers}
            onVerGanhos={() => show('Em breve: seus ganhos.')}
          />

          <FalarComDooplaCard onPress={() => show('Abrindo WhatsApp… (mock)')} />
        </View>
      </ScrollView>

      <BottomSheet visible={sheetKind !== null} onClose={() => setSheetKind(null)}>
        {sheetKind && <DecisionSheetContent kind={sheetKind} onDone={() => setSheetKind(null)} />}
      </BottomSheet>
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
