import { resolveProfessionalDisplayName } from '../context-builder';
import type { ContextPackage } from '../context-builder';
import type { MinimalConversation } from '../types';
import type { ClassificationContext } from './types';

// Doopla Intelligence Core v1 — Bloco 3: projeção leve do
// ContextPackage pro classifier. Nunca o pacote inteiro renderizado —
// só o necessário pra entender "o que está acontecendo": a mensagem-
// gatilho, até 2 anteriores, identidade mínima dos dois lados,
// tipo/estado da conversa, e flags estruturadas de status por seção
// (nunca texto/detalhe técnico). O classifier nunca busca dado
// adicional sozinho — só o que chega aqui.

function externalParticipantName(pkg: ContextPackage): string | null {
  if (pkg.externalParticipant.status !== 'loaded') return null;
  const fact = pkg.externalParticipant.facts.find((f) => f.field === 'name');
  return typeof fact?.value === 'string' ? fact.value : null;
}

export function buildClassificationContext(
  contextPackage: ContextPackage,
  conversation: MinimalConversation
): ClassificationContext {
  const messages = contextPackage.messages.status === 'loaded' ? contextPackage.messages.items : [];
  // messages.items vem mais antiga primeiro (ver context-builder) —
  // a última é a mais recente, tratada como o gatilho desta rodada.
  //
  // Achado real (ADR 0005, 16/10/2026): até 14/10/2026 este corte era
  // fixo em 2 mensagens anteriores, mesmo o Context Builder já tendo
  // carregado até CONTEXT_MAX_MESSAGES (budget.ts, hoje 10) — descartava
  // a âncora de correções/respostas curtas sempre que mais de 2 turnos
  // se passavam. Agora usa TUDO que o Context Builder já carregou,
  // nunca um corte próprio e menor — o orçamento de histórico vive só
  // em budget.ts, nunca duplicado aqui.
  const trigger = messages.length > 0 ? messages[messages.length - 1] : null;
  const previous = messages.length > 1 ? messages.slice(0, messages.length - 1) : [];

  return {
    triggerMessage: trigger
      ? { authorType: trigger.authorType, text: trigger.text, contentType: trigger.contentType }
      : null,
    recentMessages: previous.map((m) => ({ authorType: m.authorType, text: m.text })),
    conversationType: conversation.conversation_type,
    currentState: conversation.current_state,
    externalParticipant:
      contextPackage.externalParticipant.status === 'loaded' ? { name: externalParticipantName(contextPackage) } : null,
    representedProfessional:
      contextPackage.professional.status === 'loaded' ? { displayName: resolveProfessionalDisplayName(contextPackage) } : null,
    sectionStatus: {
      opportunity: contextPackage.opportunity.status,
      booking: contextPackage.booking.status,
      externalParticipant: contextPackage.externalParticipant.status,
    },
  };
}
