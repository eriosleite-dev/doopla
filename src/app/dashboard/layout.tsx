import type { SupabaseClient } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';
import { siteOrigin } from '@/lib/site-url';
import type { Profile } from '@/lib/supabase/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any>;

import { BookerProModal } from './booker-pro/booker-pro-modal';
import { ProModalProvider } from './booker-pro/pro-modal-context';
import { getAttentionItems, getReferralSummary, getSubscription, getUserBookings } from './data';
import { LegacyDashboardShell } from './legacy-shell';
import { getCachedProfessionalHomeFacts } from './pro-home-cache';
import { ProfessionalShell } from './pro-shell';
import { ReferralModal } from './referral-modal';
import { ReferralModalProvider } from './referral-modal-context';
import { getSessionProfile } from './session';

async function getOpportunitiesBadgeCount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  role: Profile['role']
): Promise<number> {
  if (role !== 'booker') return 0;

  const { data: bookerProfile } = await supabase
    .from('booker_profiles')
    .select('opportunities_seen_at')
    .eq('profile_id', userId)
    .single<{ opportunities_seen_at: string }>();

  const { data: dismissals } = await supabase
    .from('opportunity_dismissals')
    .select('opportunity_id')
    .eq('booker_profile_id', userId)
    .returns<{ opportunity_id: string }[]>();
  const dismissedIds = (dismissals ?? []).map((d) => d.opportunity_id);

  let query = supabase
    .from('opportunities')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'aberta')
    .gt('created_at', bookerProfile?.opportunities_seen_at ?? '1970-01-01');
  if (dismissedIds.length > 0) {
    query = query.not('id', 'in', `(${dismissedIds.join(',')})`);
  }
  const { count } = await query;
  return count ?? 0;
}

export default async function DashboardLayout({
  children,
  modal,
}: LayoutProps<'/dashboard'> & { modal: React.ReactNode }) {
  const { supabase, user, profile } = await getSessionProfile();

  const opportunitiesBadge = await getOpportunitiesBadgeCount(supabase, user.id, profile.role);
  const referralSummary =
    profile.role === 'artista' ? await getReferralSummary(user.id, profile.referral_code, supabase) : null;
  const referralUrl = referralSummary
    ? `${await siteOrigin()}/cadastro?ref=${referralSummary.referralCode}`
    : null;
  const subscription = profile.role === 'booker' ? await getSubscription(user.id, supabase) : null;
  const bookingsForAttention = await getUserBookings(user.id, profile.role, supabase);
  const attentionItemsForBell = await getAttentionItems(
    user.id,
    profile.role,
    bookingsForAttention,
    supabase
  );
  const attentionCount = attentionItemsForBell.length;
  // Vermelho é reservado pra quando existe ação urgente de verdade — caso
  // contrário o sino usa o tom de "requer atenção, mas sem pressa".
  const bellUrgent = attentionItemsForBell.some((i) => i.kind === 'urgente');
  const bellColorClass = bellUrgent ? 'bg-[var(--alert)]' : 'bg-[var(--accent)]';

  // Shell + Home bloco (04/09/2026) — o novo Shell dark é exclusivo da
  // superfície "profissional" (role !== 'booker'), nunca do Booker:
  // Booker Web Dashboard segue fora de escopo (DECISOES.md "Quatro
  // superfícies distintas"). Booker continua vendo o shell legado
  // (legacy-shell.tsx), sem NENHUMA mudança de comportamento — só este
  // branch decide qual chrome renderizar.
  return (
    <ProModalProvider>
      <ReferralModalProvider>
        {profile.role !== 'booker' ? (
          <ProfessionalShellGate
            supabase={supabase}
            fullName={profile.full_name}
            email={user.email ?? ''}
            avatarUrl={profile.avatar_url}
            attentionCount={attentionCount}
            bellUrgent={bellUrgent}
            referralEligible={!!referralUrl && !!referralSummary}
          >
            {children}
          </ProfessionalShellGate>
        ) : (
          <LegacyDashboardShell
            modal={modal}
            user={user}
            profile={profile}
            opportunitiesBadge={opportunitiesBadge}
            referralUrl={referralUrl}
            referralSummary={referralSummary}
            subscription={subscription}
            attentionCount={attentionCount}
            bellColorClass={bellColorClass}
          >
            {children}
          </LegacyDashboardShell>
        )}
        {profile.role !== 'booker' && modal}
        <BookerProModal />
        {referralUrl && referralSummary && (
          <ReferralModal
            referralUrl={referralUrl}
            referralCount={referralSummary.referrals.length}
            pendingCount={referralSummary.pendingCount}
            qualifiedTotalCents={referralSummary.qualifiedTotalCents}
          />
        )}
      </ReferralModalProvider>
    </ProModalProvider>
  );
}

async function ProfessionalShellGate({
  supabase,
  fullName,
  email,
  avatarUrl,
  attentionCount,
  bellUrgent,
  referralEligible,
  children,
}: {
  supabase: AnySupabaseClient;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  attentionCount: number;
  bellUrgent: boolean;
  referralEligible: boolean;
  children: React.ReactNode;
}) {
  const homeFacts = await getCachedProfessionalHomeFacts(supabase);
  return (
    <ProfessionalShell
      fullName={fullName}
      email={email}
      avatarUrl={avatarUrl}
      subscriptionPlan={homeFacts?.subscriptionPlan ?? null}
      attentionCount={attentionCount}
      bellUrgent={bellUrgent}
      bookingsAwaitingCount={homeFacts?.bookingsAwaitingResponseCount ?? 0}
      decisionsCount={homeFacts?.conversationsNeedingYouCount ?? 0}
      referralEligible={referralEligible}
    >
      {children}
    </ProfessionalShell>
  );
}
