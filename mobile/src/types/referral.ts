// Espelha referrals (migration 0020). status fica em 'pendente' até
// existir sistema de assinatura real capaz de checar 45-60 dias de
// assinatura ativa — hoje não existe transição automática pra
// 'qualificada' (comentário original da migration).
export type ReferralStatus = 'pendente' | 'qualificada' | 'invalida';

export type Referral = {
  id: string;
  referrer_profile_id: string;
  referred_profile_id: string;
  code: string;
  status: ReferralStatus;
  bonus_cents: number;
  qualified_at: string | null;
  created_at: string;
};
