import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/supabase/types';
import type { ActorContextResult, ActorTrigger, ActorType, Capability, MinimalConversation } from './types';

// Doopla Intelligence Core v1 — resolução de ActorContext.
//
// Regra central (ajuste final exigido antes de implementar o Bloco 1):
// o Orchestrator nunca recebe um ActorContext pronto. Todo chamador só
// entrega um ActorTrigger mínimo (autenticado ou sistema); é esta
// função — e só ela — que decide represented_professional_id/
// actor_type/actor_profile_id/capabilities. Nenhum parâmetro deste
// arquivo é lido de volta de uma declaração do chamador ou do model.
//
// v1: um usuário autenticado só pode operar como ator quando ELE
// PRÓPRIO é o profissional representado da conversa. 'system' só
// funciona por um caminho explicitamente autorizado no servidor (não
// existe esse caminho real ainda neste bloco — ver comentário abaixo).
// 'authorized_collaborator' fica no tipo, sem nenhum código que o
// autorize (prepara o Booker Pro futuro sem abrir uma porta de
// spoofing de identidade agora).

// Assinatura deliberadamente só de actorType por enquanto — nenhum
// código hoje precisa de mais que isso, porque só 'professional'/
// 'system' têm caminho real (ver resolveActorContext). Mas esta função
// é o único lugar que decide "o que este ator pode ler" — quando o
// Booker Pro existir, 'authorized_collaborator' vai precisar de uma
// autorização REAL (consulta a representations/booker_profiles: este
// actorProfileId está autorizado para ESTE representedProfessionalId?
// com que capabilities, possivelmente um subconjunto negociado) — não
// de um valor fixo por actorType. Isso é uma evolução desta mesma
// função (ganhar representedProfessionalId/actorProfileId como
// parâmetros e consultar uma fonte de verdade real), nunca um segundo
// mecanismo de capabilities paralelo. As duas capabilities de
// Professional Intelligence Context (abaixo) entram nesse mesmo
// mecanismo único — nenhuma delas concedida a 'authorized_collaborator'
// agora.
export function resolveCapabilities(actorType: ActorType): Capability[] {
  switch (actorType) {
    case 'professional':
      return [
        'read_professional_profile',
        'read_opportunity',
        'read_booking',
        'read_external_participant',
        'read_professional_business_context',
        'read_professional_commercial_history',
      ];
    case 'authorized_collaborator':
      // Nenhum caminho real chega aqui em v1 (ver resolveActorContext) —
      // mantido vazio de propósito até o Booker Pro definir o conjunto
      // real de capacidades de um colaborador autorizado.
      return [];
    case 'system':
      return [
        'read_professional_profile',
        'read_opportunity',
        'read_booking',
        'read_external_participant',
        'read_professional_business_context',
        'read_professional_commercial_history',
      ];
  }
}

const MINIMAL_CONVERSATION_COLUMNS =
  'id, represented_professional_id, mandate, status, current_state, conversation_type, external_participant_id, related_opportunity_id, related_booking_id';

export async function resolveActorContext(
  supabase: SupabaseClient<Database>,
  conversationId: string,
  trigger: ActorTrigger
): Promise<ActorContextResult> {
  if (trigger.kind === 'system') {
    // Ponto em aberto documentado na entrega do Bloco 1: não existe,
    // neste bloco, nenhum disparador real de 'system' (sem infra de
    // followup agendado ainda) — e RLS não concede a `anon`/sem sessão
    // leitura de conversations, então este ramo não tem, hoje, como
    // buscar a conversa com o client passado por um chamador comum.
    // Fica isolado, tipado e explicitamente recusado até um bloco
    // futuro decidir o client (service-role ou equivalente) e o
    // caminho server-side que autoriza um disparo de sistema de
    // verdade. Nenhum código atual depende deste ramo ter sucesso.
    return { ok: false, error: 'system_trigger_not_supported' };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: 'not_authenticated' };
  }

  const { data: conversation } = await supabase
    .from('conversations')
    .select(MINIMAL_CONVERSATION_COLUMNS)
    .eq('id', conversationId)
    .maybeSingle<MinimalConversation>();

  if (!conversation) {
    return { ok: false, error: 'conversation_not_found' };
  }

  // Única regra de autorização de ator em v1: o usuário autenticado
  // precisa SER o profissional representado desta conversa. Nunca lido
  // de um parâmetro — sempre comparado contra o valor que a própria
  // conversa carrega.
  if (user.id !== conversation.represented_professional_id) {
    return { ok: false, error: 'actor_not_authorized_for_conversation' };
  }

  const actorType: ActorType = 'professional';

  return {
    ok: true,
    actorContext: {
      representedProfessionalId: conversation.represented_professional_id,
      actorType,
      actorProfileId: user.id,
      capabilities: resolveCapabilities(actorType),
      triggerSource: trigger.triggerSource,
    },
    conversation,
  };
}
