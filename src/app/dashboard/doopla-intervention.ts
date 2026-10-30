import type { ConversationOperationalFacts } from '@/lib/conversations/data';
import { deriveConversationState } from '@/lib/conversations/state';
import type { DecisionItem } from '@/lib/decisions/data';
import type { ProfessionalDecisionCategory } from '@/lib/intelligence/planner/decision-categories';
import type { CommitmentCheck } from '@/lib/intelligence/policy-gate-post/types';

import { PRO_CONVERSATION_STATE_TONE, type ProPillTone } from './pro-format';

// Correção 15/09/2026 (achado da fundadora) — "Precisa de você" não
// pode ser inferido de "de onde o trabalho veio" (ex.: todo pedido do
// link virando "precisa de você" só por existir) nem de texto genérico
// tipo "responda o cliente". Única fonte de verdade: o estado
// operacional real da conversation (needs_you/waiting_client/
// in_progress/closed — o mesmo que já alimenta Home/Decisões,
// conversations/state.ts) + a decisão concreta pendente
// (runtime_pending_replies/outbound_intents, decisions/data.ts) — e só
// isso. Usado por Home, badge de Bookings, lista de Bookings e
// detalhe de Pedido: nunca uma segunda leitura divergente por tela.
export type DooplaIntervention = {
  needsYou: boolean;
  headline: string;
  detail: string;
  tone: ProPillTone;
};

// Mapa fechado categoria -> frase curta. Nunca usa
// extractedValueForDebug (payload explicitamente marcado debug-only em
// policy-gate-post/types.ts — não é dado de produto) nem inventa um
// valor que o backend não devolve. Categorias fora deste mapa caem no
// fallback neutro abaixo — nunca uma frase específica sem lastro.
const CATEGORY_REASON: Partial<Record<ProfessionalDecisionCategory, (client: string) => string>> = {
  price_or_cache: (c) => `Sua Doopla está negociando com ${c} e precisa da sua confirmação sobre o valor.`,
  discount: (c) => `${c} pediu um desconto — sua Doopla precisa saber até onde você pode negociar.`,
  payment_condition: (c) => `Sua Doopla precisa da sua confirmação sobre a condição de pagamento com ${c}.`,
  date_change: (c) => `Sua Doopla precisa confirmar sua disponibilidade antes de responder ${c}.`,
  time_change: (c) => `Sua Doopla precisa confirmar o horário com você antes de responder ${c}.`,
  duration_change: (c) => `Sua Doopla precisa confirmar a duração do trabalho antes de responder ${c}.`,
  location_change: (c) => `${c} pediu uma mudança de local — sua Doopla precisa da sua confirmação.`,
  accept_or_decline_work: (c) => `Sua Doopla recebeu uma proposta de ${c} e precisa que você aceite ou recuse.`,
  cancellation: (c) => `${c} sinalizou cancelamento — sua Doopla precisa de uma decisão sua.`,
};

const FALLBACK_REASON = 'Confirme os detalhes deste booking com sua Doopla para ela continuar.';

function firstBlockedCategory(checks: unknown): ProfessionalDecisionCategory | null {
  if (!Array.isArray(checks)) return null;
  const blocked = (checks as Partial<CommitmentCheck>[]).find(
    (c) => c && c.result === 'blocked' && typeof c.decisionCategory === 'string'
  );
  return (blocked?.decisionCategory as ProfessionalDecisionCategory | undefined) ?? null;
}

// Motivo concreto só quando o backend sustenta. prepared_draft: cita o
// rascunho real já pronto (dado concreto e citável). pending_reply:
// mapeia a CATEGORIA real do compromisso bloqueado (enum fechado do
// Policy Gate) — nunca o valor extraído. Sem categoria reconhecível,
// cai no fallback neutro pedido explicitamente pela fundadora.
export function concreteDooplaReason(decision: DecisionItem | null, clientName: string): string {
  if (!decision) return FALLBACK_REASON;
  if (decision.kind === 'prepared_draft' && decision.preparedContent) {
    const snippet =
      decision.preparedContent.length > 100 ? `${decision.preparedContent.slice(0, 100)}…` : decision.preparedContent;
    return `Sua Doopla preparou uma resposta pra ${clientName} e está esperando você revisar e enviar: "${snippet}"`;
  }
  const category = firstBlockedCategory(decision.checks);
  const builder = category ? CATEGORY_REASON[category] : null;
  return builder ? builder(clientName) : FALLBACK_REASON;
}

export function resolveDooplaIntervention(
  conversation: ConversationOperationalFacts | null,
  decision: DecisionItem | null,
  clientName: string
): DooplaIntervention {
  if (!conversation) {
    return {
      needsYou: false,
      headline: 'Recebido',
      detail: 'Ainda não há uma decisão pendente — sua Doopla vai iniciar a condução deste trabalho.',
      tone: 'neutral',
    };
  }

  const state = deriveConversationState(conversation);

  if (state === 'needs_you') {
    return { needsYou: true, headline: 'Precisa de você', detail: concreteDooplaReason(decision, clientName), tone: 'red' };
  }
  if (state === 'waiting_client') {
    return {
      needsYou: false,
      headline: 'Aguardando cliente',
      detail: `Sua Doopla já respondeu e está aguardando o retorno de ${clientName}. Você não precisa fazer nada agora.`,
      tone: PRO_CONVERSATION_STATE_TONE.waiting_client,
    };
  }
  if (state === 'closed') {
    return { needsYou: false, headline: 'Encerrada', detail: 'Essa conversa foi encerrada.', tone: 'neutral' };
  }
  return {
    needsYou: false,
    headline: 'Sua Doopla está cuidando',
    detail: 'A negociação está em andamento. Você não precisa fazer nada agora.',
    tone: PRO_CONVERSATION_STATE_TONE.in_progress,
  };
}
