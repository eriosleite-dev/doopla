'use server';

import { createClient } from '@/lib/supabase/server';

export async function submitOrcamentoRequestAction(
  _prevState: { error?: string; success?: boolean },
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const slug = String(formData.get('slug') ?? '').trim();
  const clientName = String(formData.get('clientName') ?? '').trim();
  const clientContact = String(formData.get('clientContact') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const eventDate = String(formData.get('eventDate') ?? '').trim();
  const location = String(formData.get('location') ?? '').trim();
  const offeredReais = String(formData.get('offeredAmount') ?? '').trim();

  if (!slug) return { error: 'Link inválido.' };
  if (!clientName) return { error: 'Informe seu nome.' };
  if (!clientContact) return { error: 'Informe um jeito de te responder (telefone ou e-mail).' };

  const offeredCents = offeredReais
    ? Math.round(Number.parseFloat(offeredReais.replace(',', '.')) * 100)
    : null;
  if (offeredReais && !Number.isFinite(offeredCents)) {
    return { error: 'Valor ofertado inválido.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('submit_orcamento_request', {
    p_artist_slug: slug,
    p_description: description,
    p_client_name: clientName,
    p_client_contact: clientContact,
    p_event_date: eventDate || null,
    p_location: location || null,
    p_offered_cents: offeredCents,
  });

  if (error) {
    if (error.message.includes('artist_not_found')) {
      return { error: 'Não foi possível encontrar esse artista.' };
    }
    return { error: 'Não foi possível enviar sua solicitação agora. Tente de novo em instantes.' };
  }

  return { success: true };
}
