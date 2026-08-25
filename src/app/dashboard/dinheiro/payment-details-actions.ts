'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import type { PixKeyType } from '@/lib/supabase/types';

const PIX_KEY_TYPES: PixKeyType[] = ['cpf', 'cnpj', 'email', 'telefone', 'aleatoria'];

// Único caminho de escrita do painel — chama set_payment_details()
// (security definer, migration 0046), a mesma function que um futuro
// fluxo de WhatsApp também vai chamar. Nenhuma lógica de negócio
// duplicada aqui, só validação de shape do form antes de ir pro banco.
export async function setPaymentDetailsAction(
  _prevState: { error?: string; success?: boolean },
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const pixKeyType = String(formData.get('pixKeyType') ?? '');
  const pixKey = String(formData.get('pixKey') ?? '').trim();
  const holderName = String(formData.get('holderName') ?? '').trim();

  if (!PIX_KEY_TYPES.includes(pixKeyType as PixKeyType)) {
    return { error: 'Escolha o tipo da sua chave Pix.' };
  }
  if (!pixKey) {
    return { error: 'Informe sua chave Pix.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sessão expirada. Entre novamente.' };

  const { error } = await supabase.rpc('set_payment_details', {
    p_method: 'pix',
    p_pix_key_type: pixKeyType as PixKeyType,
    p_pix_key: pixKey,
    p_holder_name: holderName || null,
  });
  if (error) return { error: 'Não foi possível salvar seus dados de recebimento. Tente novamente.' };

  revalidatePath('/dashboard/dinheiro');
  return { success: true };
}
