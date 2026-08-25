import type { ContextPackage } from '../context-builder';
import type { Intent } from './intents';
import type { ContextCompleteness } from './types';

// Doopla Intelligence Core v1 — Bloco 3: completude de contexto.
//
// Nunca uma contagem genérica de seções — só as fontes que o intent
// classificado de fato depende, via esta tabela pequena e explícita.
// Vazio = esse intent não depende de nenhuma fonte que o Context
// Builder v1 carrega hoje (ex.: `disponibilidade` dependeria de
// agenda no futuro, mas não existe tool de agenda ainda — não
// considerado até existir, sem inventar uma dependência que o Core
// não consegue de fato verificar).
const INTENT_DEPENDENCIES: Record<Intent, readonly ('opportunity' | 'booking' | 'externalParticipant')[]> = {
  orcamento: ['opportunity'],
  disponibilidade: [],
  desconto: ['opportunity', 'booking'],
  condicao_pagamento: ['booking'],
  logistica: ['booking'],
  rider: ['booking'],
  contrato: ['booking'],
  cobranca: ['booking'],
  material_profissional: [],
  reclamacao: ['booking'],
  suporte: [],
  booking_update: ['booking'],
  // Estado financeiro de um trabalho já existente — depende do booking
  // (nunca opportunity, que é pré-fechamento).
  financeiro_booking: ['booking'],
  treinamento_profissional: [],
  outro: [],
};

export function computeContextCompleteness(
  primaryIntent: Intent,
  secondaryIntents: readonly Intent[],
  contextPackage: ContextPackage
): ContextCompleteness {
  const relevantSources = new Set<'opportunity' | 'booking' | 'externalParticipant'>();
  for (const intent of [primaryIntent, ...secondaryIntents]) {
    for (const source of INTENT_DEPENDENCIES[intent]) relevantSources.add(source);
  }

  let anyUnavailable = false;
  let anyMissing = false;
  for (const source of relevantSources) {
    const status = contextPackage[source].status;
    if (status === 'unavailable') {
      anyUnavailable = true;
    } else if (status === 'not_found' || status === 'no_link') {
      anyMissing = true;
    }
    // not_allowed nunca conta: a Policy Layer decidiu que essa fonte
    // não deveria carregar — ausência correta, não incompletude.
  }

  if (anyUnavailable) return 'partial_unavailable';
  if (anyMissing) return 'partial_missing';
  return 'complete';
}
