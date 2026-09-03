import { colors } from '@/theme/tokens';
import type { ConversationState } from './conversation-state';

// Espelha CONVERSATION_STATE_LABELS/conversationStatePillClasses de
// src/app/dashboard/ui.ts (painel web) — mesmos 4 rótulos, cor
// equivalente na paleta mobile. "Você respondeu" não tem entrada aqui
// de propósito (fato de mensagem, não estado de conversa).
export const CONVERSATION_STATE_LABELS: Record<ConversationState, string> = {
  needs_you: 'Precisa de você',
  waiting_client: 'Aguardando cliente',
  in_progress: 'Em andamento',
  closed: 'Encerrada',
};

export function conversationStateColor(state: ConversationState): string {
  switch (state) {
    case 'needs_you':
      return colors.red;
    case 'waiting_client':
      return colors.amber;
    case 'closed':
      return colors.tx30;
    case 'in_progress':
    default:
      return colors.tx50;
  }
}
