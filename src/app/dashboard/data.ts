import type { createClient } from '@/lib/supabase/server';
import { formatRelativeDate } from '@/lib/format';
import type {
  ArtistAvailability,
  ArtistLinkRouting,
  Booking,
  BookingContract,
  BookingEvent,
  BookingStatus,
  Invite,
  Opportunity,
  OpportunityInterest,
  OpportunityInterestStatus,
  OpportunityInvitation,
  OpportunityInvitationStatus,
  PayoutRequest,
  Profile,
  Referral,
  RepresentationRequest,
  RepresentationRequestStatus,
  Review,
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
  ratingAverage: number | null;
  ratingCount: number;
};

// Nota + total de avaliações de vários profiles de uma vez, calculado só
// a partir de status='ativa' — mesma regra de getReviewSummary, em lote.
async function getRatingsFor(
  profileIds: string[],
  supabase: SupabaseServerClient
): Promise<Map<string, { average: number; count: number }>> {
  if (profileIds.length === 0) return new Map();
  const { data } = await supabase
    .from('reviews')
    .select('reviewee_profile_id, rating')
    .in('reviewee_profile_id', profileIds)
    .eq('status', 'ativa')
    .returns<{ reviewee_profile_id: string; rating: number | null }[]>();

  const byProfile = new Map<string, number[]>();
  for (const r of data ?? []) {
    if (r.rating == null) continue;
    const list = byProfile.get(r.reviewee_profile_id) ?? [];
    list.push(r.rating);
    byProfile.set(r.reviewee_profile_id, list);
  }
  return new Map(
    [...byProfile.entries()].map(([id, ratings]) => [
      id,
      { average: ratings.reduce((a, b) => a + b, 0) / ratings.length, count: ratings.length },
    ])
  );
}

async function fetchBookerCards(
  profileIds: string[],
  supabase: SupabaseServerClient
): Promise<BookerCard[]> {
  if (profileIds.length === 0) return [];

  const [{ data: profiles }, { data: bookerProfiles }, ratings] = await Promise.all([
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
    getRatingsFor(profileIds, supabase),
  ]);

  const bookerByProfileId = new Map((bookerProfiles ?? []).map((b) => [b.profile_id, b]));
  return (profiles ?? []).map((p) => {
    const b = bookerByProfileId.get(p.id);
    const rating = ratings.get(p.id);
    return {
      profileId: p.id,
      fullName: p.full_name,
      city: p.city,
      state: p.state,
      perfil: b?.perfil ?? null,
      mercados: b?.mercados ?? null,
      foco: b?.foco ?? null,
      ratingAverage: rating?.average ?? null,
      ratingCount: rating?.count ?? 0,
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

// Card de booker enriquecido com o vínculo em si — desde quando existe a
// representação e quantos trabalhos estão em andamento com esse booker
// hoje. Usado só na seção "Meus Bookers" (relação ativa), onde essa
// informação faz sentido — os outros usos de getArtistBookers (roteamento
// do link, atenção) só precisam de nome/id.
export type BookerRelationshipCard = BookerCard & {
  relationshipSince: string;
  ongoingCount: number;
};

const ONGOING_BOOKING_STATUSES: BookingStatus[] = ['proposta_enviada', 'aceita', 'aguardando_pagamento'];

export async function getArtistBookerRelationships(
  artistId: string,
  supabase: SupabaseServerClient
): Promise<BookerRelationshipCard[]> {
  const { data: reps } = await supabase
    .from('representations')
    .select('booker_profile_id, created_at')
    .eq('artist_profile_id', artistId)
    .returns<{ booker_profile_id: string; created_at: string }[]>();

  if (!reps || reps.length === 0) return [];
  const bookerIds = reps.map((r) => r.booker_profile_id);

  const [cards, { data: bookings }] = await Promise.all([
    fetchBookerCards(bookerIds, supabase),
    supabase
      .from('bookings')
      .select('booker_profile_id, status')
      .eq('artist_profile_id', artistId)
      .in('booker_profile_id', bookerIds)
      .returns<{ booker_profile_id: string; status: BookingStatus }[]>(),
  ]);

  const sinceById = new Map(reps.map((r) => [r.booker_profile_id, r.created_at]));
  const ongoingById = new Map<string, number>();
  for (const b of bookings ?? []) {
    if (!ONGOING_BOOKING_STATUSES.includes(b.status)) continue;
    ongoingById.set(b.booker_profile_id, (ongoingById.get(b.booker_profile_id) ?? 0) + 1);
  }

  return cards.map((c) => ({
    ...c,
    relationshipSince: sinceById.get(c.profileId) ?? '',
    ongoingCount: ongoingById.get(c.profileId) ?? 0,
  }));
}

export async function getSentInvites(
  bookerId: string,
  supabase: SupabaseServerClient
): Promise<Invite[]> {
  const { data } = await supabase
    .from('invites')
    .select('*')
    .eq('inviter_profile_id', bookerId)
    .order('created_at', { ascending: false })
    .returns<Invite[]>();
  return data ?? [];
}

export async function getArtistLinkRouting(
  artistId: string,
  supabase: SupabaseServerClient
): Promise<ArtistLinkRouting | null> {
  const { data } = await supabase
    .from('artist_link_routing')
    .select('*')
    .eq('artist_id', artistId)
    .maybeSingle<ArtistLinkRouting>();
  return data;
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

export type ArtistCard = {
  profileId: string;
  fullName: string;
  city: string | null;
  state: string | null;
  stageName: string | null;
  category: string | null;
  mercados: string | null;
  ratingAverage: number | null;
  ratingCount: number;
};

async function fetchArtistCards(
  profileIds: string[],
  supabase: SupabaseServerClient
): Promise<ArtistCard[]> {
  if (profileIds.length === 0) return [];

  const [{ data: profiles }, { data: artistProfiles }, ratings] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, city, state')
      .in('id', profileIds)
      .returns<Pick<Profile, 'id' | 'full_name' | 'city' | 'state'>[]>(),
    supabase
      .from('artist_profiles')
      .select('profile_id, stage_name, category, mercados')
      .in('profile_id', profileIds)
      .returns<{ profile_id: string; stage_name: string | null; category: string | null; mercados: string | null }[]>(),
    getRatingsFor(profileIds, supabase),
  ]);

  const artistByProfileId = new Map((artistProfiles ?? []).map((a) => [a.profile_id, a]));
  return (profiles ?? []).map((p) => {
    const a = artistByProfileId.get(p.id);
    const rating = ratings.get(p.id);
    return {
      profileId: p.id,
      fullName: p.full_name,
      city: p.city,
      state: p.state,
      stageName: a?.stage_name ?? null,
      category: a?.category ?? null,
      mercados: a?.mercados ?? null,
      ratingAverage: rating?.average ?? null,
      ratingCount: rating?.count ?? 0,
    };
  });
}

export async function getRepresentedArtistCards(
  bookerId: string,
  supabase: SupabaseServerClient
): Promise<ArtistCard[]> {
  const { data: reps } = await supabase
    .from('representations')
    .select('artist_profile_id')
    .eq('booker_profile_id', bookerId)
    .returns<{ artist_profile_id: string }[]>();

  return fetchArtistCards((reps ?? []).map((r) => r.artist_profile_id), supabase);
}

// Espelha getArtistBookerRelationships — usado na seção "Meus Artistas"
// (relação ativa) do painel do booker.
export type ArtistRelationshipCard = ArtistCard & {
  relationshipSince: string;
  ongoingCount: number;
};

export async function getBookerArtistRelationships(
  bookerId: string,
  supabase: SupabaseServerClient
): Promise<ArtistRelationshipCard[]> {
  const { data: reps } = await supabase
    .from('representations')
    .select('artist_profile_id, created_at')
    .eq('booker_profile_id', bookerId)
    .returns<{ artist_profile_id: string; created_at: string }[]>();

  if (!reps || reps.length === 0) return [];
  const artistIds = reps.map((r) => r.artist_profile_id);

  const [cards, { data: bookings }] = await Promise.all([
    fetchArtistCards(artistIds, supabase),
    supabase
      .from('bookings')
      .select('artist_profile_id, status')
      .eq('booker_profile_id', bookerId)
      .in('artist_profile_id', artistIds)
      .returns<{ artist_profile_id: string; status: BookingStatus }[]>(),
  ]);

  const sinceById = new Map(reps.map((r) => [r.artist_profile_id, r.created_at]));
  const ongoingById = new Map<string, number>();
  for (const b of bookings ?? []) {
    if (!ONGOING_BOOKING_STATUSES.includes(b.status)) continue;
    ongoingById.set(b.artist_profile_id, (ongoingById.get(b.artist_profile_id) ?? 0) + 1);
  }

  return cards.map((c) => ({
    ...c,
    relationshipSince: sinceById.get(c.profileId) ?? '',
    ongoingCount: ongoingById.get(c.profileId) ?? 0,
  }));
}

export async function getDiscoverArtists(
  excludeIds: string[],
  supabase: SupabaseServerClient,
  limit = 12
): Promise<ArtistCard[]> {
  let query = supabase
    .from('artist_profiles')
    .select('profile_id')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (excludeIds.length > 0) {
    query = query.not('profile_id', 'in', `(${excludeIds.join(',')})`);
  }
  const { data } = await query.returns<{ profile_id: string }[]>();
  return fetchArtistCards((data ?? []).map((d) => d.profile_id), supabase);
}

// Bloco 4.5 — booker pede pra representar artista novo. `status` de
// pendentes vencidas só reflete a realidade depois de rodar o sweep
// (expire_stale_representation_requests) — chamamos antes de listar,
// exatamente como o contrato semântico documentado na auditoria pede.
export async function getRepresentationRequestStatus(
  bookerId: string,
  artistId: string,
  supabase: SupabaseServerClient
): Promise<RepresentationRequest | null> {
  await supabase.rpc('expire_stale_representation_requests');
  const { data } = await supabase
    .from('representation_requests')
    .select('*')
    .eq('booker_profile_id', bookerId)
    .eq('artist_profile_id', artistId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<RepresentationRequest>();
  return data;
}

export async function getRepresentationRequestStatusesFor(
  bookerId: string,
  artistIds: string[],
  supabase: SupabaseServerClient
): Promise<Map<string, RepresentationRequestStatus>> {
  if (artistIds.length === 0) return new Map();
  await supabase.rpc('expire_stale_representation_requests');
  const { data } = await supabase
    .from('representation_requests')
    .select('artist_profile_id, status, created_at')
    .eq('booker_profile_id', bookerId)
    .in('artist_profile_id', artistIds)
    .order('created_at', { ascending: false })
    .returns<{ artist_profile_id: string; status: RepresentationRequestStatus; created_at: string }[]>();

  const byArtist = new Map<string, RepresentationRequestStatus>();
  for (const r of data ?? []) {
    if (!byArtist.has(r.artist_profile_id)) byArtist.set(r.artist_profile_id, r.status);
  }
  return byArtist;
}

// Card completo do booker que pediu representação — o artista precisa
// entender quem está pedindo antes de aceitar, não só o nome (Bloco 4).
export type RequestBookerCard = {
  profileId: string;
  fullName: string;
  avatarUrl: string | null;
  bio: string | null;
  city: string | null;
  state: string | null;
  specialtyAreas: string[];
  artistCategories: string[];
  ratingAverage: number | null;
  ratingCount: number;
  isOfficial: boolean;
};

export type IncomingRepresentationRequest = RepresentationRequest & {
  bookerName: string;
  booker: RequestBookerCard;
};

export async function getIncomingRepresentationRequests(
  artistId: string,
  supabase: SupabaseServerClient
): Promise<IncomingRepresentationRequest[]> {
  await supabase.rpc('expire_stale_representation_requests');
  const { data: requests } = await supabase
    .from('representation_requests')
    .select('*')
    .eq('artist_profile_id', artistId)
    .eq('status', 'pendente')
    .order('created_at', { ascending: false })
    .returns<RepresentationRequest[]>();

  if (!requests || requests.length === 0) return [];

  const bookerIds = requests.map((r) => r.booker_profile_id);
  const [{ data: profiles }, { data: bookerProfiles }, ratings] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, avatar_url, city, state')
      .in('id', bookerIds)
      .returns<Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'city' | 'state'>[]>(),
    supabase
      .from('booker_profiles')
      .select('profile_id, bio, specialty_areas, artist_categories')
      .in('profile_id', bookerIds)
      .returns<
        { profile_id: string; bio: string | null; specialty_areas: string[]; artist_categories: string[] }[]
      >(),
    getRatingsFor(bookerIds, supabase),
  ]);

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const bookerById = new Map((bookerProfiles ?? []).map((b) => [b.profile_id, b]));

  return requests.map((r) => {
    const p = profileById.get(r.booker_profile_id);
    const b = bookerById.get(r.booker_profile_id);
    const rating = ratings.get(r.booker_profile_id);
    const fullName = p?.full_name ?? 'Alguém';
    return {
      ...r,
      bookerName: fullName,
      booker: {
        profileId: r.booker_profile_id,
        fullName,
        avatarUrl: p?.avatar_url ?? null,
        bio: b?.bio ?? null,
        city: p?.city ?? null,
        state: p?.state ?? null,
        specialtyAreas: b?.specialty_areas ?? [],
        artistCategories: b?.artist_categories ?? [],
        ratingAverage: rating?.average ?? null,
        ratingCount: rating?.count ?? 0,
        // Critérios de Booker Oficial (getOfficialBookerProgress) incluem
        // dois itens sempre falsos hoje (Pro, identidade verificada) — o
        // selo nunca é atingível ainda, então fica honesto em vez de
        // fingir uma condição que não existe de verdade no produto.
        isOfficial: false,
      },
    };
  });
}

export async function getOutgoingPendingRequestCount(
  bookerId: string,
  supabase: SupabaseServerClient
): Promise<number> {
  await supabase.rpc('expire_stale_representation_requests');
  const { count } = await supabase
    .from('representation_requests')
    .select('id', { count: 'exact', head: true })
    .eq('booker_profile_id', bookerId)
    .eq('status', 'pendente');
  return count ?? 0;
}

// Espelha getIncomingRepresentationRequests — pedidos de representação que
// este booker enviou e ainda estão pendentes de resposta do artista.
export type OutgoingRepresentationRequest = RepresentationRequest & { artist: ArtistCard };

export async function getOutgoingRepresentationRequests(
  bookerId: string,
  supabase: SupabaseServerClient
): Promise<OutgoingRepresentationRequest[]> {
  await supabase.rpc('expire_stale_representation_requests');
  const { data: requests } = await supabase
    .from('representation_requests')
    .select('*')
    .eq('booker_profile_id', bookerId)
    .eq('status', 'pendente')
    .order('created_at', { ascending: false })
    .returns<RepresentationRequest[]>();

  if (!requests || requests.length === 0) return [];

  const artistCards = await fetchArtistCards(
    requests.map((r) => r.artist_profile_id),
    supabase
  );
  const artistById = new Map(artistCards.map((a) => [a.profileId, a]));

  return requests
    .filter((r) => artistById.has(r.artist_profile_id))
    .map((r) => ({ ...r, artist: artistById.get(r.artist_profile_id)! }));
}

export type OpportunityWithArtist = Opportunity & {
  artistName: string;
  myInterestStatus: OpportunityInterestStatus | null;
  myInvitationStatus: OpportunityInvitationStatus | null;
};

// Mural do booker: RLS de `opportunities` já resolve o que é visível (aberta
// com distribution_mode aberto, ou onde o booker foi convidado) — aqui só
// filtramos as descartadas e anexamos o status pessoal do booker em cada uma
// (interesse registrado / convite recebido), pra a tela saber qual ação
// mostrar sem o booker precisar adivinhar.
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
    .in('status', ['aberta', 'em_distribuicao', 'interesse_recebido'])
    .order('created_at', { ascending: false });
  if (dismissedIds.length > 0) {
    query = query.not('id', 'in', `(${dismissedIds.join(',')})`);
  }
  const { data: opportunities } = await query.returns<Opportunity[]>();
  if (!opportunities || opportunities.length === 0) return [];

  const opportunityIds = opportunities.map((o) => o.id);
  const artistIds = [...new Set(opportunities.map((o) => o.artist_profile_id))];
  const [{ data: artists }, { data: myInterests }, { data: myInvitations }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', artistIds)
      .returns<Pick<Profile, 'id' | 'full_name'>[]>(),
    supabase
      .from('opportunity_interests')
      .select('opportunity_id, status')
      .eq('booker_profile_id', bookerId)
      .in('opportunity_id', opportunityIds)
      .returns<{ opportunity_id: string; status: OpportunityInterestStatus }[]>(),
    supabase
      .from('opportunity_invitations')
      .select('opportunity_id, status')
      .eq('booker_profile_id', bookerId)
      .in('opportunity_id', opportunityIds)
      .returns<{ opportunity_id: string; status: OpportunityInvitationStatus }[]>(),
  ]);

  const nameById = new Map((artists ?? []).map((p) => [p.id, p.full_name]));
  const interestByOpp = new Map((myInterests ?? []).map((i) => [i.opportunity_id, i.status]));
  const invitationByOpp = new Map((myInvitations ?? []).map((i) => [i.opportunity_id, i.status]));

  return opportunities.map((o) => ({
    ...o,
    artistName: nameById.get(o.artist_profile_id) ?? 'Artista',
    myInterestStatus: interestByOpp.get(o.id) ?? null,
    myInvitationStatus: invitationByOpp.get(o.id) ?? null,
  }));
}

export async function getMyOpportunities(
  artistId: string,
  supabase: SupabaseServerClient
): Promise<Opportunity[]> {
  const { data } = await supabase
    .from('opportunities')
    .select('*')
    .eq('artist_profile_id', artistId)
    .order('created_at', { ascending: false })
    .returns<Opportunity[]>();
  return data ?? [];
}

export type OpportunityManageDetail = {
  opportunity: Opportunity;
  interests: (OpportunityInterest & { bookerName: string; ratingAverage: number | null; ratingCount: number })[];
  invitations: (OpportunityInvitation & { bookerName: string })[];
  invitableBookers: BookerCard[];
  hasAnyBookers: boolean;
};

// Tela de gestão do artista dono da oportunidade: quem se interessou (modo
// aberto), quem foi convidado e como respondeu, e quem dos bookers que ele
// já representa ainda pode ser convidado (só faz sentido convidar de novo
// quem ainda não tem convite/interesse registrado).
export async function getOpportunityManageDetail(
  opportunityId: string,
  artistId: string,
  supabase: SupabaseServerClient
): Promise<OpportunityManageDetail | null> {
  const { data: opportunity } = await supabase
    .from('opportunities')
    .select('*')
    .eq('id', opportunityId)
    .eq('artist_profile_id', artistId)
    .maybeSingle<Opportunity>();
  if (!opportunity) return null;

  const [{ data: interests }, { data: invitations }, myBookers] = await Promise.all([
    supabase
      .from('opportunity_interests')
      .select('*')
      .eq('opportunity_id', opportunityId)
      .eq('status', 'pendente')
      .returns<OpportunityInterest[]>(),
    supabase
      .from('opportunity_invitations')
      .select('*')
      .eq('opportunity_id', opportunityId)
      .order('created_at', { ascending: false })
      .returns<OpportunityInvitation[]>(),
    getArtistBookers(artistId, supabase),
  ]);

  const involvedIds = new Set([
    ...(interests ?? []).map((i) => i.booker_profile_id),
    ...(invitations ?? []).map((i) => i.booker_profile_id),
  ]);
  const ratings = await getRatingsFor((interests ?? []).map((i) => i.booker_profile_id), supabase);

  const bookerIds = [
    ...new Set([...(interests ?? []).map((i) => i.booker_profile_id), ...(invitations ?? []).map((i) => i.booker_profile_id)]),
  ];
  const { data: bookerProfiles } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', bookerIds.length > 0 ? bookerIds : ['00000000-0000-0000-0000-000000000000'])
    .returns<Pick<Profile, 'id' | 'full_name'>[]>();
  const nameById = new Map((bookerProfiles ?? []).map((p) => [p.id, p.full_name]));

  return {
    opportunity,
    interests: (interests ?? []).map((i) => ({
      ...i,
      bookerName: nameById.get(i.booker_profile_id) ?? 'Booker',
      ratingAverage: ratings.get(i.booker_profile_id)?.average ?? null,
      ratingCount: ratings.get(i.booker_profile_id)?.count ?? 0,
    })),
    invitations: (invitations ?? []).map((i) => ({
      ...i,
      bookerName: nameById.get(i.booker_profile_id) ?? 'Booker',
    })),
    invitableBookers: myBookers.filter((b) => !involvedIds.has(b.profileId)),
    hasAnyBookers: myBookers.length > 0,
  };
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

export async function getPendingReviewsToWrite(
  userId: string,
  supabase: SupabaseServerClient
): Promise<Review[]> {
  const { data } = await supabase
    .from('reviews')
    .select('*')
    .eq('reviewer_profile_id', userId)
    .eq('status', 'pendente')
    .order('created_at', { ascending: false })
    .returns<Review[]>();
  return data ?? [];
}

// As duas linhas de avaliação de um booking: a que eu escrevo sobre a
// contraparte (myReview) e a que a contraparte escreve sobre mim
// (reviewOfMe) — nasceram juntas quando o booking concluiu (ver migration
// 0017, trigger create_pending_reviews).
export async function getBookingReviews(
  bookingId: string,
  userId: string,
  supabase: SupabaseServerClient
): Promise<{ myReview: Review | null; reviewOfMe: Review | null }> {
  const { data } = await supabase
    .from('reviews')
    .select('*')
    .eq('booking_id', bookingId)
    .returns<Review[]>();
  const rows = data ?? [];
  return {
    myReview: rows.find((r) => r.reviewer_profile_id === userId) ?? null,
    reviewOfMe: rows.find((r) => r.reviewee_profile_id === userId) ?? null,
  };
}

export type ReviewSummary = {
  average: number | null;
  count: number;
  attributeCounts: { key: string; count: number }[];
};

// Média, contagem e atributos-com-contador de um profile, calculados só a
// partir de avaliações status='ativa' (nunca inclui pendente/removida/
// invalidada). Nenhum desses números é editável pelo usuário.
export async function getReviewSummary(
  profileId: string,
  supabase: SupabaseServerClient
): Promise<ReviewSummary> {
  const { data } = await supabase
    .from('reviews')
    .select('rating, attributes')
    .eq('reviewee_profile_id', profileId)
    .eq('status', 'ativa')
    .returns<{ rating: number | null; attributes: string[] }[]>();

  const rated = (data ?? []).filter((r): r is { rating: number; attributes: string[] } => r.rating != null);
  const count = rated.length;
  const average = count > 0 ? rated.reduce((sum, r) => sum + r.rating, 0) / count : null;

  const attributeCounts = new Map<string, number>();
  for (const r of rated) {
    for (const key of r.attributes ?? []) {
      attributeCounts.set(key, (attributeCounts.get(key) ?? 0) + 1);
    }
  }

  return {
    average,
    count,
    attributeCounts: [...attributeCounts.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count),
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
  totalNegotiatedCents: number;
  totalEarnedCents: number;
  availableToWithdrawCents: number;
  monthEarnedCents: number;
  monthEarnedPrevCents: number;
  activeCount: number;
  awaitingPaymentCount: number;
  acceptanceRatePercent: number;
  acceptedCount: number;
  decidedCount: number;
};

export function computeBookerStats(bookings: Booking[]): BookerStats {
  const confirmed = bookings.filter((b) =>
    ['aceita', 'aguardando_pagamento', 'concluida'].includes(b.status)
  );
  const totalNegotiatedCents = confirmed.reduce(
    (sum, b) => sum + (b.cache_amount_cents ?? 0),
    0
  );

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
    totalNegotiatedCents,
    totalEarnedCents,
    // Igual a totalEarnedCents por enquanto: sem Bloco 2/PSP não existe
    // histórico de saque nem retenção parcial, então "ganho" e
    // "disponível" ainda são o mesmo número. Ficam campos separados de
    // propósito — vão divergir assim que saques parciais existirem.
    availableToWithdrawCents: totalEarnedCents,
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
  totalGrossCents: number;
  netReceivedCents: number;
  availableToWithdrawCents: number;
  monthNetReceivedCents: number;
  closedCount: number;
  activeCount: number;
  awaitingPaymentCount: number;
  avgCommissionPercent: number;
};

export function computeArtistStats(bookings: Booking[]): ArtistStats {
  const confirmed = bookings.filter((b) =>
    ['aceita', 'aguardando_pagamento', 'concluida'].includes(b.status)
  );
  const totalGrossCents = confirmed.reduce((sum, b) => sum + (b.cache_amount_cents ?? 0), 0);

  const concluded = bookings.filter((b) => b.status === 'concluida');
  const netOf = (b: Booking) =>
    (b.cache_amount_cents ?? 0) - commissionCents(b);

  const netReceivedCents = concluded.reduce((sum, b) => sum + netOf(b), 0);
  const monthNetReceivedCents = concluded
    .filter((b) => isThisMonth(b.updated_at))
    .reduce((sum, b) => sum + netOf(b), 0);

  const activeCount = bookings.filter((b) =>
    ['proposta_enviada', 'aceita', 'aguardando_pagamento'].includes(b.status)
  ).length;
  const awaitingPaymentCount = bookings.filter(
    (b) => b.status === 'aguardando_pagamento'
  ).length;

  const recent = [...concluded]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 5);
  const avgCommissionPercent =
    recent.length > 0
      ? recent.reduce((sum, b) => sum + Number(b.commission_percent), 0) / recent.length
      : 0;

  return {
    totalGrossCents,
    netReceivedCents,
    // Igual a netReceivedCents por enquanto — mesmo motivo do booker: sem
    // Bloco 2/PSP não existe saque parcial nem retenção real ainda.
    availableToWithdrawCents: netReceivedCents,
    monthNetReceivedCents,
    closedCount: concluded.length,
    activeCount,
    awaitingPaymentCount,
    avgCommissionPercent,
  };
}

// vermelha: ação pendente/urgente (algo bloqueado, dinheiro parado).
// amarela: requer ação, mas não é urgente (decisão a tomar, sem pressa).
// sem bolinha: informativo — nada exigido do usuário agora.
export type AttentionItemKind = 'urgente' | 'atencao' | 'info';
export type AttentionItem = { text: string; href: string; kind: AttentionItemKind };

export async function getAttentionItems(
  userId: string,
  role: Profile['role'],
  bookings: BookingWithOtherParty[],
  supabase: SupabaseServerClient
): Promise<AttentionItem[]> {
  const items: AttentionItem[] = [];

  const pendingReviews = await getPendingReviewsToWrite(userId, supabase);
  const bookingById = new Map(bookings.map((b) => [b.id, b]));
  for (const review of pendingReviews) {
    const booking = bookingById.get(review.booking_id);
    if (!booking) continue;
    items.push({
      text: `Como foi trabalhar com ${booking.otherPartyName}? Avalie e ajude a construir a reputação da Doopla`,
      href: `/dashboard/bookings/${booking.id}#avaliacao`,
      kind: 'atencao',
    });
  }

  if (role === 'artista') {
    const incomingRequests = await getIncomingRepresentationRequests(userId, supabase);
    for (const req of incomingRequests) {
      items.push({
        text: `${req.bookerName} pediu pra te representar`,
        href: '/dashboard/bookers#solicitacoes',
        kind: 'atencao',
      });
    }
  }

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
        kind: 'info',
      });
    }

    for (const b of bookings.filter((x) => x.status === 'aguardando_pagamento')) {
      items.push({
        text: `${b.otherPartyName}, cliente ainda não pagou, booking fechado ${formatRelativeDate(b.updated_at)}`,
        href: `/dashboard/bookings/${b.id}`,
        kind: 'urgente',
      });
    }
    for (const b of bookings.filter(
      (x) => x.status === 'proposta_enviada' && x.proposed_by === 'booker'
    )) {
      items.push({
        text: `Sua proposta de ${b.commission_percent}% pra ${b.otherPartyName} está aguardando resposta`,
        href: `/dashboard/bookings/${b.id}`,
        kind: 'info',
      });
    }

    const { data: respondedRequests } = await supabase
      .from('representation_requests')
      .select('id, artist_profile_id, status')
      .eq('booker_profile_id', userId)
      .in('status', ['aceita', 'recusada'])
      .is('booker_seen_at', null)
      .returns<{ id: string; artist_profile_id: string; status: string }[]>();
    if (respondedRequests && respondedRequests.length > 0) {
      const artistIds = respondedRequests.map((r) => r.artist_profile_id);
      const { data: artistProfiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', artistIds)
        .returns<Pick<Profile, 'id' | 'full_name'>[]>();
      const artistNameById = new Map((artistProfiles ?? []).map((p) => [p.id, p.full_name]));
      for (const r of respondedRequests) {
        const artistName = artistNameById.get(r.artist_profile_id) ?? 'Um artista';
        items.push({
          text:
            r.status === 'aceita'
              ? `${artistName} aceitou sua solicitação de representação`
              : `${artistName} recusou sua solicitação de representação`,
          href: '/dashboard/artistas',
          kind: 'info',
        });
      }
    }
  } else {
    for (const b of bookings.filter(
      (x) => x.status === 'proposta_enviada' && x.proposed_by !== 'artista'
    )) {
      items.push({
        text: `${b.otherPartyName} propôs ${b.commission_percent}% de comissão`,
        href: `/dashboard/bookings/${b.id}`,
        kind: 'atencao',
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
  { value: 'cancelada', label: 'Cancelados' },
];

export type ContractStatus = 'anexado' | 'sem_contrato';

export function contractStatus(booking: Booking): ContractStatus {
  return booking.contract_url ? 'anexado' : 'sem_contrato';
}

export type BookingContractDetail = {
  contract: BookingContract;
  booking: BookingWithOtherParty;
};

export async function getBookingContract(
  contractId: string,
  userId: string,
  role: Profile['role'],
  supabase: SupabaseServerClient
): Promise<BookingContractDetail | null> {
  const { data: contract } = await supabase
    .from('booking_contracts')
    .select('*')
    .eq('id', contractId)
    .maybeSingle<BookingContract>();
  if (!contract) return null;

  const { data: booking } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', contract.booking_id)
    .maybeSingle<Booking>();
  if (!booking || (userId !== booking.artist_profile_id && userId !== booking.booker_profile_id)) {
    return null;
  }

  const [withName] = await attachOtherPartyNames([booking], role, supabase);
  return { contract, booking: withName };
}

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

export type ReferralWithName = Referral & { referredName: string };

export type ReferralSummary = {
  referralCode: string;
  referrals: ReferralWithName[];
  qualifiedTotalCents: number;
  pendingCount: number;
};

// "Indique. Ganhe R$5." — qualifiedTotalCents só soma linhas já
// 'qualificada'. Hoje isso é sempre 0: não existe nenhum caminho
// automático pra qualificar uma indicação (ver migration 0020) até o
// sistema de assinatura existir de verdade. Nada aqui inventa valor.
export async function getReferralSummary(
  userId: string,
  referralCode: string,
  supabase: SupabaseServerClient
): Promise<ReferralSummary> {
  const { data: referrals } = await supabase
    .from('referrals')
    .select('*')
    .eq('referrer_profile_id', userId)
    .order('created_at', { ascending: false })
    .returns<Referral[]>();

  const rows = referrals ?? [];
  const { data: referred } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', rows.length > 0 ? rows.map((r) => r.referred_profile_id) : ['00000000-0000-0000-0000-000000000000'])
    .returns<Pick<Profile, 'id' | 'full_name'>[]>();
  const nameById = new Map((referred ?? []).map((p) => [p.id, p.full_name]));

  return {
    referralCode,
    referrals: rows.map((r) => ({ ...r, referredName: nameById.get(r.referred_profile_id) ?? 'Alguém' })),
    qualifiedTotalCents: rows
      .filter((r) => r.status === 'qualificada')
      .reduce((sum, r) => sum + r.bonus_cents, 0),
    pendingCount: rows.filter((r) => r.status === 'pendente').length,
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
  bookingId?: string;
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
      kind: 'confirmado' as const,
      title: b.description || `Trabalho com ${b.otherPartyName}`,
      sub: role === 'booker' ? `Artista: ${b.otherPartyName}` : `Booker: ${b.otherPartyName}`,
      bookingId: b.id,
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
