'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { submitProfessionalReply } from '@/lib/beta-integration/professional-reply';
import type { RuntimeCycleOutcome } from '@/lib/runtime';

// Passo 4b do roadmap de Beta Runtime Integration — primeira ação real
// do profissional pelo painel. Conversas Bloco 2: esta action deixou
// de conter lógica de posse/encaminhamento própria — delega inteira
// pro boundary ÚNICO compartilhado com o Mobile
// (src/lib/beta-integration/professional-reply.ts,
// submitProfessionalReply), que por sua vez passa pelo MESMO caminho
// já validado no passo 3 (triggerInboundMessage -> processInboundEvent).
// Nunca um caminho novo de "resolver pendência": a resposta do
// profissional é uma mensagem normal (authorType='professional') — o
// Runtime (Approval Engine + attemptResumptionsAfterApproval, já
// dentro de pipeline.ts) decide sozinho o que ela resolve. Nenhuma
// lógica de aprovação/resolução duplicada aqui.
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
  // Conversas Bloco 2 — presente quando esta resposta responde a um
  // draft específico já autorizado pelo Post-model Gate.
  outboundIntentId?: string | null;
}): Promise<ProfessionalReplyActionResult> {
  const { supabase, user } = await requireProfessional();
  const result = await submitProfessionalReply(supabase, user.id, {
    conversationId: params.conversationId,
    submissionId: params.submissionId,
    body: params.body,
    outboundIntentId: params.outboundIntentId ?? null,
    sourceSurface: 'web',
  });

  // Ciclo de requires_professional_review (01/10/2026) — resolver uma
  // pendência aqui precisa desaparecer de Home/sidebar/Bookings/
  // conversa sem reload manual. 'completed' e 'duplicate_event' (retry
  // de uma submissão que já tinha sucedido) são os únicos casos em que
  // algo pode ter mudado de estado; os demais (busy/not_found/
  // author_mismatch/action_error) nunca persistem nada novo.
  // revalidatePath('/dashboard', 'layout') invalida a árvore inteira do
  // painel de uma vez — nunca uma lista de paths mantida à mão, que
  // ficaria desatualizada a cada nova superfície que ler o mesmo
  // estado (exatamente o drift que esta rodada corrigiu).
  if (result.kind === 'completed' || result.kind === 'duplicate_event') {
    revalidatePath('/dashboard', 'layout');
  }

  return result;
}
