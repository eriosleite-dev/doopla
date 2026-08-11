'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import type { Booking, Invite, Opportunity, Profile } from '@/lib/supabase/types';

export async function confirmInviteAction(formData: FormData) {
  const inviteId = String(formData.get('inviteId') ?? '');
  if (!inviteId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: invite } = await supabase
    .from('invites')
    .select('*')
    .eq('id', inviteId)
    .single<Invite>();

  if (
    !invite ||
    invite.invitee_profile_id !== user.id ||
    invite.status !== 'pendente'
  ) {
    return;
  }

  const { error: repError } = await supabase.from('representations').insert({
    artist_profile_id: user.id,
    booker_profile_id: invite.inviter_profile_id,
    created_via_invite_id: invite.id,
  });

  // Se a representação já existir (convite duplicado), segue e confirma
  // o convite do mesmo jeito — o que importa é o estado final.
  if (repError && repError.code !== '23505') {
    return;
  }

  await supabase
    .from('invites')
    .update({ status: 'confirmado', confirmed_at: new Date().toISOString() })
    .eq('id', inviteId);

  revalidatePath('/dashboard');
}

function parseReaisToCents(raw: FormDataEntryValue | null): number | null {
  const trimmed = String(raw ?? '').trim().replace(',', '.');
  if (!trimmed) return null;
  const reais = Number(trimmed);
  if (!Number.isFinite(reais) || reais < 0) return null;
  return Math.round(reais * 100);
}

function parseCommission(raw: FormDataEntryValue | null): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

// "+ Tenho um trabalho" do lado do artista: publica no mural pros bookers.
export async function createOpportunityAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const description = String(formData.get('description') ?? '').trim();
  if (!description) return;
  const cacheAmountCents = parseReaisToCents(formData.get('cacheAmount'));
  const commissionPercent = parseCommission(formData.get('commission'));

  await supabase.from('opportunities').insert({
    artist_profile_id: user.id,
    description,
    cache_amount_cents: cacheAmountCents,
    commission_percent: commissionPercent,
  });

  revalidatePath('/dashboard');
  redirect('/dashboard');
}

// "+ Tenho um trabalho" do lado do booker: proposta direta pra um artista
// que já representa (seções 26-30 — "booker traz um trabalho").
export async function createBookingProposalAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const artistProfileId = String(formData.get('artistProfileId') ?? '');
  const description = String(formData.get('description') ?? '').trim();
  if (!artistProfileId || !description) return;
  const cacheAmountCents = parseReaisToCents(formData.get('cacheAmount'));
  const commissionPercent = parseCommission(formData.get('commission'));

  const { data: booking } = await supabase
    .from('bookings')
    .insert({
      artist_profile_id: artistProfileId,
      booker_profile_id: user.id,
      proposed_by: 'booker',
      commission_percent: commissionPercent,
      cache_amount_cents: cacheAmountCents,
      description,
    })
    .select('id')
    .single<{ id: string }>();
  if (!booking) return;

  await supabase.from('booking_events').insert({
    booking_id: booking.id,
    actor_profile_id: user.id,
    event_type: 'proposta_enviada',
    commission_percent: commissionPercent,
  });

  revalidatePath('/dashboard');
  redirect(`/dashboard/bookings/${booking.id}`);
}

export async function dismissOpportunityAction(formData: FormData) {
  const opportunityId = String(formData.get('opportunityId') ?? '');
  if (!opportunityId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from('opportunity_dismissals').insert({
    opportunity_id: opportunityId,
    booker_profile_id: user.id,
  });

  revalidatePath('/dashboard/trabalhos');
}

// Booker demonstra interesse numa oportunidade do mural. Fica pendente até
// o artista decidir — não fecha a oportunidade ainda (pode ter mais de um
// booker interessado ao mesmo tempo, ver seção "mais de um booker").
export async function claimOpportunityAction(formData: FormData) {
  const opportunityId = String(formData.get('opportunityId') ?? '');
  if (!opportunityId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: opportunity } = await supabase
    .from('opportunities')
    .select('*')
    .eq('id', opportunityId)
    .eq('status', 'aberta')
    .single<Opportunity>();
  if (!opportunity) return;

  const commissionPercent = parseCommission(formData.get('commission'));

  const { data: booking } = await supabase
    .from('bookings')
    .insert({
      artist_profile_id: opportunity.artist_profile_id,
      booker_profile_id: user.id,
      proposed_by: 'booker',
      commission_percent: commissionPercent,
      cache_amount_cents: opportunity.cache_amount_cents,
      description: opportunity.description,
      opportunity_id: opportunity.id,
    })
    .select('id')
    .single<{ id: string }>();
  if (!booking) return;

  await supabase.from('booking_events').insert({
    booking_id: booking.id,
    actor_profile_id: user.id,
    event_type: 'proposta_enviada',
    commission_percent: commissionPercent,
  });

  revalidatePath('/dashboard');
  redirect(`/dashboard/bookings/${booking.id}`);
}

type BookingDecision = 'aceita' | 'recusada' | 'contraproposta';

// Aceitar, recusar ou contrapropor um booking — só quem NÃO fez a última
// proposta pode agir (é a vez do outro lado).
export async function respondToBookingAction(formData: FormData) {
  const bookingId = String(formData.get('bookingId') ?? '');
  const decision = String(formData.get('decision') ?? '') as BookingDecision;
  if (!bookingId || !['aceita', 'recusada', 'contraproposta'].includes(decision)) {
    return;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single<Profile>();
  if (!profile) return;

  const { data: booking } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .single<Booking>();
  if (!booking) return;

  const isParty =
    booking.artist_profile_id === user.id || booking.booker_profile_id === user.id;
  const isMyTurn =
    booking.status === 'proposta_enviada' && booking.proposed_by !== profile.role;
  if (!isParty || !isMyTurn) return;

  if (decision === 'contraproposta') {
    const commissionPercent = parseCommission(formData.get('commission'));
    await supabase
      .from('bookings')
      .update({ commission_percent: commissionPercent, proposed_by: profile.role })
      .eq('id', bookingId);
    await supabase.from('booking_events').insert({
      booking_id: bookingId,
      actor_profile_id: user.id,
      event_type: 'contraproposta',
      commission_percent: commissionPercent,
    });
    revalidatePath(`/dashboard/bookings/${bookingId}`);
    return;
  }

  await supabase.from('bookings').update({ status: decision }).eq('id', bookingId);
  await supabase.from('booking_events').insert({
    booking_id: bookingId,
    actor_profile_id: user.id,
    event_type: decision,
    commission_percent: booking.commission_percent,
  });

  if (decision === 'aceita' && booking.opportunity_id) {
    await supabase
      .from('opportunities')
      .update({ status: 'preenchida' })
      .eq('id', booking.opportunity_id);

    const { data: siblings } = await supabase
      .from('bookings')
      .select('id')
      .eq('opportunity_id', booking.opportunity_id)
      .eq('status', 'proposta_enviada')
      .neq('id', bookingId)
      .returns<{ id: string }[]>();

    for (const sibling of siblings ?? []) {
      await supabase.from('bookings').update({ status: 'recusada' }).eq('id', sibling.id);
      await supabase.from('booking_events').insert({
        booking_id: sibling.id,
        actor_profile_id: user.id,
        event_type: 'recusada',
        note: 'Vaga preenchida por outro booker.',
      });
    }
  }

  revalidatePath(`/dashboard/bookings/${bookingId}`);
  revalidatePath('/dashboard');
}

const NEXT_STATUS: Record<
  string,
  { next: Booking['status']; eventType: string } | undefined
> = {
  aceita: { next: 'aguardando_pagamento', eventType: 'pagamento_confirmado' },
  aguardando_pagamento: { next: 'concluida', eventType: 'concluida' },
};

// Avança o status depois de aceito (trabalho realizado -> pagamento
// confirmado). Sem gateway de pagamento por trás — confirmação manual de
// qualquer uma das partes, igual ao resto do status do booking hoje.
export async function advanceBookingStatusAction(formData: FormData) {
  const bookingId = String(formData.get('bookingId') ?? '');
  if (!bookingId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: booking } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .single<Booking>();
  if (!booking) return;

  const isParty =
    booking.artist_profile_id === user.id || booking.booker_profile_id === user.id;
  const step = NEXT_STATUS[booking.status];
  if (!isParty || !step) return;

  await supabase.from('bookings').update({ status: step.next }).eq('id', bookingId);
  await supabase.from('booking_events').insert({
    booking_id: bookingId,
    actor_profile_id: user.id,
    event_type: step.eventType,
  });

  revalidatePath(`/dashboard/bookings/${bookingId}`);
  revalidatePath('/dashboard');
}
