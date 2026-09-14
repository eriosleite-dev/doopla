import type { SupabaseClient } from '@supabase/supabase-js';

import { triggerInboundMessage } from './trigger';
import type { RuntimeCycleOutcome } from '@/lib/runtime';

// Conversas Bloco 2 — ÚNICO boundary server-side de resposta do
// profissional, compartilhado por Web (Server Action, sessão via
// cookie) e Mobile (rota de API, sessão via Bearer token/token-client).
// Nenhum caminho paralelo semanticamente diferente: os dois
// chamadores resolvem a própria autenticação (transporte diferente —
// cookie x Bearer — mesmo shape de sessão Supabase/RLS por baixo) e
// entregam aqui um client JÁ autenticado como o profissional real,
// mais o professionalId já resolvido (supabase.auth.getUser().id) — a
// partir daqui a lógica de posse/encaminhamento é idêntica pros dois.
//
// Cobre, num único lugar:
//   - tenant ownership (conversation pertence a professionalId — lido
//     AGORA, nunca confiando num flag vindo do cliente: "revalidação
//     de estado" é isto, um SELECT de verdade no momento da chamada);
//   - outbound_intent_id opcional, com checagem de posse aqui como
//     defesa em profundidade (a validação AUTORITATIVA de novo
//     pertencimento à MESMA conversation continua sendo feita dentro
//     de persist_inbound_message, migration 0066 — nunca duplicada
//     como fonte de verdade, só reforçada);
//   - idempotência: submissionId vira providerEventId, dedupe real por
//     claim_inbound_event (migration 0051) — um retry de rede/duplo
//     clique nunca reprocessa;
//   - superfície de origem (web/mobile) — carregada em workerId
//     (nunca em TriggerSource, que é hardcoded 'system_job' dentro de
//     resolveSystemActorContext e é um módulo congelado — decisão
//     deliberada pra não tocar nele) pra auditoria/instrumentação
//     futura sem exigir uma segunda implementação por superfície;
//   - encaminhamento pro Runtime já existente (triggerInboundMessage ->
//     processInboundEvent), nunca uma lógica de aprovação/resolução
//     nova aqui — o Approval Engine dentro do pipeline decide sozinho
//     o que esta resposta resolve.

export type ProfessionalReplySourceSurface = 'web' | 'mobile';

export type SubmitProfessionalReplyParams = {
  conversationId: string;
  // Identidade estável da SUBMISSÃO (não do conteúdo) — ver comentário
  // equivalente em professional-reply-action.ts: gerada uma vez por
  // quem chama, reenviada idêntica em qualquer retry da MESMA
  // submissão. Usada como providerEventId.
  submissionId: string;
  body: string;
  // Presente quando esta resposta responde a um draft específico já
  // autorizado pelo Post-model Gate (outbound_intents). Ausente/nulo
  // quando o profissional está iniciando algo novo, não respondendo a
  // um "Precisa de você" pendente.
  outboundIntentId?: string | null;
  sourceSurface: ProfessionalReplySourceSurface;
};

export type SubmitProfessionalReplyResult = RuntimeCycleOutcome | { kind: 'action_error'; error: string };

export async function submitProfessionalReply(
  // Client já autenticado como o profissional real (cookie no Web,
  // Bearer no Mobile) — RLS "select own" das tabelas abaixo é a
  // PRIMEIRA camada de posse; o filtro explícito por professionalId é
  // a segunda, nenhuma dependendo só da outra (mesmo padrão de duas
  // camadas já usado em professional-reply-action.ts).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  professionalId: string,
  params: SubmitProfessionalReplyParams
): Promise<SubmitProfessionalReplyResult> {
  const { data: conversation } = await supabase
    .from('conversations')
    .select('id')
    .eq('id', params.conversationId)
    .eq('represented_professional_id', professionalId)
    .maybeSingle();
  if (!conversation) {
    return { kind: 'action_error', error: 'Conversa não encontrada ou não pertence a este profissional.' };
  }

  if (params.outboundIntentId) {
    const { data: outboundIntent } = await supabase
      .from('outbound_intents')
      .select('id, conversation_id')
      .eq('id', params.outboundIntentId)
      .eq('professional_id', professionalId)
      .maybeSingle();
    if (!outboundIntent || (outboundIntent as { conversation_id: string }).conversation_id !== params.conversationId) {
      return { kind: 'action_error', error: 'Rascunho não encontrado ou não pertence a esta conversa.' };
    }
  }

  try {
    return await triggerInboundMessage({
      conversationId: params.conversationId,
      authorType: 'professional',
      authorProfileId: professionalId,
      body: params.body,
      channel: 'painel',
      providerEventId: params.submissionId,
      repliedToOutboundIntentId: params.outboundIntentId ?? null,
      workerId: `professional-reply:${params.sourceSurface}`,
    });
  } catch (err) {
    return { kind: 'action_error', error: err instanceof Error ? err.message : 'erro desconhecido' };
  }
}
