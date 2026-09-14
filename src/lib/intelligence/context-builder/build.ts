import type { ContextSource, ToolContext } from '../types';
import { buildMessagesSection } from './messages';
import {
  buildBookingSection,
  buildExternalParticipantSection,
  buildOpportunitySection,
  buildProfessionalBusinessContextSection,
  buildProfessionalCommercialHistorySection,
  buildProfessionalSection,
} from './sections';
import type { ContextBuildResult, ContextPackageSectionName, UnavailableSource } from './types';

// Doopla Intelligence Core v1 — Context Builder v1 (Bloco 2).
//
// Único ponto de entrada. Recebe SEMPRE um gate já calculado
// (allowedContextSources/eligibleTools do pre-model gate) — nunca os
// recalcula, nunca resolve ActorContext sozinho, nunca amplia nada.
// `now` é injetável só pra testes determinísticos de janela temporal
// (default: relógio real).

export async function buildContextPackage(
  toolCtx: ToolContext,
  gate: { allowedContextSources: ContextSource[]; eligibleTools: string[] },
  opts: { now?: Date } = {}
): Promise<ContextBuildResult> {
  const now = opts.now ?? new Date();
  const calledTools: string[] = [];
  const unavailableSources: UnavailableSource[] = [];

  function noteIfUnavailable(
    name: ContextPackageSectionName,
    status: string,
    reasonCode: UnavailableSource['reasonCode'] = 'query_error'
  ) {
    if (status === 'unavailable') unavailableSources.push({ source: name, reasonCode });
  }

  const professional = await buildProfessionalSection(toolCtx, gate, now);
  if (professional.calledTool) calledTools.push(professional.calledTool);
  noteIfUnavailable('professional', professional.section.status, professional.unavailableReason);

  const professionalBusinessContext = await buildProfessionalBusinessContextSection(toolCtx, gate, now);
  if (professionalBusinessContext.calledTool) calledTools.push(professionalBusinessContext.calledTool);
  noteIfUnavailable('professionalBusinessContext', professionalBusinessContext.section.status, professionalBusinessContext.unavailableReason);

  const professionalCommercialHistory = await buildProfessionalCommercialHistorySection(toolCtx, gate, now);
  if (professionalCommercialHistory.calledTool) calledTools.push(professionalCommercialHistory.calledTool);
  noteIfUnavailable(
    'professionalCommercialHistory',
    professionalCommercialHistory.section.status,
    professionalCommercialHistory.unavailableReason
  );

  const opportunity = await buildOpportunitySection(toolCtx, gate, now);
  if (opportunity.calledTool) calledTools.push(opportunity.calledTool);
  noteIfUnavailable('opportunity', opportunity.section.status, opportunity.unavailableReason);

  const booking = await buildBookingSection(toolCtx, gate, now);
  if (booking.calledTool) calledTools.push(booking.calledTool);
  noteIfUnavailable('booking', booking.section.status, booking.unavailableReason);

  const externalParticipant = await buildExternalParticipantSection(toolCtx, gate, now);
  if (externalParticipant.calledTool) calledTools.push(externalParticipant.calledTool);
  noteIfUnavailable('externalParticipant', externalParticipant.section.status, externalParticipant.unavailableReason);

  const messages = await buildMessagesSection(toolCtx, gate, now);
  // Sem outcome do Tool Registry pra desenrolar (mensagens não passam
  // por lá) — 'query_error' já é o motivo real aqui, não um genérico.
  noteIfUnavailable('messages', messages.status);

  return {
    contextPackage: {
      conversationId: toolCtx.conversation.id,
      representedProfessionalId: toolCtx.representedProfessionalId,
      builtAt: now.toISOString(),
      professional: professional.section,
      professionalBusinessContext: professionalBusinessContext.section,
      professionalCommercialHistory: professionalCommercialHistory.section,
      messages,
      opportunity: opportunity.section,
      booking: booking.section,
      externalParticipant: externalParticipant.section,
    },
    calledTools,
    unavailableSources,
  };
}
