import type { createClient } from '@/lib/supabase/server';
import { formatRelativeDate } from '@/lib/format';
import type {
  ArtistAvailability,
  Booking,
  BookingEvent,
  BookingStatus,
  Invite,
  Opportunity,
  PayoutRequest,
  Profile,
} from '@/lib/supabase/types';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type BookingWithOtherParty = Booking & { otherPartyName: string };

export type Checkpoint = { key: string; label: string; done: boolean };

// Os 5 checkpoints do card de trabalho (Cliente/Cachê/Data/Validado/
// Pagamento). Cliente, Cachê e Pagamento já são deriváveis do que existe;
// Validado é setado pelo link de validação do cliente (Bloco E — por
// enquanto sempre pendente, já que esse link ainda não existe).
export function getBookingCheckpoints(booking: Booking): Checkpoint[] {
  return [
    {
      key: 'cliente',
      label: 'Cliente',
      done: booking.status !== 'proposta_enviada' && booking.status !== 'recusada',
    },
    { key: 'cache', label: 'Cachê', done: booking.cache_amount_cents != null },
    { key: 'data', label: 'Data', done: booking.event_date != null },
    { key: 'validado', label: 'Validado', done: booking.validated_at != null },
    { key: 'pagamento', label: 'Pagamento', done: booking.status === 'concluida' },
  ];
}

export function isDooplaVerified(booking: Booking): boolean {
  return booking.validated_at != null;
}

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

export async function getRepresentedArtists(
  bookerId: string,
  supabase: SupabaseServerClient
): Promise<Pick<Profile, 'id' | 'full_name'>[]> {
  const { data: reps } = await supabase
    .from('representations')
    .select('artist_profile_id')
    .eq('booker_profile_id', bookerId)
    .returns<{ artist_profile_id: string }[]>();

  const artistIds = (reps ?? []).map((r) => r.artist_profile_id);
  if (artistIds.length === 0) return [];

  const { data: artists } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', artistIds)
    .order('full_name', { ascending: true })
    .returns<Pick<Profile, 'id' | 'full_name'>[]>();

  return artists ?? [];
}

export type BookerCard = {
  profileId: string;
  fullName: string;
  city: string | null;
  state: string | null;
  perfil: string | null;
  mercados: string | null;
  foco: string | null;
};

async function fetchBookerCards(
  profileIds: string[],
  supabase: SupabaseServerClient
): Promise<BookerCard[]> {
  if (profileIds.length === 0) return [];

  const [{ data: profiles }, { data: bookerProfiles }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, city, state')
      .in('id', profileIds)
      .returns<Pick<Profile, 'id' | 'full_name' | 'city' | 'state'>[]>(),
    supabase
      .from('booker_profiles')
      .select('profile_id, perfil, mercados, foco')
      .in('profile_id', profileIds)
      .returns<{ profile_id: string; perfil: string | null; mercados: string | null; foco: string | null }[]>(),
  ]);

  const bookerByProfileId = new Map((bookerProfiles ?? []).map((b) => [b.profile_id, b]));
  return (profiles ?? []).map((p) => {
    const b = bookerByProfileId.get(p.id);
    return {
      profileId: p.id,
      fullName: p.full_name,
      city: p.city,
      state: p.state,
      perfil: b?.perfil ?? null,
      mercados: b?.mercados ?? null,
      foco: b?.foco ?? null,
    };
  });
}

export async function getArtistBookers(
  artistId: string,
  supabase: SupabaseServerClient
): Promise<BookerCard[]> {
  const { data: reps } = await supabase
    .from('representations')
    .select('booker_profile_id')
    .eq('artist_profile_id', artistId)
    .returns<{ booker_profile_id: string }[]>();

  const bookerIds = (reps ?? []).map((r) => r.booker_profile_id);
  return fetchBookerCards(bookerIds, supabase);
}

export async function getDiscoverBookers(
  excludeIds: string[],
  supabase: SupabaseServerClient,
  limit = 12
): Promise<BookerCard[]> {
  let query = supabase
    .from('booker_profiles')
    .select('profile_id')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (excludeIds.length > 0) {
    query = query.not('profile_id', 'in', `(${excludeIds.join(',')})`);
  }
  const { data } = await query.returns<{ profile_id: string }[]>();
  return fetchBookerCards((data ?? []).map((d) => d.profile_id), supabase);
}

export type OpportunityWithArtist = Opportunity & { artistName: string };

export async function getOpenOpportunities(
  bookerId: string,
  supabase: SupabaseServerClient
): Promise<OpportunityWithArtist[]> {
  const { data: dismissals } = await supabase
    .from('opportunity_dismissals')
    .select('opportunity_id')
    .eq('booker_profile_id', bookerId)
    .returns<{ opportunity_id: string }[]>();
  const dismissedIds = (dismissals ?? []).map((d) => d.opportunity_id);

  let query = supabase
    .from('opportunities')
    .select('*')
    .eq('status', 'aberta')
    .order('created_at', { ascending: false });
  if (dismissedIds.length > 0) {
    query = query.not('id', 'in', `(${dismissedIds.join(',')})`);
  }
  const { data: opportunities } = await query.returns<Opportunity[]>();
  if (!opportunities || opportunities.length === 0) return [];

  const artistIds = [...new Set(opportunities.map((o) => o.artist_profile_id))];
  const { data: artists } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', artistIds)
    .returns<Pick<Profile, 'id' | 'full_name'>[]>();
  const nameById = new Map((artists ?? []).map((p) => [p.id, p.full_name]));

  return opportunities.map((o) => ({
    ...o,
    artistName: nameById.get(o.artist_profile_id) ?? 'Artista',
  }));
}

export type BookingDetail = {
  booking: BookingWithOtherParty;
  events: BookingEvent[];
  isProposer: boolean;
};

export async function getBookingDetail(
  bookingId: string,
  userId: string,
  role: Profile['role'],
  supabase: SupabaseServerClient
): Promise<BookingDetail | null> {
  const { data: booking } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .single<Booking>();

  if (!booking) return null;
  if (booking.artist_profile_id !== userId && booking.booker_profile_id !== userId) {
    return null;
  }

  const [{ data: events }, [withName]] = await Promise.all([
    supabase
      .from('booking_events')
      .select('*')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: true })
      .returns<BookingEvent[]>(),
    attachOtherPartyNames([booking], role, supabase),
  ]);

  const proposerId =
    booking.proposed_by === 'artista' ? booking.artist_profile_id : booking.booker_profile_id;

  return {
    booking: withName,
    events: events ?? [],
    isProposer: proposerId === userId,
  };
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

export const BOOKING_STATUS_FILTERS: { value: BookingStatus | 'todos'; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'proposta_enviada', label: 'Aguardando' },
  { value: 'aceita', label: 'Aceitos' },
  { value: 'concluida', label: 'Concluídos' },
];

export type ContractStatus = 'anexado' | 'sem_contrato';

export function contractStatus(booking: Booking): ContractStatus {
  return booking.contract_url ? 'anexado' : 'sem_contrato';
}

export const CONTRACT_STATUS_FILTERS: { value: ContractStatus | 'todos'; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'anexado', label: 'Anexados' },
  { value: 'sem_contrato', label: 'Sem contrato' },
];

export type PayoutBalance = {
  availableCents: number;
  requests: PayoutRequest[];
};

// Disponível pra saque = total já recebido menos o que já foi solicitado
// (não processado ainda — Bloco 2/Pagar.me faz a transferência de
// verdade). Sem tabela de "já liquidado" separada, é uma aproximação
// honesta: nunca deixa pedir mais do que já ganhou.
export async function getPayoutBalance(
  userId: string,
  totalReceivedCents: number,
  supabase: SupabaseServerClient
): Promise<PayoutBalance> {
  const { data: requests } = await supabase
    .from('payout_requests')
    .select('*')
    .eq('profile_id', userId)
    .order('created_at', { ascending: false })
    .returns<PayoutRequest[]>();

  const requested = (requests ?? []).reduce((sum, r) => sum + r.amount_cents, 0);
  return {
    availableCents: Math.max(totalReceivedCents - requested, 0),
    requests: requests ?? [],
  };
}

export type OfficialCriterion = { key: string; label: string; done: boolean };

export type OfficialBookerProgress = {
  criteria: OfficialCriterion[];
  doneCount: number;
  total: number;
};

// Critérios de verdade, calculados do que já existe. "Booker Pro" e
// "Identidade verificada" ainda não têm nenhum sistema por trás (sem
// tiers pagos, sem KYC) — ficam sempre pendentes, honestamente, em vez
// de fingir que existem. Sem valor em R$ calculado em lugar nenhum
// (trava do Bloco F: bônus financeiro espera validação jurídica).
export async function getOfficialBookerProgress(
  userId: string,
  bookings: Booking[],
  supabase: SupabaseServerClient
): Promise<OfficialBookerProgress> {
  const [{ data: profile }, { data: bookerProfile }] = await Promise.all([
    supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', userId)
      .single<{ avatar_url: string | null }>(),
    supabase
      .from('booker_profiles')
      .select('perfil, foco, mercados')
      .eq('profile_id', userId)
      .single<{ perfil: string | null; foco: string | null; mercados: string | null }>(),
  ]);

  const profileComplete = Boolean(
    profile?.avatar_url && bookerProfile?.perfil && bookerProfile?.foco && bookerProfile?.mercados
  );
  const validatedCount = bookings.filter((b) => b.validated_at != null).length;
  const concludedCount = bookings.filter((b) => b.status === 'concluida').length;

  const criteria: OfficialCriterion[] = [
    { key: 'pro', label: 'Booker Pro ativo', done: false },
    { key: 'perfil', label: 'Perfil completo', done: profileComplete },
    { key: 'identidade', label: 'Identidade verificada', done: false },
    { key: 'validados', label: 'Primeiros bookings validados', done: validatedCount >= 1 },
    { key: 'historico', label: 'Histórico inicial de atendimento', done: concludedCount >= 3 },
  ];

  return {
    criteria,
    doneCount: criteria.filter((c) => c.done).length,
    total: criteria.length,
  };
}

export type AgendaEvent = {
  date: string; // yyyy-mm-dd
  kind: 'confirmado' | 'disponivel';
  title: string;
  sub: string;
  availabilityId?: string;
};

// Trabalho confirmado = negociação já aceita (não é mais só proposta) e
// tem data marcada. Disponibilidade é só do artista (marcada manualmente).
export async function getAgendaEvents(
  userId: string,
  role: Profile['role'],
  bookings: BookingWithOtherParty[],
  supabase: SupabaseServerClient
): Promise<AgendaEvent[]> {
  const events: AgendaEvent[] = bookings
    .filter(
      (b) =>
        b.event_date != null &&
        (b.status === 'aceita' || b.status === 'aguardando_pagamento' || b.status === 'concluida')
    )
    .map((b) => ({
      date: b.event_date as string,
      kind: 'confirmado',
      title: b.description || `Trabalho com ${b.otherPartyName}`,
      sub: role === 'booker' ? `Artista: ${b.otherPartyName}` : `Booker: ${b.otherPartyName}`,
    }));

  if (role === 'artista') {
    const { data: availability } = await supabase
      .from('artist_availability')
      .select('*')
      .eq('artist_profile_id', userId)
      .returns<ArtistAvailability[]>();
    for (const a of availability ?? []) {
      events.push({
        date: a.available_date,
        kind: 'disponivel',
        title: 'Livre para trabalhos',
        sub: 'Marcado manualmente por você',
        availabilityId: a.id,
      });
    }
  }

  return events;
}
