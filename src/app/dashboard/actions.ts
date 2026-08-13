'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

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

function centsFromReais(raw: FormDataEntryValue | null): number | null {
  const text = String(raw ?? '').trim().replace(',', '.');
  if (!text) return null;
  const value = Number.parseFloat(text);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

async function requireUserAndProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single<Profile>();
  if (!profile) return null;

  return { supabase, user, profile };
}

export async function proposeBookingAction(
  _prevState: { error?: string },
  formData: FormData
): Promise<{ error?: string }> {
  const ctx = await requireUserAndProfile();
  if (!ctx) return { error: 'Sessão expirada. Entre novamente.' };
  const { supabase, user, profile } = ctx;
  if (profile.role !== 'booker') return { error: 'Só bookers podem propor bookings.' };

  const artistProfileId = String(formData.get('artistProfileId') ?? '');
  const commissionPercent = Number.parseFloat(
    String(formData.get('commissionPercent') ?? '').replace(',', '.')
  );
  const description = String(formData.get('description') ?? '').trim();
  const cacheAmountCents = centsFromReais(formData.get('cacheAmountCents'));
  const eventDate = String(formData.get('eventDate') ?? '').trim();

  if (!artistProfileId) return { error: 'Selecione um artista.' };
  if (!Number.isFinite(commissionPercent) || commissionPercent < 0 || commissionPercent > 100) {
    return { error: 'Informe uma comissão válida (0 a 100%).' };
  }

  const { data: representation } = await supabase
    .from('representations')
    .select('id')
    .eq('artist_profile_id', artistProfileId)
    .eq('booker_profile_id', user.id)
    .maybeSingle<{ id: string }>();
  if (!representation) {
    return { error: 'Você só pode propor bookings pra artistas que já representa.' };
  }

  const { data: booking, error } = await supabase
    .from('bookings')
    .insert({
      artist_profile_id: artistProfileId,
      booker_profile_id: user.id,
      proposed_by: 'booker',
      commission_percent: commissionPercent,
      cache_amount_cents: cacheAmountCents,
      description: description || null,
      event_date: eventDate || null,
    })
    .select('id')
    .single<{ id: string }>();

  if (error || !booking) return { error: 'Não foi possível criar a proposta.' };

  await supabase.from('booking_events').insert({
    booking_id: booking.id,
    actor_profile_id: user.id,
    event_type: 'proposta_enviada',
    commission_percent: commissionPercent,
  });

  revalidatePath('/dashboard');
  redirect(`/dashboard/bookings/${booking.id}`);
}

function proposerProfileId(booking: Booking): string {
  return booking.proposed_by === 'artista'
    ? booking.artist_profile_id
    : booking.booker_profile_id;
}

export async function respondBookingAction(formData: FormData) {
  const bookingId = String(formData.get('bookingId') ?? '');
  const decision = String(formData.get('decision') ?? '');
  if (!bookingId || (decision !== 'aceitar' && decision !== 'recusar')) return;

  const ctx = await requireUserAndProfile();
  if (!ctx) return;
  const { supabase, user } = ctx;

  const { data: booking } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .single<Booking>();
  if (!booking || booking.status !== 'proposta_enviada') return;
  if (user.id !== booking.artist_profile_id && user.id !== booking.booker_profile_id) return;
  if (user.id === proposerProfileId(booking)) return; // quem propôs não responde a si mesmo

  const newStatus = decision === 'aceitar' ? 'aceita' : 'recusada';
  await supabase.from('bookings').update({ status: newStatus }).eq('id', bookingId);
  await supabase.from('booking_events').insert({
    booking_id: bookingId,
    actor_profile_id: user.id,
    event_type: newStatus,
  });

  revalidatePath(`/dashboard/bookings/${bookingId}`);
  revalidatePath('/dashboard');
}

export async function counterBookingAction(
  _prevState: { error?: string },
  formData: FormData
): Promise<{ error?: string }> {
  const bookingId = String(formData.get('bookingId') ?? '');
  const commissionPercent = Number.parseFloat(
    String(formData.get('commissionPercent') ?? '').replace(',', '.')
  );
  if (!bookingId) return { error: 'Booking inválido.' };
  if (!Number.isFinite(commissionPercent) || commissionPercent < 0 || commissionPercent > 100) {
    return { error: 'Informe uma comissão válida (0 a 100%).' };
  }

  const ctx = await requireUserAndProfile();
  if (!ctx) return { error: 'Sessão expirada. Entre novamente.' };
  const { supabase, user, profile } = ctx;

  const { data: booking } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .single<Booking>();
  if (!booking || booking.status !== 'proposta_enviada') {
    return { error: 'Essa proposta não está mais em aberto.' };
  }
  if (user.id !== booking.artist_profile_id && user.id !== booking.booker_profile_id) {
    return { error: 'Você não faz parte desse booking.' };
  }
  if (user.id === proposerProfileId(booking)) {
    return { error: 'Aguarde a resposta da outra parte.' };
  }

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
  revalidatePath('/dashboard');
  return {};
}

export async function markCompletedAction(formData: FormData) {
  const bookingId = String(formData.get('bookingId') ?? '');
  if (!bookingId) return;
  const ctx = await requireUserAndProfile();
  if (!ctx) return;
  const { supabase, user } = ctx;

  const { data: booking } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .single<Booking>();
  if (!booking || booking.status !== 'aceita') return;
  if (user.id !== booking.artist_profile_id && user.id !== booking.booker_profile_id) return;

  await supabase
    .from('bookings')
    .update({ status: 'aguardando_pagamento' })
    .eq('id', bookingId);
  await supabase.from('booking_events').insert({
    booking_id: bookingId,
    actor_profile_id: user.id,
    event_type: 'aguardando_pagamento',
  });

  revalidatePath(`/dashboard/bookings/${bookingId}`);
  revalidatePath('/dashboard');
}

export async function markPaidAction(formData: FormData) {
  const bookingId = String(formData.get('bookingId') ?? '');
  if (!bookingId) return;
  const ctx = await requireUserAndProfile();
  if (!ctx) return;
  const { supabase, user, profile } = ctx;
  if (profile.role !== 'booker') return;

  const { data: booking } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .single<Booking>();
  if (!booking || booking.status !== 'aguardando_pagamento') return;
  if (user.id !== booking.booker_profile_id) return;

  await supabase.from('bookings').update({ status: 'concluida' }).eq('id', bookingId);
  await supabase.from('booking_events').insert({
    booking_id: bookingId,
    actor_profile_id: user.id,
    event_type: 'pagamento_confirmado',
  });

  revalidatePath(`/dashboard/bookings/${bookingId}`);
  revalidatePath('/dashboard');
}

export async function publishOpportunityAction(
  _prevState: { error?: string },
  formData: FormData
): Promise<{ error?: string }> {
  const ctx = await requireUserAndProfile();
  if (!ctx) return { error: 'Sessão expirada. Entre novamente.' };
  const { supabase, user, profile } = ctx;
  if (profile.role !== 'artista') return { error: 'Só artistas podem publicar trabalhos.' };

  const description = String(formData.get('description') ?? '').trim();
  const commissionPercent = Number.parseFloat(
    String(formData.get('commissionPercent') ?? '').replace(',', '.')
  );
  const cacheAmountCents = centsFromReais(formData.get('cacheAmountCents'));

  if (!description) return { error: 'Descreva o trabalho.' };
  if (!Number.isFinite(commissionPercent) || commissionPercent < 0 || commissionPercent > 100) {
    return { error: 'Informe uma comissão válida (0 a 100%).' };
  }

  const { error } = await supabase.from('opportunities').insert({
    artist_profile_id: user.id,
    description,
    commission_percent: commissionPercent,
    cache_amount_cents: cacheAmountCents,
  });
  if (error) return { error: 'Não foi possível publicar o trabalho.' };

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/oportunidades');
  redirect('/dashboard');
}

async function claimOpportunity(
  opportunityId: string,
  commissionPercent: number | null
): Promise<{ error?: string }> {
  const ctx = await requireUserAndProfile();
  if (!ctx) return { error: 'Sessão expirada. Entre novamente.' };
  const { supabase, user, profile } = ctx;
  if (profile.role !== 'booker') return { error: 'Só bookers podem responder oportunidades.' };

  const { data: opportunity } = await supabase
    .from('opportunities')
    .select('*')
    .eq('id', opportunityId)
    .single<Opportunity>();
  if (!opportunity || opportunity.status !== 'aberta') {
    return { error: 'Essa oportunidade não está mais disponível.' };
  }

  const { error: updateError } = await supabase
    .from('opportunities')
    .update({ status: 'preenchida' })
    .eq('id', opportunityId)
    .eq('status', 'aberta');
  if (updateError) return { error: 'Não foi possível assumir essa oportunidade.' };

  const { data: booking, error } = await supabase
    .from('bookings')
    .insert({
      artist_profile_id: opportunity.artist_profile_id,
      booker_profile_id: user.id,
      proposed_by: 'booker',
      commission_percent: commissionPercent ?? opportunity.commission_percent,
      cache_amount_cents: opportunity.cache_amount_cents,
      description: opportunity.description,
    })
    .select('id')
    .single<{ id: string }>();

  if (error || !booking) return { error: 'Não foi possível criar o booking.' };

  await supabase.from('booking_events').insert({
    booking_id: booking.id,
    actor_profile_id: user.id,
    event_type: 'proposta_enviada',
    commission_percent: commissionPercent ?? opportunity.commission_percent,
    note: 'A partir de uma oportunidade do mural.',
  });

  revalidatePath('/dashboard/oportunidades');
  revalidatePath('/dashboard');
  return {};
}

export async function acceptOpportunityAction(formData: FormData) {
  const opportunityId = String(formData.get('opportunityId') ?? '');
  if (!opportunityId) return;
  const result = await claimOpportunity(opportunityId, null);
  if (!result.error) redirect('/dashboard');
}

export async function counterOpportunityAction(
  _prevState: { error?: string },
  formData: FormData
): Promise<{ error?: string }> {
  const opportunityId = String(formData.get('opportunityId') ?? '');
  const commissionPercent = Number.parseFloat(
    String(formData.get('commissionPercent') ?? '').replace(',', '.')
  );
  if (!opportunityId) return { error: 'Oportunidade inválida.' };
  if (!Number.isFinite(commissionPercent) || commissionPercent < 0 || commissionPercent > 100) {
    return { error: 'Informe uma comissão válida (0 a 100%).' };
  }
  return claimOpportunity(opportunityId, commissionPercent);
}

export async function dismissOpportunityAction(formData: FormData) {
  const opportunityId = String(formData.get('opportunityId') ?? '');
  if (!opportunityId) return;
  const ctx = await requireUserAndProfile();
  if (!ctx) return;
  const { supabase, user, profile } = ctx;
  if (profile.role !== 'booker') return;

  await supabase
    .from('opportunity_dismissals')
    .insert({ opportunity_id: opportunityId, booker_profile_id: user.id });

  revalidatePath('/dashboard/oportunidades');
  revalidatePath('/dashboard');
}

export async function markOpportunitiesSeenAction() {
  const ctx = await requireUserAndProfile();
  if (!ctx) return;
  const { supabase, user, profile } = ctx;
  if (profile.role !== 'booker') return;

  await supabase
    .from('booker_profiles')
    .update({ opportunities_seen_at: new Date().toISOString() })
    .eq('profile_id', user.id);

  revalidatePath('/dashboard');
}

export async function addAvailabilityAction(formData: FormData) {
  const date = String(formData.get('date') ?? '').trim();
  if (!date) return;
  const ctx = await requireUserAndProfile();
  if (!ctx) return;
  const { supabase, user, profile } = ctx;
  if (profile.role !== 'artista') return;

  await supabase
    .from('artist_availability')
    .insert({ artist_profile_id: user.id, available_date: date });

  revalidatePath('/dashboard/agenda');
}

export async function removeAvailabilityAction(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  const ctx = await requireUserAndProfile();
  if (!ctx) return;
  const { supabase, user } = ctx;

  await supabase.from('artist_availability').delete().eq('id', id).eq('artist_profile_id', user.id);

  revalidatePath('/dashboard/agenda');
}

export async function requestPayoutAction(
  _prevState: { error?: string },
  formData: FormData
): Promise<{ error?: string }> {
  const amountCents = centsFromReais(formData.get('amount'));
  if (!amountCents || amountCents <= 0) {
    return { error: 'Informe um valor válido.' };
  }

  const ctx = await requireUserAndProfile();
  if (!ctx) return { error: 'Sessão expirada. Entre novamente.' };
  const { supabase, user } = ctx;

  const availableCents = Number(formData.get('availableCents') ?? '0');
  if (amountCents > availableCents) {
    return { error: 'O valor solicitado é maior do que o disponível para saque.' };
  }

  await supabase
    .from('payout_requests')
    .insert({ profile_id: user.id, amount_cents: amountCents });

  revalidatePath('/dashboard/dinheiro');
  revalidatePath('/dashboard');
  return {};
}

export async function setContractUrlAction(
  _prevState: { error?: string },
  formData: FormData
): Promise<{ error?: string }> {
  const bookingId = String(formData.get('bookingId') ?? '');
  const contractUrl = String(formData.get('contractUrl') ?? '').trim();
  if (!bookingId || !contractUrl) return { error: 'Cole o link do contrato.' };
  if (!/^https?:\/\//.test(contractUrl)) {
    return { error: 'O link precisa começar com http:// ou https://' };
  }

  const ctx = await requireUserAndProfile();
  if (!ctx) return { error: 'Sessão expirada. Entre novamente.' };
  const { supabase, user } = ctx;

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, artist_profile_id, booker_profile_id')
    .eq('id', bookingId)
    .single<{ id: string; artist_profile_id: string; booker_profile_id: string }>();
  if (!booking || (user.id !== booking.artist_profile_id && user.id !== booking.booker_profile_id)) {
    return { error: 'Você não faz parte desse booking.' };
  }

  await supabase.from('bookings').update({ contract_url: contractUrl }).eq('id', bookingId);

  revalidatePath('/dashboard/contratos');
  revalidatePath(`/dashboard/bookings/${bookingId}`);
  return {};
}
