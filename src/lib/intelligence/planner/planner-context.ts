import type { IntentClassification } from '../classification';
import { resolveProfessionalDisplayName } from '../context-builder';
import type { ContextFact, ContextPackage, ContextSection } from '../context-builder';
import type { MinimalConversation } from '../types';
import type { PlannerContext, PlannerMessageItem } from './types';

// Doopla Intelligence Core v1 — Bloco 4: projeção do ContextPackage
// pro Response Planner. Diferente da projeção do Classifier (Bloco 3)
// de propósito — ver comentário em planner/types.ts.

function externalParticipantName(pkg: ContextPackage): string | null {
  if (pkg.externalParticipant.status !== 'loaded') return null;
  const fact = pkg.externalParticipant.facts.find((f) => f.field === 'name');
  return typeof fact?.value === 'string' ? fact.value : null;
}

// CommercialHistorySection carrega retrievalStrategy/limit além de
// facts — informação de observability/estratégia, não algo que o
// Planner precisa pra grounding de evidência. Reduz pro mesmo
// ContextSection<ContextFact> genérico das outras seções.
function toGenericSection(section: ContextPackage['professionalCommercialHistory']): ContextSection<ContextFact> {
  if (section.status === 'loaded') return { status: 'loaded', facts: section.facts };
  return { status: section.status };
}

export function buildPlannerContext(
  contextPackage: ContextPackage,
  conversation: MinimalConversation,
  intentClassification: IntentClassification
): PlannerContext {
  const messages = contextPackage.messages.status === 'loaded' ? contextPackage.messages.items : [];
  // Mesma janela do Classifier (gatilho + até 2 anteriores) — mensagens
  // vêm mais antiga primeiro, a última é o gatilho desta rodada.
  const trigger = messages.length > 0 ? messages[messages.length - 1] : null;
  const previous = messages.length > 1 ? messages.slice(Math.max(0, messages.length - 3), messages.length - 1) : [];

  const toItem = (m: (typeof messages)[number]): PlannerMessageItem => ({
    messageId: m.messageId,
    authorType: m.authorType,
    text: m.text,
  });

  return {
    conversationId: contextPackage.conversationId,
    intentClassification,
    triggerMessage: trigger ? toItem(trigger) : null,
    recentMessages: previous.map(toItem),
    conversationType: conversation.conversation_type,
    currentState: conversation.current_state,
    representedProfessionalDisplayName:
      contextPackage.professional.status === 'loaded' ? resolveProfessionalDisplayName(contextPackage) : null,
    externalParticipantName: externalParticipantName(contextPackage),
    professional: contextPackage.professional,
    professionalBusinessContext: contextPackage.professionalBusinessContext,
    professionalCommercialHistory: toGenericSection(contextPackage.professionalCommercialHistory),
    opportunity: contextPackage.opportunity,
    booking: contextPackage.booking,
    externalParticipant: contextPackage.externalParticipant,
  };
}
