import { supabase } from '@/lib/supabase';
import type { Referral } from '@/types/referral';

export type ReferralWithName = Referral & { referredName: string };

export type ReferralSummary = {
  referralCode: string;
  referrals: ReferralWithName[];
  qualifiedTotalCents: number;
  pendingCount: number;
};

// Portado 1:1 de src/app/dashboard/data.ts (getReferralSummary) —
// mesma query/cálculo, sem métrica nova ("assinantes ativos" não
// existe no backend, nunca inventar aqui).
export async function fetchReferralSummary(userId: string, referralCode: string): Promise<ReferralSummary> {
  const { data: referrals, error } = await supabase
    .from('referrals')
    .select('*')
    .eq('referrer_profile_id', userId)
    .order('created_at', { ascending: false })
    .returns<Referral[]>();
  if (error) throw error;

  const rows = referrals ?? [];
  const referredIds = rows.length > 0 ? rows.map((r) => r.referred_profile_id) : ['00000000-0000-0000-0000-000000000000'];
  const { data: referred } = await supabase.from('profiles').select('id, full_name').in('id', referredIds);
  const nameById = new Map((referred ?? []).map((p: { id: string; full_name: string }) => [p.id, p.full_name]));

  return {
    referralCode,
    referrals: rows.map((r) => ({ ...r, referredName: nameById.get(r.referred_profile_id) ?? 'Alguém' })),
    qualifiedTotalCents: rows.filter((r) => r.status === 'qualificada').reduce((sum, r) => sum + r.bonus_cents, 0),
    pendingCount: rows.filter((r) => r.status === 'pendente').length,
  };
}
