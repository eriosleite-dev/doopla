'use server';

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { triggerInboundMessage } from '@/lib/beta-integration/trigger';
import type { RuntimeCycleOutcome } from '@/lib/runtime';

// Passo 4b do roadmap de Beta Runtime Integration — primeira ação real
// do profissional pelo painel, passando pelo MESMO boundary já
// validado no passo 3 (triggerInboundMessage -> processInboundEvent).
// Nunca um caminho novo de "resolver pendência": a resposta do
// profissional é uma mensagem normal (authorType='professional') — o
// Runtime (Approval Engine + attemptResumptionsAfterApproval, já
// dentro de pipeline.ts) decide sozinho o que ela resolve. Nenhuma
// lógica de aprovação/resolução duplicada aqui.
//
// Boundary de posse em duas camadas, nenhuma dependendo só da outra:
// 1) aqui, com o client authenticated (RLS "conversations: select
//    own") ANTES de qualquer chamada ao Runtime;
// 2) persist_inbound_message (migration 0051, dentro do Runtime)
//    revalida author_profile_id = conversations.represented_professional_id
//    de novo, fail-closed, mesmo que (1) tivesse um bug.
//
// NUNCA usar a policy "conversation_messages: insert own professional
// message" (RLS, migration 0039) diretamente — ela existe, mas
// inserir por ali pula claim_inbound_event/lease/Classifier/Planner/
// Approval Engine/resumption inteiros, deixando a mensagem órfã
// (dívida arquitetural registrada em PROGRESS.md, não resolvida
// agora — fora do escopo do 4b).

async function requireProfessional() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
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

export type ProfessionalReplyActionResult = RuntimeCycleOutcome | { kind: 'action_error'; error: string };

// submissionId: identidade estável da SUBMISSÃO (não do conteúdo) —
// gerada UMA VEZ por quem chama esta action (ex.: crypto.randomUUID()
// no componente, no momento em que o profissional inicia esta
// submissão específica) e reenviada IDÊNTICA em qualquer nova
// tentativa da MESMA submissão (retry de rede, duplo clique). Uma
// submissão nova e deliberada — mesmo com texto idêntico, mesma
// conversa, segundos depois — precisa vir com um submissionId NOVO;
// esta action nunca gera nem deriva um sozinha (não seria capaz de
// distinguir retry de nova intenção só pelo conteúdo). Usado
// diretamente como providerEventId — claim_inbound_event (migration
// 0051) já dedupe por (channel, provider_event_id); não precisa
// embutir conversationId/professionalId nele (colisão de UUID entre
// submissões de conversas diferentes é desprezível).
export async function sendProfessionalReplyAction(params: {
  conversationId: string;
  submissionId: string;
  body: string;
}): Promise<ProfessionalReplyActionResult> {
  const { user } = await requireProfessional();
  const ownership = await assertOwnsConversation(params.conversationId);
  if (!ownership.ok) return { kind: 'action_error', error: ownership.error };

  try {
    return await triggerInboundMessage({
      conversationId: params.conversationId,
      authorType: 'professional',
      authorProfileId: user.id,
      body: params.body,
      channel: 'painel',
      providerEventId: params.submissionId,
      workerId: 'dashboard:professional-reply',
    });
  } catch (err) {
    return { kind: 'action_error', error: err instanceof Error ? err.message : 'erro desconhecido' };
  }
}
