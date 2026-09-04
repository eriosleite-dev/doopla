import type { SupabaseClient } from '@supabase/supabase-js';

// Professional Product UI — Foundation. Boundary tipado sobre
// get_professional_home_facts() (migration 0067) — a ÚNICA fonte dos
// fatos objetivamente contáveis da futura Home (Web+App). Nunca
// recomputa nada aqui: este arquivo só chama a RPC e mapeia
// snake_case -> camelCase, mesmo padrão de src/lib/conversations/data.ts.
//
// Não inclui "Precisa de você" completo (getAttentionItems continua
// em src/app/dashboard/data.ts) — gap registrado, não escondido, ver
// PROGRESS.md.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any>;

export type ProfessionalHomeFacts = {
  professionalId: string;
  fullName: string;
  accountCreatedAt: string;
  whatsappIdentityStatus: string | null;
  whatsappVerifiedNumber: string | null;
  bookingsAwaitingResponseCount: number;
  bookingsConfirmedCount: number;
  bookingsCompletedCount: number;
  nextBookingId: string | null;
  nextBookingEventDate: string | null;
  nextBookingOtherPartyName: string | null;
  conversationsNeedingYouCount: number;
  referralTotalCount: number;
  referralQualifiedCount: number;
  subscriptionRole: string | null;
  subscriptionStatus: string | null;
  subscriptionPlan: string | null;
};

type RawHomeFactsRow = {
  professional_id: string;
  full_name: string;
  account_created_at: string;
  whatsapp_identity_status: string | null;
  whatsapp_verified_number: string | null;
  bookings_awaiting_response_count: number;
  bookings_confirmed_count: number;
  bookings_completed_count: number;
  next_booking_id: string | null;
  next_booking_event_date: string | null;
  next_booking_other_party_name: string | null;
  conversations_needing_you_count: number;
  referral_total_count: number;
  referral_qualified_count: number;
  subscription_role: string | null;
  subscription_status: string | null;
  subscription_plan: string | null;
};

function mapHomeFactsRow(row: RawHomeFactsRow): ProfessionalHomeFacts {
  return {
    professionalId: row.professional_id,
    fullName: row.full_name,
    accountCreatedAt: row.account_created_at,
    whatsappIdentityStatus: row.whatsapp_identity_status,
    whatsappVerifiedNumber: row.whatsapp_verified_number,
    bookingsAwaitingResponseCount: row.bookings_awaiting_response_count,
    bookingsConfirmedCount: row.bookings_confirmed_count,
    bookingsCompletedCount: row.bookings_completed_count,
    nextBookingId: row.next_booking_id,
    nextBookingEventDate: row.next_booking_event_date,
    nextBookingOtherPartyName: row.next_booking_other_party_name,
    conversationsNeedingYouCount: row.conversations_needing_you_count,
    referralTotalCount: row.referral_total_count,
    referralQualifiedCount: row.referral_qualified_count,
    subscriptionRole: row.subscription_role,
    subscriptionStatus: row.subscription_status,
    subscriptionPlan: row.subscription_plan,
  };
}

export async function getProfessionalHomeFacts(supabase: AnySupabaseClient): Promise<ProfessionalHomeFacts | null> {
  const { data, error } = await supabase.rpc('get_professional_home_facts').maybeSingle();
  // Achado da review 04/09/2026 ("Home data error"): o erro real do
  // Postgrest era engolido em silêncio aqui — a Home só mostrava a
  // mensagem genérica, sem nenhum rastro em log. Nunca muda o
  // contrato (continua null pro caller, nunca lança), só torna o erro
  // real visível nos logs do servidor (Vercel/Supabase) — não é dado
  // fake, não é UI de erro nova, só observabilidade.
  if (error) {
    console.error('getProfessionalHomeFacts: RPC get_professional_home_facts falhou', error);
    return null;
  }
  if (!data) return null;
  return mapHomeFactsRow(data as RawHomeFactsRow);
}
