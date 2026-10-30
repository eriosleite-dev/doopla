import type { SupabaseClient } from '@supabase/supabase-js';

import { resolveCapabilities } from '../intelligence/actor-context';
import type { ActorContext, MinimalConversation } from '../intelligence/types';

// Doopla Intelligence Core v1 — Runtime: resolução de ActorContext pro
// caminho de sistema. Bloco 1 está congelado — resolveActorContext()
// (actor-context.ts) recusa explicitamente trigger.kind='system'
// ("fica isolado, tipado e explicitamente recusado até um bloco
// futuro decidir o client e o caminho server-side que autoriza um
// disparo de sistema de verdade" — comentário original). Este é esse
// bloco futuro: o Runtime NUNCA chama resolveActorContext, monta o
// ActorContext diretamente, reusando só o tipo e resolveCapabilities()
// (função pura, já existente) — nunca duplica a lista de capabilities.
//
// Autorização real não vem deste arquivo: vem de is_system_caller()
// (migration 0051), verificado dentro de cada RPC que o pipeline
// chama. Este helper só formata o shape que o resto do Core (Blocos
// 2-6) já espera — nunca uma segunda fonte de autoridade.

export async function resolveSystemActorContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  conversationId: string
): Promise<{ ok: true; actorContext: ActorContext; conversation: MinimalConversation } | { ok: false; error: 'conversation_not_found' }> {
  const { data: conversation } = await supabase
    .from('conversations')
    .select(
      'id, represented_professional_id, mandate, status, current_state, conversation_type, external_participant_id, related_opportunity_id, related_booking_id'
    )
    .eq('id', conversationId)
    .maybeSingle<MinimalConversation>();

  if (!conversation) return { ok: false, error: 'conversation_not_found' };

  const actorType = 'system' as const;
  return {
    ok: true,
    actorContext: {
      representedProfessionalId: conversation.represented_professional_id,
      actorType,
      actorProfileId: null,
      capabilities: resolveCapabilities(actorType),
      triggerSource: 'system_job',
    },
    conversation,
  };
}
