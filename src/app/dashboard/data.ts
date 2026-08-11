import type { createClient } from '@/lib/supabase/server';
import { formatRelativeDate } from '@/lib/format';
import type {
  Booking,
  BookingStatus,
  Invite,
  Opportunity,
  Profile,
} from '@/lib/supabase/types';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type BookingWithOtherParty = Booking & { otherPartyName: string };

async function attachOtherPartyNames(
  bookings: Booking[],
  role: Profile['role'],
  supabase: SupabaseServerClient
): Promise<BookingWithOtherParty[]> {
  if (bookings.length === 0) return [];

  const otherIds = [
    ...new Set(
      bookings.map((b) =>
        role === 'booker' ? b.artist_profile_id : b.booker_profile_id
      )
    ),
  ];
  const { data: others } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', otherIds)
    .returns<Pick<Profile, 'id' | 'full_name'>[]>();

  const nameById = new Map((others ?? []).map((p) => [p.id, p.full_name]));
  return bookings.map((b) => ({
    ...b,
    otherPartyName:
      nameById.get(role === 'booker' ? b.artist_profile_id : b.booker_profile_id) ??
      'Alguém',
  }));
}

export async function getUserBookings(
  userId: string,
  role: Profile['role'],
  supabase: SupabaseServerClient
): Promise<BookingWithOtherParty[]> {
  const column = role === 'booker' ? 'booker_profile_id' : 'artist_profile_id';
  const { data } = await supabase
    .from('bookings')
    .select('*')
    .eq(column, userId)
    .order('updated_at', { ascending: false })
    .returns<Booking[]>();

  return attachOtherPartyNames(data ?? [], role, supabase);
}

function isThisMonth(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function isPrevMonth(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return d.getFullYear() === prev.getFullYear() && d.getMonth() === prev.getMonth();
}

function commissionCents(booking: Booking): number {
  if (!booking.cache_amount_cents) return 0;
  return Math.round((booking.cache_amount_cents * booking.commission_percent) / 100);
}

export type BookerStats = {
  totalEarnedCents: number;
  monthEarnedCents: number;
  monthEarnedPrevCents: number;
  activeCount: number;
  awaitingPaymentCount: number;
  acceptanceRatePercent: number;
  acceptedCount: number;
  decidedCount: number;
};

export function computeBookerStats(bookings: Booking[]): BookerStats {
  const concluded = bookings.filter((b) => b.status === 'concluida');
  const totalEarnedCents = concluded.reduce((sum, b) => sum + commissionCents(b), 0);
  const monthEarnedCents = concluded
    .filter((b) => isThisMonth(b.updated_at))
    .reduce((sum, b) => sum + commissionCents(b), 0);
  const monthEarnedPrevCents = concluded
    .filter((b) => isPrevMonth(b.updated_at))
    .reduce((sum, b) => sum + commissionCents(b), 0);

  const activeCount = bookings.filter((b) =>
    ['proposta_enviada', 'aceita', 'aguardando_pagamento'].includes(b.status)
  ).length;
  const awaitingPaymentCount = bookings.filter(
    (b) => b.status === 'aguardando_pagamento'
  ).length;

  const decided = bookings.filter(
    (b) => b.proposed_by === 'booker' && b.status !== 'proposta_enviada'
  );
  const acceptedCount = decided.filter((b) =>
    ['aceita', 'aguardando_pagamento', 'concluida'].includes(b.status)
  ).length;

  return {
    totalEarnedCents,
    monthEarnedCents,
    monthEarnedPrevCents,
    activeCount,
    awaitingPaymentCount,
    acceptanceRatePercent:
      decided.length > 0 ? Math.round((acceptedCount / decided.length) * 100) : 0,
    acceptedCount,
    decidedCount: decided.length,
  };
}

export type ArtistStats = {
  netReceivedCents: number;
  monthNetReceivedCents: number;
  closedCount: number;
  avgCommissionPercent: number;
};

export function computeArtistStats(bookings: Booking[]): ArtistStats {
  const concluded = bookings.filter((b) => b.status === 'concluida');
  const netOf = (b: Booking) =>
    (b.cache_amount_cents ?? 0) - commissionCents(b);

  const netReceivedCents = concluded.reduce((sum, b) => sum + netOf(b), 0);
  const monthNetReceivedCents = concluded
    .filter((b) => isThisMonth(b.updated_at))
    .reduce((sum, b) => sum + netOf(b), 0);

  const recent = [...concluded]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 5);
  const avgCommissionPercent =
    recent.length > 0
      ? recent.reduce((sum, b) => sum + Number(b.commission_percent), 0) / recent.length
      : 0;

  return {
    netReceivedCents,
    monthNetReceivedCents,
    closedCount: concluded.length,
    avgCommissionPercent,
  };
}

const IN_MOVEMENT_STATUSES: BookingStatus[] = [
  'proposta_enviada',
  'aceita',
  'aguardando_pagamento',
];

// Número único da aba Hoje: quanto está em jogo agora em bookings que
// ainda não fecharam (nem concluídos, nem recusados).
export function computeInMovementCents(
  bookings: Booking[],
  role: Profile['role']
): number {
  const inMovement = bookings.filter(
    (b) => IN_MOVEMENT_STATUSES.includes(b.status) && b.cache_amount_cents != null
  );
  if (role === 'booker') {
    return inMovement.reduce((sum, b) => sum + commissionCents(b), 0);
  }
  return inMovement.reduce(
    (sum, b) => sum + (b.cache_amount_cents! - commissionCents(b)),
    0
  );
}

export type AttentionItem = { text: string; href: string };

export async function getAttentionItems(
  userId: string,
  role: Profile['role'],
  bookings: BookingWithOtherParty[],
  supabase: SupabaseServerClient
): Promise<AttentionItem[]> {
  const items: AttentionItem[] = [];

  if (role === 'booker') {
    const { data: bookerProfile } = await supabase
      .from('booker_profiles')
      .select('opportunities_seen_at')
      .eq('profile_id', userId)
      .single<{ opportunities_seen_at: string }>();
    const { count: newOppsCount } = await supabase
      .from('opportunities')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'aberta')
      .gt('created_at', bookerProfile?.opportunities_seen_at ?? '1970-01-01');
    if (newOppsCount && newOppsCount > 0) {
      items.push({
        text: `${newOppsCount} ${newOppsCount === 1 ? 'oportunidade nova combina' : 'oportunidades novas combinam'} com o seu nicho, ainda não vistas`,
        href: '/dashboard/oportunidades',
      });
    }

    for (const b of bookings.filter((x) => x.status === 'aguardando_pagamento')) {
      items.push({
        text: `${b.otherPartyName}, cliente ainda não pagou, booking fechado ${formatRelativeDate(b.updated_at)}`,
        href: `/dashboard/bookings/${b.id}`,
      });
    }
    for (const b of bookings.filter(
      (x) => x.status === 'proposta_enviada' && x.proposed_by === 'booker'
    )) {
      items.push({
        text: `Sua proposta de ${b.commission_percent}% pra ${b.otherPartyName} está aguardando resposta`,
        href: `/dashboard/bookings/${b.id}`,
      });
    }
  } else {
    for (const b of bookings.filter(
      (x) => x.status === 'proposta_enviada' && x.proposed_by !== 'artista'
    )) {
      items.push({
        text: `${b.otherPartyName} propôs ${b.commission_percent}% de comissão`,
        href: `/dashboard/bookings/${b.id}`,
      });
    }
  }

  return items;
}

export type PendingInvite = Invite & { inviterName: string };

export async function getPendingInvites(
  userId: string,
  supabase: SupabaseServerClient
): Promise<PendingInvite[]> {
  const { data: invites } = await supabase
    .from('invites')
    .select('*')
    .eq('invitee_profile_id', userId)
    .eq('status', 'pendente')
    .order('created_at', { ascending: false })
    .returns<Invite[]>();

  if (!invites || invites.length === 0) return [];

  const inviterIds = [...new Set(invites.map((i) => i.inviter_profile_id))];
  const { data: inviters } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', inviterIds)
    .returns<Pick<Profile, 'id' | 'full_name'>[]>();

  const nameById = new Map((inviters ?? []).map((p) => [p.id, p.full_name]));
  return invites.map((invite) => ({
    ...invite,
    inviterName: nameById.get(invite.inviter_profile_id) ?? 'Alguém',
  }));
}

export type RepresentedArtist = { id: string; full_name: string };

// Artistas confirmados desse booker (representations), pro seletor da
// tela de "Nova proposta".
export async function getRepresentedArtists(
  userId: string,
  supabase: SupabaseServerClient
): Promise<RepresentedArtist[]> {
  const { data: reps } = await supabase
    .from('representations')
    .select('artist_profile_id')
    .eq('booker_profile_id', userId)
    .returns<{ artist_profile_id: string }[]>();

  const artistIds = (reps ?? []).map((r) => r.artist_profile_id);
  if (artistIds.length === 0) return [];

  const { data: artists } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', artistIds)
    .returns<Pick<Profile, 'id' | 'full_name'>[]>();

  return (artists ?? []).map((a) => ({ id: a.id, full_name: a.full_name }));
}

export type OpportunityWithArtist = Opportunity & { artistName: string };

// Mural do booker: oportunidades abertas, sem as que ele já dispensou ou
// já demonstrou interesse (tem um booking apontando pra elas).
export async function getOpenOpportunitiesForBooker(
  userId: string,
  supabase: SupabaseServerClient
): Promise<OpportunityWithArtist[]> {
  const { data: opportunities } = await supabase
    .from('opportunities')
    .select('*')
    .eq('status', 'aberta')
    .order('created_at', { ascending: false })
    .returns<Opportunity[]>();
  if (!opportunities || opportunities.length === 0) return [];

  const { data: dismissals } = await supabase
    .from('opportunity_dismissals')
    .select('opportunity_id')
    .eq('booker_profile_id', userId)
    .returns<{ opportunity_id: string }[]>();
  const dismissedIds = new Set((dismissals ?? []).map((d) => d.opportunity_id));

  const { data: claimed } = await supabase
    .from('bookings')
    .select('opportunity_id')
    .eq('booker_profile_id', userId)
    .not('opportunity_id', 'is', null)
    .returns<{ opportunity_id: string | null }[]>();
  const claimedIds = new Set((claimed ?? []).map((c) => c.opportunity_id));

  const visible = opportunities.filter(
    (o) => !dismissedIds.has(o.id) && !claimedIds.has(o.id)
  );
  if (visible.length === 0) return [];

  const artistIds = [...new Set(visible.map((o) => o.artist_profile_id))];
  const { data: artists } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', artistIds)
    .returns<Pick<Profile, 'id' | 'full_name'>[]>();
  const nameById = new Map((artists ?? []).map((p) => [p.id, p.full_name]));

  return visible.map((o) => ({
    ...o,
    artistName: nameById.get(o.artist_profile_id) ?? 'Alguém',
  }));
}

export const BOOKING_STATUS_FILTERS: { value: BookingStatus | 'todos'; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'proposta_enviada', label: 'Aguardando' },
  { value: 'aceita', label: 'Aceitos' },
  { value: 'concluida', label: 'Concluídos' },
];
