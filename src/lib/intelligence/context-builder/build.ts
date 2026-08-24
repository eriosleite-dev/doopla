import type { ContextSource, ToolContext } from '../types';
import { buildMessagesSection } from './messages';
import { buildBookingSection, buildExternalParticipantSection, buildOpportunitySection, buildProfessionalSection } from './sections';
import type { ContextBuildResult } from './types';

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

  const professional = await buildProfessionalSection(toolCtx, gate, now);
  if (professional.calledTool) calledTools.push(professional.calledTool);

  const opportunity = await buildOpportunitySection(toolCtx, gate, now);
  if (opportunity.calledTool) calledTools.push(opportunity.calledTool);

  const booking = await buildBookingSection(toolCtx, gate, now);
  if (booking.calledTool) calledTools.push(booking.calledTool);

  const externalParticipant = await buildExternalParticipantSection(toolCtx, gate, now);
  if (externalParticipant.calledTool) calledTools.push(externalParticipant.calledTool);

  const messages = await buildMessagesSection(toolCtx, gate, now);

  return {
    contextPackage: {
      conversationId: toolCtx.conversation.id,
      representedProfessionalId: toolCtx.representedProfessionalId,
      builtAt: now.toISOString(),
      professional: professional.section,
      messages,
      opportunity: opportunity.section,
      booking: booking.section,
      externalParticipant: externalParticipant.section,
    },
    calledTools,
  };
}
