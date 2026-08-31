'use server';

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { triggerInboundMessage } from '@/lib/beta-integration/trigger';
import type { RuntimeCycleOutcome } from '@/lib/runtime';
import type { Conversation } from '@/lib/supabase/types';

// Passo 3 do roadmap de Beta Runtime Integration — smoke test real
// contra OpenAI/service_role. Ferramenta de desenvolvimento/teste, não
// é parte do produto — mesmo espírito de /dev/intelligence-test, mas
// chamando o Runtime de verdade (triggerInboundMessage ->
// processInboundEvent), não a chamada isolada de Blocos 1-4.
//
// triggerInboundMessage roda com service_role (createServiceRoleClient,
// dentro de beta-integration/trigger.ts) — pipeline.ts confia no
// conversationId recebido, nunca revalida posse contra uma sessão de
// browser (não é essa a fronteira dele). A posse de verdade É
// revalidada AQUI, com o client authenticated (RLS: "conversations:
// select own"), antes de qualquer chamada ao Runtime — nunca confia
// no que o client alegou, mesmo tratando-se de uma ferramenta interna.

async function requireProfessional() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dev/runtime-smoke-test');
  return { supabase, user };
}

async function assertOwnsConversation(conversationId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, user } = await requireProfessional();
  const { data } = await supabase
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('represented_professional_id', user.id)
    .maybeSingle();
  if (!data) return { ok: false, error: 'Conversa não encontrada ou não pertence a este profissional.' };
  return { ok: true };
}

export async function createSmokeTestConversationAction(): Promise<{ conversationId?: string; error?: string }> {
  const { supabase, user } = await requireProfessional();

  const { data, error } = await supabase.rpc('create_conversation', {
    p_represented_professional_id: user.id,
    p_conversation_type: 'external_inquiry',
    p_origin: 'painel',
    p_channel: 'painel',
  });

  if (error || !data) {
    return { error: `Não foi possível criar a conversa de teste: ${error?.message ?? 'sem dado'}` };
  }
  const conversation = data as Conversation;
  return { conversationId: conversation.id };
}

export type SmokeTestActionResult = RuntimeCycleOutcome | { kind: 'action_error'; error: string };

// Simula a mensagem do CLIENTE (authorType: external_participant) — o
// lado que hoje chegaria por um canal real (WhatsApp/Meta), ainda
// inexistente. identifier/name são inventados aqui só pra teste;
// resolveOrCreateExternalParticipant (dentro do Runtime) resolve/cria
// o participante de verdade a partir disso.
export async function sendSmokeTestClientMessageAction(params: {
  conversationId: string;
  body: string;
  clientIdentifier: string;
  clientName: string;
}): Promise<SmokeTestActionResult> {
  const ownership = await assertOwnsConversation(params.conversationId);
  if (!ownership.ok) return { kind: 'action_error', error: ownership.error };

  try {
    return await triggerInboundMessage({
      conversationId: params.conversationId,
      authorType: 'external_participant',
      externalParticipantIdentifier: {
        channel: 'painel',
        identifier: params.clientIdentifier,
        name: params.clientName || null,
      },
      body: params.body,
    });
  } catch (err) {
    return { kind: 'action_error', error: err instanceof Error ? err.message : 'erro desconhecido' };
  }
}

// Simula o PRÓPRIO PROFISSIONAL respondendo na MESMA conversa (nunca
// uma conversa professional_self separada — é a própria thread com o
// cliente que carrega o commercial root; ver comentário em
// beta-integration/trigger.ts). authorProfileId é sempre o usuário
// logado, nunca um parâmetro vindo do client.
export async function sendSmokeTestProfessionalMessageAction(params: {
  conversationId: string;
  body: string;
}): Promise<SmokeTestActionResult> {
  const { user } = await requireProfessional();
  const ownership = await assertOwnsConversation(params.conversationId);
  if (!ownership.ok) return { kind: 'action_error', error: ownership.error };

  try {
    return await triggerInboundMessage({
      conversationId: params.conversationId,
      authorType: 'professional',
      authorProfileId: user.id,
      body: params.body,
    });
  } catch (err) {
    return { kind: 'action_error', error: err instanceof Error ? err.message : 'erro desconhecido' };
  }
}
