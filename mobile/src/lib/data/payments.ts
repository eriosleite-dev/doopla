import { supabase } from '@/lib/supabase';
import type { PaymentDetails, PixKeyType } from '@/types/payment';

export async function fetchActivePaymentDetails(profileId: string): Promise<PaymentDetails | null> {
  const { data, error } = await supabase
    .from('payment_details')
    .select('*')
    .eq('profile_id', profileId)
    .eq('status', 'active')
    .maybeSingle<PaymentDetails>();
  if (error) throw error;
  return data;
}

// Único caminho de escrita — RPC security definer, mesma usada pelo
// painel web (nunca insert/update direto na tabela).
export async function setPaymentDetails(params: {
  pixKeyType: PixKeyType;
  pixKey: string;
  holderName: string;
}): Promise<PaymentDetails> {
  const { data, error } = await supabase.rpc('set_payment_details', {
    p_method: 'pix',
    p_pix_key_type: params.pixKeyType,
    p_pix_key: params.pixKey,
    p_holder_name: params.holderName,
  });
  if (error) throw error;
  return data as PaymentDetails;
}

export function maskPixKey(pixKeyType: PixKeyType | null, pixKey: string | null): string {
  if (!pixKey) return '';
  if (pixKeyType === 'email') {
    const [user, domain] = pixKey.split('@');
    if (!domain) return '••••••';
    return `${user.slice(0, 2)}••••@${domain}`;
  }
  if (pixKey.length <= 4) return '••••';
  return `••••••${pixKey.slice(-4)}`;
}
