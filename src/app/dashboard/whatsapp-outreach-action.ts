'use server';

import { redirect } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';
import { triggerInboundMessage } from '@/lib/beta-integration/trigger';
import { normalizeWhatsappPhone } from '@/lib/channels/whatsapp/phone';
import { findReusableWhatsappConversation } from '@/lib/channels/whatsapp/conversation';
import type { RuntimeCycleOutcome } from '@/lib/runtime';

// Doopla Intelligence Core v1 — passo 6A: primeiro vertical real de
// canal (WhatsApp). A profissional informa o contato de um cliente —
// a Doopla inicia a conversa. Boundary de posse idêntico ao 4b
// (requireProfessional/sessão autenticada, nunca confia em input do
// cliente pra identidade), boundary de Runtime idêntico ao 4b/passo 3
// (triggerInboundMessage -> processInboundEvent, o texto da
// profissional passa pelo Planner/Approval Engine/Gate normalmente —
// nunca sai pro cliente sem revisão do Gate). Nenhuma write tool nova,
// nenhum caminho paralelo.

async function requireProfessional() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return { supabase, user };
}

// Reaproveita a regra de seleção (channels/whatsapp/conversation.ts,
// compartilhada com o webhook inbound) e só cuida do "senão, cria" —
// exclusivo deste lado porque create_conversation (migration 0039) só
// aceita chamada de uma sessão autenticada real (auth.uid() ===
// p_represented_professional_id, sem bypass de is_system_caller()) —
// o webhook, rodando como service_role sem sessão, nunca pode chamar
// isso; ver comentário em api/whatsapp/webhook/route.ts.
async function resolveOrCreateWhatsappConversation(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  params: { professionalId: string; externalParticipantId: string }
): Promise<string> {
  const existing = await findReusableWhatsappConversation(supabase, params);
  if (existing) return existing;

  const { data: created, error } = await supabase
    .rpc('create_conversation', {
      p_represented_professional_id: params.professionalId,
      p_conversation_type: 'external_inquiry',
      p_external_participant_id: params.externalParticipantId,
      p_origin: 'whatsapp',
      p_channel: 'whatsapp',
    })
    .single();
  if (error || !created) throw new Error(`create_conversation falhou: ${error?.message ?? 'sem dado'}`);
  return (created as { id: string }).id;
}

export type WhatsappOutreachActionResult = RuntimeCycleOutcome | { kind: 'action_error'; error: string };

export async function startWhatsappOutreachAction(params: {
  clientPhone: string;
  clientName?: string;
  body: string;
}): Promise<WhatsappOutreachActionResult> {
  const { supabase, user } = await requireProfessional();

  const normalizedPhone = normalizeWhatsappPhone(params.clientPhone);
  if (!normalizedPhone) {
    return { kind: 'action_error', error: 'Telefone inválido — confira o DDD e o número.' };
  }
  if (!params.body.trim()) {
    return { kind: 'action_error', error: 'Escreva a mensagem inicial.' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as SupabaseClient<any>;

  try {
    const { data: participant, error: participantError } = await client
      .rpc('resolve_or_create_external_participant', {
        p_professional_id: user.id,
        p_channel: 'whatsapp',
        p_identifier: normalizedPhone,
        p_name: params.clientName?.trim() || null,
      })
      .single();
    if (participantError || !participant) {
      return { kind: 'action_error', error: `Não foi possível registrar o contato: ${participantError?.message ?? 'sem dado'}` };
    }
    const externalParticipantId = (participant as { id: string }).id;

    const conversationId = await resolveOrCreateWhatsappConversation(client, {
      professionalId: user.id,
      externalParticipantId,
    });

    return await triggerInboundMessage({
      conversationId,
      authorType: 'professional',
      authorProfileId: user.id,
      body: params.body,
      channel: 'whatsapp',
      workerId: 'dashboard:whatsapp-outreach',
    });
  } catch (err) {
    return { kind: 'action_error', error: err instanceof Error ? err.message : 'erro desconhecido' };
  }
}
