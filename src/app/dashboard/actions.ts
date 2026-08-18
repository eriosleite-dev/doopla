'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import type { Booking, Invite, Opportunity, Profile, Review } from '@/lib/supabase/types';
import { buildContractContent, CONTRACT_TEMPLATE_VERSION } from './contratos/template';

const REVIEW_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

// Vínculo artista↔booker: fonte única de verdade é a tabela
// `representations`. Todo caminho que cria/altera essa relação (aceite de
// solicitação, confirmação de convite) precisa invalidar TODAS as rotas
// que leem a relação — nunca só a tela onde a ação aconteceu. É a causa
// raiz dos bugs "aceitei mas sumiu daqui" / "/orçamento diz que não tenho
// booker": a ação escrevia certo no banco, só não avisava as outras
// páginas que o cache delas estava desatualizado.
function revalidateRelationshipPaths(artistId: string, bookerId: string) {
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/perfil');
  revalidatePath('/dashboard/bookers');
  revalidatePath('/dashboard/artistas');
  revalidatePath('/dashboard/propor');
  revalidatePath(`/dashboard/bookers/${bookerId}`);
  revalidatePath(`/dashboard/artistas/${artistId}`);
}

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

  // Convite é bidirecional: booker convidando artista (fluxo original) ou
  // artista convidando booker ("Traga sua dupla pra doopla"). A direção
  // da representations nasce do papel de quem convidou, não é fixa.
  const [{ data: inviterProfile }, { data: confirmingProfile }] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', invite.inviter_profile_id).single<{ role: string }>(),
    supabase.from('profiles').select('role').eq('id', user.id).single<{ role: string }>(),
  ]);
  if (!inviterProfile || !confirmingProfile) return;

  let artistProfileId: string;
  let bookerProfileId: string;
  if (inviterProfile.role === 'booker' && confirmingProfile.role === 'artista') {
    artistProfileId = user.id;
    bookerProfileId = invite.inviter_profile_id;
  } else if (
    inviterProfile.role === 'artista' &&
    (confirmingProfile.role === 'booker' || confirmingProfile.role === 'agencia')
  ) {
    artistProfileId = invite.inviter_profile_id;
    bookerProfileId = user.id;
  } else {
    // Combinação de papéis que não faz sentido pra virar representação
    // (ex.: dois artistas). Convite fica pendente, não confirma sozinho.
    return;
  }

  const { error: repError } = await supabase.from('representations').insert({
    artist_profile_id: artistProfileId,
    booker_profile_id: bookerProfileId,
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

  revalidateRelationshipPaths(artistProfileId, bookerProfileId);
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

  const paymentMode = String(formData.get('paymentMode') ?? 'integral_apos_trabalho');
  const depositPercentage = Number.parseFloat(
    String(formData.get('depositPercentage') ?? '').replace(',', '.')
  );
  const remainingDueRule = String(formData.get('remainingDueRule') ?? '').trim();
  const clientCancellationDepositRefundable = formData.get('clientCancellationDepositRefundable') === 'on';
  const artistCancellationDepositRefundable = formData.get('artistCancellationDepositRefundable') === 'on';

  if (!artistProfileId) return { error: 'Selecione um artista.' };
  if (!Number.isFinite(commissionPercent) || commissionPercent < 0 || commissionPercent > 100) {
    return { error: 'Informe uma comissão válida (0 a 100%).' };
  }
  if (paymentMode !== 'integral_apos_trabalho' && paymentMode !== 'sinal_saldo') {
    return { error: 'Forma de pagamento inválida.' };
  }
  if (
    paymentMode === 'sinal_saldo' &&
    (!Number.isFinite(depositPercentage) || depositPercentage <= 0 || depositPercentage >= 100)
  ) {
    return { error: 'Informe um percentual de sinal válido (entre 0 e 100).' };
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
      payment_mode: paymentMode as 'integral_apos_trabalho' | 'sinal_saldo',
      deposit_percentage: paymentMode === 'sinal_saldo' ? depositPercentage : null,
      remaining_percentage: paymentMode === 'sinal_saldo' ? 100 - depositPercentage : null,
      remaining_due_rule: paymentMode === 'sinal_saldo' ? remainingDueRule || null : null,
      client_cancellation_deposit_refundable: clientCancellationDepositRefundable,
      artist_cancellation_deposit_refundable: artistCancellationDepositRefundable,
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

  if (decision === 'aceitar' && formData.get('cancellationAccepted') !== 'on') return;

  const newStatus = decision === 'aceitar' ? 'aceita' : 'recusada';
  await supabase
    .from('bookings')
    .update(
      decision === 'aceitar'
        ? {
            status: newStatus,
            cancellation_terms_accepted_at: new Date().toISOString(),
            cancellation_terms_accepted_by: user.id,
          }
        : { status: newStatus }
    )
    .eq('id', bookingId);
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
  const paymentDueAt = String(formData.get('paymentDueAt') ?? '').trim();
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
    .update({
      status: 'aguardando_pagamento',
      payment_due_at: paymentDueAt ? new Date(paymentDueAt).toISOString() : null,
    })
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

const CANCELLABLE_STATUSES: Booking['status'][] = ['aceita', 'aguardando_pagamento'];

export async function cancelBookingAction(
  _prevState: { error?: string },
  formData: FormData
): Promise<{ error?: string }> {
  const bookingId = String(formData.get('bookingId') ?? '');
  const initiator = String(formData.get('initiator') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();
  if (!bookingId) return { error: 'Booking inválido.' };
  if (initiator !== 'cliente' && initiator !== 'artista') {
    return { error: 'Informe quem está cancelando.' };
  }

  const ctx = await requireUserAndProfile();
  if (!ctx) return { error: 'Sessão expirada. Entre novamente.' };
  const { supabase, user, profile } = ctx;
  if (profile.role !== 'artista') {
    return { error: 'Só o artista pode cancelar um booking confirmado.' };
  }

  const { data: booking } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .single<Booking>();
  if (!booking || !CANCELLABLE_STATUSES.includes(booking.status)) {
    return { error: 'Esse booking não pode mais ser cancelado por aqui.' };
  }
  if (user.id !== booking.artist_profile_id) {
    return { error: 'Você não faz parte desse booking.' };
  }

  await supabase
    .from('bookings')
    .update({
      status: 'cancelada',
      cancelled_at: new Date().toISOString(),
      cancelled_by: user.id,
      cancellation_initiator: initiator as 'cliente' | 'artista',
      cancellation_reason: reason || null,
    })
    .eq('id', bookingId);
  await supabase.from('booking_events').insert({
    booking_id: bookingId,
    actor_profile_id: user.id,
    event_type: 'cancelada',
    note: reason || null,
  });

  revalidatePath(`/dashboard/bookings/${bookingId}`);
  revalidatePath('/dashboard');
  return {};
}

const RESCHEDULABLE_STATUSES: Booking['status'][] = ['aceita', 'aguardando_pagamento'];

function applyReschedule(booking: Booking, newDate: string, acceptedBy: string) {
  return {
    original_event_date: booking.original_event_date ?? booking.event_date,
    event_date: newDate,
    rescheduled_event_date: newDate,
    rescheduled_at: new Date().toISOString(),
    reschedule_accepted_by: acceptedBy,
    reschedule_proposed_date: null,
    reschedule_proposed_by: null,
  };
}

export async function proposeRescheduleAction(
  _prevState: { error?: string },
  formData: FormData
): Promise<{ error?: string }> {
  const bookingId = String(formData.get('bookingId') ?? '');
  const newDate = String(formData.get('newDate') ?? '').trim();
  if (!bookingId || !newDate) return { error: 'Informe a nova data.' };

  const ctx = await requireUserAndProfile();
  if (!ctx) return { error: 'Sessão expirada. Entre novamente.' };
  const { supabase, user, profile } = ctx;

  const { data: booking } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .single<Booking>();
  if (!booking || !RESCHEDULABLE_STATUSES.includes(booking.status)) {
    return { error: 'Esse booking não pode ser remarcado agora.' };
  }
  if (user.id !== booking.artist_profile_id && user.id !== booking.booker_profile_id) {
    return { error: 'Você não faz parte desse booking.' };
  }
  if (newDate === booking.event_date) return { error: 'Essa já é a data atual.' };

  // Remarcação precisa ser aceita pelo artista (regra do documento). Se
  // quem propõe já é o artista, a mudança vale na hora — não faz sentido
  // pedir aprovação da própria pessoa que tem a palavra final.
  if (profile.role === 'artista') {
    await supabase
      .from('bookings')
      .update(applyReschedule(booking, newDate, user.id))
      .eq('id', bookingId);
    await supabase.from('booking_events').insert({
      booking_id: bookingId,
      actor_profile_id: user.id,
      event_type: 'remarcacao_aceita',
      note: newDate,
    });
  } else {
    await supabase
      .from('bookings')
      .update({ reschedule_proposed_date: newDate, reschedule_proposed_by: user.id })
      .eq('id', bookingId);
    await supabase.from('booking_events').insert({
      booking_id: bookingId,
      actor_profile_id: user.id,
      event_type: 'remarcacao_proposta',
      note: newDate,
    });
  }

  revalidatePath(`/dashboard/bookings/${bookingId}`);
  revalidatePath('/dashboard');
  return {};
}

export async function respondRescheduleAction(formData: FormData) {
  const bookingId = String(formData.get('bookingId') ?? '');
  const decision = String(formData.get('decision') ?? '');
  if (!bookingId || (decision !== 'aceitar' && decision !== 'recusar')) return;

  const ctx = await requireUserAndProfile();
  if (!ctx) return;
  const { supabase, user, profile } = ctx;
  if (profile.role !== 'artista') return; // só o artista aceita remarcação

  const { data: booking } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .single<Booking>();
  if (!booking || !booking.reschedule_proposed_date) return;
  if (user.id !== booking.artist_profile_id) return;

  if (decision === 'aceitar') {
    await supabase
      .from('bookings')
      .update(applyReschedule(booking, booking.reschedule_proposed_date, user.id))
      .eq('id', bookingId);
    await supabase.from('booking_events').insert({
      booking_id: bookingId,
      actor_profile_id: user.id,
      event_type: 'remarcacao_aceita',
      note: booking.reschedule_proposed_date,
    });
  } else {
    await supabase
      .from('bookings')
      .update({ reschedule_proposed_date: null, reschedule_proposed_by: null })
      .eq('id', bookingId);
    await supabase.from('booking_events').insert({
      booking_id: bookingId,
      actor_profile_id: user.id,
      event_type: 'remarcacao_recusada',
    });
  }

  revalidatePath(`/dashboard/bookings/${bookingId}`);
  revalidatePath('/dashboard');
}

export async function markInCollectionAction(formData: FormData) {
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
  if (!booking || booking.status !== 'aguardando_pagamento' || !booking.payment_due_at) return;
  if (user.id !== booking.booker_profile_id) return;
  if (new Date(booking.payment_due_at).getTime() > Date.now()) return; // ainda não venceu

  await supabase
    .from('bookings')
    .update({ payment_collection_started_at: new Date().toISOString() })
    .eq('id', bookingId);
  await supabase.from('booking_events').insert({
    booking_id: bookingId,
    actor_profile_id: user.id,
    event_type: 'em_cobranca',
  });

  revalidatePath(`/dashboard/bookings/${bookingId}`);
  revalidatePath('/dashboard');
}

export async function markDisputeAction(formData: FormData) {
  const bookingId = String(formData.get('bookingId') ?? '');
  const disputeStatus = String(formData.get('disputeStatus') ?? '');
  if (!bookingId || (disputeStatus !== 'em_disputa' && disputeStatus !== 'chargeback')) return;

  const ctx = await requireUserAndProfile();
  if (!ctx) return;
  const { supabase, user, profile } = ctx;
  if (profile.role !== 'booker') return;

  const { data: booking } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .single<Booking>();
  if (!booking || !['aguardando_pagamento', 'concluida'].includes(booking.status)) return;
  if (user.id !== booking.booker_profile_id) return;

  await supabase
    .from('bookings')
    .update({
      dispute_status: disputeStatus as 'em_disputa' | 'chargeback',
      dispute_opened_at: new Date().toISOString(),
    })
    .eq('id', bookingId);
  await supabase.from('booking_events').insert({
    booking_id: bookingId,
    actor_profile_id: user.id,
    event_type: disputeStatus === 'em_disputa' ? 'disputa_aberta' : 'chargeback_aberto',
  });

  revalidatePath(`/dashboard/bookings/${bookingId}`);
  revalidatePath('/dashboard');
}

const DISTRIBUTION_MODES = ['meus_bookers', 'novos_bookers', 'ambos'] as const;

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
  const distributionMode = String(formData.get('distributionMode') ?? 'ambos');
  const category = String(formData.get('category') ?? '').trim();
  const location = String(formData.get('location') ?? '').trim();
  const eventDate = String(formData.get('eventDate') ?? '').trim();

  if (!description) return { error: 'Descreva o trabalho.' };
  if (!Number.isFinite(commissionPercent) || commissionPercent < 0 || commissionPercent > 100) {
    return { error: 'Informe uma comissão válida (0 a 100%).' };
  }
  if (!DISTRIBUTION_MODES.includes(distributionMode as (typeof DISTRIBUTION_MODES)[number])) {
    return { error: 'Escolha pra quem essa oportunidade vai.' };
  }

  const { data: opportunity, error } = await supabase
    .from('opportunities')
    .insert({
      artist_profile_id: user.id,
      description,
      commission_percent: commissionPercent,
      cache_amount_cents: cacheAmountCents,
      distribution_mode: distributionMode as Opportunity['distribution_mode'],
      category: category || null,
      location: location || null,
      event_date: eventDate || null,
    })
    .select('id')
    .single<{ id: string }>();
  if (error || !opportunity) return { error: 'Não foi possível publicar o trabalho.' };

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/oportunidades');
  redirect(`/dashboard/oportunidades/${opportunity.id}`);
}

export async function expressInterestAction(formData: FormData) {
  const opportunityId = String(formData.get('opportunityId') ?? '');
  if (!opportunityId) return;
  const ctx = await requireUserAndProfile();
  if (!ctx) return;
  const { supabase, user, profile } = ctx;
  if (profile.role !== 'booker') return;

  await supabase
    .from('opportunity_interests')
    .insert({ opportunity_id: opportunityId, booker_profile_id: user.id });

  revalidatePath('/dashboard/oportunidades');
}

export async function withdrawInterestAction(formData: FormData) {
  const opportunityId = String(formData.get('opportunityId') ?? '');
  if (!opportunityId) return;
  const ctx = await requireUserAndProfile();
  if (!ctx) return;
  const { supabase, user } = ctx;

  await supabase
    .from('opportunity_interests')
    .delete()
    .eq('opportunity_id', opportunityId)
    .eq('booker_profile_id', user.id);

  revalidatePath('/dashboard/oportunidades');
}

export async function declineInvitationAction(formData: FormData) {
  const opportunityId = String(formData.get('opportunityId') ?? '');
  if (!opportunityId) return;
  const ctx = await requireUserAndProfile();
  if (!ctx) return;
  const { supabase, user } = ctx;

  await supabase
    .from('opportunity_invitations')
    .update({ status: 'recusada' })
    .eq('opportunity_id', opportunityId)
    .eq('booker_profile_id', user.id)
    .eq('status', 'pendente');

  revalidatePath('/dashboard/oportunidades');
}

export async function inviteBookerToOpportunityAction(formData: FormData) {
  const opportunityId = String(formData.get('opportunityId') ?? '');
  const bookerProfileId = String(formData.get('bookerProfileId') ?? '');
  if (!opportunityId || !bookerProfileId) return;
  const ctx = await requireUserAndProfile();
  if (!ctx) return;
  const { supabase, profile } = ctx;
  if (profile.role !== 'artista') return;

  await supabase
    .from('opportunity_invitations')
    .insert({ opportunity_id: opportunityId, booker_profile_id: bookerProfileId });

  revalidatePath(`/dashboard/oportunidades/${opportunityId}`);
}

export async function selectBookerForOpportunityAction(
  _prevState: { error?: string },
  formData: FormData
): Promise<{ error?: string }> {
  const opportunityId = String(formData.get('opportunityId') ?? '');
  const bookerProfileId = String(formData.get('bookerProfileId') ?? '');
  if (!opportunityId || !bookerProfileId) return { error: 'Dados inválidos.' };

  const ctx = await requireUserAndProfile();
  if (!ctx) return { error: 'Sessão expirada. Entre novamente.' };
  const { supabase, user, profile } = ctx;
  if (profile.role !== 'artista') return { error: 'Só o artista dono pode escolher um booker.' };

  const { data: current } = await supabase
    .from('opportunities')
    .select('commission_percent')
    .eq('id', opportunityId)
    .single<{ commission_percent: number | null }>();

  let commissionPercent = current?.commission_percent ?? null;
  if (commissionPercent == null) {
    const submitted = Number.parseFloat(
      String(formData.get('commissionPercent') ?? '').replace(',', '.')
    );
    if (!Number.isFinite(submitted) || submitted < 0 || submitted > 100) {
      return { error: 'Essa oportunidade ainda não tem comissão negociada. Informe uma comissão (0 a 100%).' };
    }
    commissionPercent = submitted;
  }

  const { data: selected, error: rpcError } = await supabase.rpc('select_booker_for_opportunity', {
    p_opportunity_id: opportunityId,
    p_booker_profile_id: bookerProfileId,
  });

  if (rpcError || !selected) {
    if (rpcError?.message.includes('opportunity_already_filled')) {
      return { error: 'Essa oportunidade já foi encerrada com outro booker.' };
    }
    return { error: 'Não foi possível escolher esse booker agora.' };
  }

  const opportunity = selected as Opportunity;

  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .insert({
      artist_profile_id: user.id,
      booker_profile_id: bookerProfileId,
      proposed_by: 'artista',
      commission_percent: commissionPercent,
      cache_amount_cents: opportunity.cache_amount_cents,
      description: opportunity.description,
    })
    .select('id')
    .single<{ id: string }>();
  if (bookingError || !booking) return { error: 'Booker escolhido, mas não foi possível criar o booking.' };

  await supabase.from('booking_events').insert({
    booking_id: booking.id,
    actor_profile_id: user.id,
    event_type: 'proposta_enviada',
    commission_percent: commissionPercent,
    note: 'A partir de uma oportunidade publicada.',
  });

  revalidatePath('/dashboard/oportunidades');
  revalidatePath('/dashboard');
  redirect(`/dashboard/bookings/${booking.id}`);
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

export async function markRepresentationsSeenAction() {
  const ctx = await requireUserAndProfile();
  if (!ctx) return;
  const { supabase, user, profile } = ctx;
  if (profile.role !== 'booker') return;

  await supabase
    .from('representation_requests')
    .update({ booker_seen_at: new Date().toISOString() })
    .eq('booker_profile_id', user.id)
    .in('status', ['aceita', 'recusada'])
    .is('booker_seen_at', null);

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

export async function uploadAvatarAction(
  _prevState: { error?: string },
  formData: FormData
): Promise<{ error?: string }> {
  const file = formData.get('avatar');
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Selecione uma foto.' };
  }
  if (file.size > 4 * 1024 * 1024) {
    return { error: 'A foto precisa ter até 4MB.' };
  }

  const ctx = await requireUserAndProfile();
  if (!ctx) return { error: 'Sessão expirada. Entre novamente.' };
  const { supabase, user } = ctx;

  const path = `${user.id}/avatar.jpg`;
  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true, contentType: 'image/jpeg' });
  if (uploadError) return { error: 'Não foi possível salvar a foto.' };

  const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(path);
  const avatarUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

  await supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('id', user.id);

  revalidatePath('/dashboard/perfil');
  revalidatePath('/dashboard');
  return {};
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

// Nunca gerar um slug igual a uma rota real do site.
const RESERVED_SLUGS = new Set([
  'ajuda',
  'auth',
  'cadastro',
  'dashboard',
  'login',
  'precos',
  'privacidade',
  'seguranca',
  'sobre',
  'termos',
  'api',
]);

export async function enablePublicProfileAction() {
  const ctx = await requireUserAndProfile();
  if (!ctx) return;
  const { supabase, user, profile } = ctx;
  if (profile.role !== 'artista') return;

  if (!profile.slug) {
    const { data: artist } = await supabase
      .from('artist_profiles')
      .select('stage_name')
      .eq('profile_id', user.id)
      .single<{ stage_name: string | null }>();

    let base = slugify(artist?.stage_name || profile.full_name || 'artista') || 'artista';
    if (RESERVED_SLUGS.has(base)) base = `${base}-artista`;
    let slug = base;
    for (let attempt = 0; attempt < 20; attempt++) {
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('slug', slug)
        .maybeSingle<{ id: string }>();
      if (!existing && !RESERVED_SLUGS.has(slug)) break;
      slug = `${base}-${Math.floor(Math.random() * 10000)}`;
    }
    await supabase.from('profiles').update({ slug }).eq('id', user.id);
  }

  await supabase
    .from('artist_profiles')
    .update({ public_enabled: true })
    .eq('profile_id', user.id);

  revalidatePath('/dashboard/perfil');
  revalidatePath('/dashboard');
}

export async function disablePublicProfileAction() {
  const ctx = await requireUserAndProfile();
  if (!ctx) return;
  const { supabase, user, profile } = ctx;
  if (profile.role !== 'artista') return;

  await supabase
    .from('artist_profiles')
    .update({ public_enabled: false })
    .eq('profile_id', user.id);

  revalidatePath('/dashboard/perfil');
  revalidatePath('/dashboard');
}

export async function updatePublicLinksAction(
  _prevState: { error?: string },
  formData: FormData
): Promise<{ error?: string }> {
  const instagramUrl = String(formData.get('instagramUrl') ?? '').trim();
  const portfolioUrl = String(formData.get('portfolioUrl') ?? '').trim();

  const ctx = await requireUserAndProfile();
  if (!ctx) return { error: 'Sessão expirada. Entre novamente.' };
  const { supabase, user, profile } = ctx;
  if (profile.role !== 'artista') return { error: 'Só artistas têm perfil público.' };

  await supabase
    .from('artist_profiles')
    .update({
      instagram_url: instagramUrl || null,
      portfolio_url: portfolioUrl || null,
    })
    .eq('profile_id', user.id);

  revalidatePath('/dashboard/perfil');
  return {};
}

export async function updateArtistProfileAction(
  _prevState: { error?: string },
  formData: FormData
): Promise<{ error?: string }> {
  const ctx = await requireUserAndProfile();
  if (!ctx) return { error: 'Sessão expirada. Entre novamente.' };
  const { supabase, user, profile } = ctx;
  if (profile.role !== 'artista') return { error: 'Só artistas têm esse perfil.' };

  const stageName = String(formData.get('stageName') ?? '').trim();
  const category = String(formData.get('category') ?? '').trim();
  const subcategory = String(formData.get('subcategory') ?? '').trim();
  const bio = String(formData.get('bio') ?? '').trim();
  const genresRaw = String(formData.get('genres') ?? '').trim();
  const mercados = String(formData.get('mercados') ?? '').trim();
  const websiteUrl = String(formData.get('websiteUrl') ?? '').trim();
  const otherLinks = String(formData.get('otherLinks') ?? '').trim();
  const otherPreferences = String(formData.get('otherPreferences') ?? '').trim();
  const travels = formData.get('travels') === 'on';
  const servesOtherLocations = formData.get('servesOtherLocations') === 'on';
  const acceptsOutOfCityWork = formData.get('acceptsOutOfCityWork') === 'on';
  const careerStage = String(formData.get('careerStage') ?? '').trim();
  const feeRange = String(formData.get('feeRange') ?? '').trim();
  const workTypes = formData.getAll('workTypes').map(String).filter(Boolean);
  const clientTypes = formData.getAll('clientTypes').map(String).filter(Boolean);
  const regions = formData.getAll('regions').map(String).filter(Boolean);
  const languages = formData.getAll('languages').map(String).filter(Boolean);
  const helpAreas = formData.getAll('helpAreas').map(String).filter(Boolean);

  const genres = genresRaw
    ? genresRaw.split(',').map((g) => g.trim()).filter(Boolean)
    : [];

  await supabase
    .from('artist_profiles')
    .update({
      stage_name: stageName || null,
      category: category || null,
      subcategory: subcategory || null,
      bio: bio || null,
      genres,
      mercados: mercados || null,
      website_url: websiteUrl || null,
      other_links: otherLinks || null,
      other_preferences: otherPreferences || null,
      travels,
      serves_other_locations: servesOtherLocations,
      accepts_out_of_city_work: acceptsOutOfCityWork,
      career_stage: careerStage || null,
      fee_range: feeRange || null,
      work_types: workTypes,
      client_types: clientTypes,
      regions,
      languages,
      help_areas: helpAreas,
    })
    .eq('profile_id', user.id);

  revalidatePath('/dashboard/perfil');
  revalidatePath('/dashboard');
  return {};
}

export async function updateBookerProfileAction(
  _prevState: { error?: string },
  formData: FormData
): Promise<{ error?: string }> {
  const ctx = await requireUserAndProfile();
  if (!ctx) return { error: 'Sessão expirada. Entre novamente.' };
  const { supabase, user, profile } = ctx;
  if (profile.role !== 'booker') return { error: 'Só bookers têm esse perfil.' };

  const professionalName = String(formData.get('professionalName') ?? '').trim();
  const bio = String(formData.get('bio') ?? '').trim();
  const mercados = String(formData.get('mercados') ?? '').trim();
  const experience = String(formData.get('experience') ?? '').trim();
  const instagramUrl = String(formData.get('instagramUrl') ?? '').trim();
  const websiteUrl = String(formData.get('websiteUrl') ?? '').trim();
  const capacity = String(formData.get('capacity') ?? '').trim();
  const feeRange = formData.getAll('feeRange').map(String).filter(Boolean);
  const commissionRange = String(formData.get('commissionRange') ?? '').trim();
  const artistCategories = formData.getAll('artistCategories').map(String).filter(Boolean);
  const clientTypes = formData.getAll('clientTypes').map(String).filter(Boolean);
  const regions = formData.getAll('regions').map(String).filter(Boolean);
  const languages = formData.getAll('languages').map(String).filter(Boolean);
  const specialtyAreas = formData.getAll('specialtyAreas').map(String).filter(Boolean);

  await supabase
    .from('booker_profiles')
    .update({
      professional_name: professionalName || null,
      bio: bio || null,
      mercados: mercados || null,
      experience: experience || null,
      instagram_url: instagramUrl || null,
      website_url: websiteUrl || null,
      capacity: capacity || null,
      fee_range: feeRange,
      commission_range: commissionRange || null,
      artist_categories: artistCategories,
      client_types: clientTypes,
      regions,
      languages,
      specialty_areas: specialtyAreas,
    })
    .eq('profile_id', user.id);

  revalidatePath('/dashboard/perfil');
  revalidatePath('/dashboard');
  return {};
}

export async function updateLinkRoutingAction(
  _prevState: { error?: string },
  formData: FormData
): Promise<{ error?: string }> {
  const mode = String(formData.get('mode') ?? 'eu');
  const bookerId = String(formData.get('bookerId') ?? '').trim() || null;

  if (!['eu', 'meu_booker', 'eu_e_meu_booker'].includes(mode)) {
    return { error: 'Opção inválida.' };
  }

  const ctx = await requireUserAndProfile();
  if (!ctx) return { error: 'Sessão expirada. Entre novamente.' };
  const { supabase, user, profile } = ctx;
  if (profile.role !== 'artista') return { error: 'Só artistas configuram o link de orçamento.' };

  if (mode !== 'eu') {
    if (!bookerId) return { error: 'Escolha um booker da sua rede.' };
    const { data: rep } = await supabase
      .from('representations')
      .select('id')
      .eq('artist_profile_id', user.id)
      .eq('booker_profile_id', bookerId)
      .maybeSingle<{ id: string }>();
    if (!rep) return { error: 'Você só pode escolher um booker que já representa você.' };
  }

  const { error } = await supabase.from('artist_link_routing').upsert(
    {
      artist_id: user.id,
      mode: mode as 'eu' | 'meu_booker' | 'eu_e_meu_booker',
      booker_id: mode === 'eu' ? null : bookerId,
    },
    { onConflict: 'artist_id' }
  );
  if (error) return { error: 'Não foi possível salvar o roteamento.' };

  revalidatePath('/dashboard/perfil');
  revalidatePath('/dashboard');
  return {};
}

export async function inviteArtistAction(
  _prevState: { error?: string; success?: boolean },
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const name = String(formData.get('name') ?? '').trim();
  const contact = String(formData.get('contact') ?? '').trim();
  if (!name) return { error: 'Informe o nome do artista.' };

  const ctx = await requireUserAndProfile();
  if (!ctx) return { error: 'Sessão expirada. Entre novamente.' };
  const { supabase, user, profile } = ctx;
  if (profile.role !== 'booker') return { error: 'Só bookers convidam artistas.' };

  const { error } = await supabase.from('invites').insert({
    inviter_profile_id: user.id,
    invitee_name: name,
    invitee_contact: contact || null,
  });
  if (error) return { error: 'Não foi possível enviar o convite agora.' };

  revalidatePath('/dashboard/artistas');
  return { success: true };
}

export async function inviteBookerAction(
  _prevState: { error?: string; success?: boolean },
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const name = String(formData.get('name') ?? '').trim();
  const contact = String(formData.get('contact') ?? '').trim();
  if (!name) return { error: 'Informe o nome do booker.' };

  const ctx = await requireUserAndProfile();
  if (!ctx) return { error: 'Sessão expirada. Entre novamente.' };
  const { supabase, user, profile } = ctx;
  if (profile.role !== 'artista') return { error: 'Só artistas convidam bookers.' };

  const { error } = await supabase.from('invites').insert({
    inviter_profile_id: user.id,
    invitee_name: name,
    invitee_contact: contact || null,
  });
  if (error) return { error: 'Não foi possível enviar o convite agora.' };

  revalidatePath('/dashboard/bookers');
  return { success: true };
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

export async function generateContractAction(
  _prevState: { error?: string },
  formData: FormData
): Promise<{ error?: string }> {
  const bookingId = String(formData.get('bookingId') ?? '');
  const clientName = String(formData.get('clientName') ?? '').trim();
  const clientDocument = String(formData.get('clientDocument') ?? '').trim();
  const eventLocation = String(formData.get('eventLocation') ?? '').trim();
  const eventDate = String(formData.get('eventDate') ?? '').trim();

  if (!bookingId) return { error: 'Booking inválido.' };
  if (!clientName) return { error: 'Informe o nome do contratante.' };
  if (!eventDate) return { error: 'Informe a data do evento.' };

  const ctx = await requireUserAndProfile();
  if (!ctx) return { error: 'Sessão expirada. Entre novamente.' };
  const { supabase, user } = ctx;

  const { data: booking } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .single<Booking>();
  if (!booking || (user.id !== booking.artist_profile_id && user.id !== booking.booker_profile_id)) {
    return { error: 'Você não faz parte desse booking.' };
  }

  const { data: updatedBooking, error: updateError } = await supabase
    .from('bookings')
    .update({
      client_name: clientName,
      client_document: clientDocument || null,
      event_location: eventLocation || null,
      event_date: eventDate,
    })
    .eq('id', bookingId)
    .select('*')
    .single<Booking>();
  if (updateError || !updatedBooking) return { error: 'Não foi possível salvar os dados do evento.' };

  const [{ data: artist }, { data: booker }] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name')
      .eq('id', updatedBooking.artist_profile_id)
      .single<Pick<Profile, 'full_name'>>(),
    supabase
      .from('profiles')
      .select('full_name')
      .eq('id', updatedBooking.booker_profile_id)
      .single<Pick<Profile, 'full_name'>>(),
  ]);
  if (!artist || !booker) return { error: 'Não foi possível montar o contrato.' };

  const content = buildContractContent(updatedBooking, artist, booker);

  const { data: contract, error: contractError } = await supabase
    .from('booking_contracts')
    .insert({
      booking_id: bookingId,
      template_version: CONTRACT_TEMPLATE_VERSION,
      generated_by_profile_id: user.id,
      content,
    })
    .select('id')
    .single<{ id: string }>();
  if (contractError || !contract) return { error: 'Não foi possível gerar o contrato.' };

  const contractUrl = `/dashboard/contratos/documento/${contract.id}`;
  await supabase.from('bookings').update({ contract_url: contractUrl }).eq('id', bookingId);

  revalidatePath('/dashboard/contratos');
  revalidatePath(`/dashboard/bookings/${bookingId}`);
  redirect(contractUrl);
}

export async function requestRepresentationAction(
  _prevState: { error?: string },
  formData: FormData
): Promise<{ error?: string }> {
  const artistProfileId = String(formData.get('artistProfileId') ?? '');
  const message = String(formData.get('message') ?? '').trim();
  if (!artistProfileId) return { error: 'Artista não encontrado.' };

  const ctx = await requireUserAndProfile();
  if (!ctx) return { error: 'Sessão expirada. Entre novamente.' };
  const { supabase, user, profile } = ctx;
  if (profile.role !== 'booker') return { error: 'Só bookers podem pedir pra representar um artista.' };

  const { error } = await supabase.from('representation_requests').insert({
    booker_profile_id: user.id,
    artist_profile_id: artistProfileId,
    message: message || null,
  });

  if (error) {
    if (error.message.includes('representation_request_limit_reached')) {
      return {
        error: 'Você atingiu o limite de solicitações pendentes. Espere alguma ser respondida.',
      };
    }
    if (error.code === '23505') {
      return { error: 'Você já tem uma solicitação pendente pra esse artista.' };
    }
    return { error: 'Não foi possível enviar a solicitação.' };
  }

  revalidatePath('/dashboard/artistas');
  return {};
}

export async function respondRepresentationRequestAction(formData: FormData) {
  const requestId = String(formData.get('requestId') ?? '');
  const decision = String(formData.get('decision') ?? '');
  if (!requestId || (decision !== 'aceitar' && decision !== 'recusar')) return;

  const ctx = await requireUserAndProfile();
  if (!ctx) return;
  const { supabase, user } = ctx;

  const { data: request } = await supabase
    .from('representation_requests')
    .select('*')
    .eq('id', requestId)
    .single<{ artist_profile_id: string; booker_profile_id: string; status: string }>();
  if (!request || request.artist_profile_id !== user.id || request.status !== 'pendente') return;

  await supabase
    .from('representation_requests')
    .update({ status: decision === 'aceitar' ? 'aceita' : 'recusada' })
    .eq('id', requestId);

  revalidateRelationshipPaths(request.artist_profile_id, request.booker_profile_id);
}

export async function submitReviewAction(
  _prevState: { error?: string },
  formData: FormData
): Promise<{ error?: string }> {
  const reviewId = String(formData.get('reviewId') ?? '');
  const rating = Number.parseInt(String(formData.get('rating') ?? ''), 10);
  const attributes = formData.getAll('attributes').map(String);
  const comment = String(formData.get('comment') ?? '').trim().slice(0, 400);

  if (!reviewId) return { error: 'Avaliação não encontrada.' };
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { error: 'Escolha uma nota de 1 a 5 estrelas.' };
  }

  const ctx = await requireUserAndProfile();
  if (!ctx) return { error: 'Sessão expirada. Entre novamente.' };
  const { supabase, user } = ctx;

  const { data: review } = await supabase
    .from('reviews')
    .select('*')
    .eq('id', reviewId)
    .single<Review>();
  if (!review || review.reviewer_profile_id !== user.id) {
    return { error: 'Você não pode enviar essa avaliação.' };
  }
  if (review.status !== 'pendente' && review.status !== 'ativa') {
    return { error: 'Essa avaliação não está mais disponível pra edição.' };
  }
  if (review.submitted_at) {
    const editableUntil = new Date(review.submitted_at).getTime() + REVIEW_EDIT_WINDOW_MS;
    if (Date.now() > editableUntil) {
      return { error: 'A janela de 24h pra editar essa avaliação já encerrou.' };
    }
  }

  const now = new Date().toISOString();
  await supabase
    .from('reviews')
    .update({
      rating,
      attributes,
      comment: comment || null,
      status: 'ativa',
      submitted_at: review.submitted_at ?? now,
      edited_at: review.submitted_at ? now : null,
    })
    .eq('id', reviewId);

  revalidatePath(`/dashboard/bookings/${review.booking_id}`);
  revalidatePath('/dashboard');
  return {};
}

export async function requestReviewAction(formData: FormData) {
  const reviewId = String(formData.get('reviewId') ?? '');
  if (!reviewId) return;

  const ctx = await requireUserAndProfile();
  if (!ctx) return;
  const { supabase, user } = ctx;

  const { data: review } = await supabase
    .from('reviews')
    .select('*')
    .eq('id', reviewId)
    .single<Review>();
  if (!review || review.reviewee_profile_id !== user.id) return;
  if (review.status !== 'pendente' || review.requested_at) return;

  await supabase.from('reviews').update({ requested_at: new Date().toISOString() }).eq('id', reviewId);

  revalidatePath(`/dashboard/bookings/${review.booking_id}`);
}

export async function contestReviewAction(formData: FormData) {
  const reviewId = String(formData.get('reviewId') ?? '');
  if (!reviewId) return;

  const ctx = await requireUserAndProfile();
  if (!ctx) return;
  const { supabase, user } = ctx;

  const { data: review } = await supabase
    .from('reviews')
    .select('*')
    .eq('id', reviewId)
    .single<Review>();
  if (!review || review.reviewee_profile_id !== user.id || review.status !== 'ativa') return;

  await supabase.from('reviews').update({ contested: true }).eq('id', reviewId);

  revalidatePath(`/dashboard/bookings/${review.booking_id}`);
}

// Favoritar não tem relação nenhuma com representations/bookings — é só
// uma lista salva, sem regra de negócio por trás.
export async function toggleFavoriteAction(
  targetId: string,
  favorite: boolean
): Promise<{ ok: boolean }> {
  const ctx = await requireUserAndProfile();
  if (!ctx) return { ok: false };
  const { supabase, user } = ctx;
  if (!targetId || targetId === user.id) return { ok: false };

  if (favorite) {
    const { error } = await supabase
      .from('favorites')
      .upsert({ user_id: user.id, favorited_user_id: targetId }, { onConflict: 'user_id,favorited_user_id' });
    if (error) return { ok: false };
  } else {
    const { error } = await supabase
      .from('favorites')
      .delete()
      .eq('user_id', user.id)
      .eq('favorited_user_id', targetId);
    if (error) return { ok: false };
  }

  revalidatePath('/dashboard/bookers');
  revalidatePath('/dashboard/artistas');
  revalidatePath(`/dashboard/bookers/${targetId}`);
  revalidatePath(`/dashboard/artistas/${targetId}`);
  return { ok: true };
}
