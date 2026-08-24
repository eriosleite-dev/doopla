import { executeTool } from '../tool-registry';
import type { ContextSource, ToolContext } from '../types';
import { CONTEXT_MAX_PROFILE_FIELD_CHARS, truncateText } from './budget';
import type { ContextFact, ContextSection } from './types';

// Doopla Intelligence Core v1 — Context Builder v1: seções de fatos
// (profissional/oportunidade/booking/participante externo).
//
// Cada função aqui só CONSOME allowedContextSources/eligibleTools já
// calculados pelo pre-model gate — nunca os recalcula, nunca os
// amplia. A ordem de checagem segue exatamente as 4 condições
// aprovadas: (1) vínculo real na conversa, (2) fonte permitida,
// (3) tool elegível, (4) a tool confirma isolamento (found:true).
// Qualquer uma falhando, a seção reflete isso — nunca um fallback
// tentando outro caminho.

type Gate = { allowedContextSources: ContextSource[]; eligibleTools: string[] };
type SectionOutcome = { section: ContextSection<ContextFact>; calledTool: string | null };

function pushFact(
  facts: ContextFact[],
  sourceType: ContextFact['sourceType'],
  sourceId: string,
  field: string,
  value: string | number | boolean | null,
  loadedAt: string,
  truncated?: boolean
) {
  if (value === null) return;
  facts.push({ sourceType, sourceId, field, value, factType: 'structured', loadedAt, truncated });
}

export async function buildProfessionalSection(toolCtx: ToolContext, gate: Gate, now: Date): Promise<SectionOutcome> {
  const toolName = 'get_professional_profile';
  if (!gate.allowedContextSources.includes('professional_profile') || !gate.eligibleTools.includes(toolName)) {
    return { section: { status: 'not_allowed' }, calledTool: null };
  }

  const outcome = await executeTool<{
    fullName: string;
    stageName: string | null;
    category: string | null;
    bio: string | null;
  }>(toolName, {}, toolCtx, gate.eligibleTools);

  // Discipline "opaca" aplicada de forma consistente: qualquer
  // resultado que não seja um outcome ok vira not_found — nunca
  // diferenciamos o motivo aqui.
  if (!outcome.ok) {
    return { section: { status: 'not_found' }, calledTool: toolName };
  }

  const sourceId = toolCtx.representedProfessionalId;
  const loadedAt = now.toISOString();
  const facts: ContextFact[] = [];
  pushFact(facts, 'professional_profile', sourceId, 'fullName', outcome.output.fullName, loadedAt);
  pushFact(facts, 'professional_profile', sourceId, 'stageName', outcome.output.stageName, loadedAt);
  pushFact(facts, 'professional_profile', sourceId, 'category', outcome.output.category, loadedAt);
  if (outcome.output.bio) {
    const bio = truncateText(outcome.output.bio, CONTEXT_MAX_PROFILE_FIELD_CHARS);
    pushFact(facts, 'professional_profile', sourceId, 'bio', bio.value, loadedAt, bio.truncated);
  }

  return { section: { status: 'loaded', facts }, calledTool: toolName };
}

export async function buildOpportunitySection(toolCtx: ToolContext, gate: Gate, now: Date): Promise<SectionOutcome> {
  const toolName = 'get_opportunity';
  if (!toolCtx.conversation.related_opportunity_id) {
    return { section: { status: 'no_link' }, calledTool: null };
  }
  if (!gate.allowedContextSources.includes('opportunity') || !gate.eligibleTools.includes(toolName)) {
    return { section: { status: 'not_allowed' }, calledTool: null };
  }

  const outcome = await executeTool<
    | { found: true; opportunity: { id: string; description: string; status: string; cacheAmountCents: number | null; commissionPercent: number | null; workType: string | null; category: string | null; location: string | null; eventDate: string | null } }
    | { found: false }
  >(toolName, { opportunityId: toolCtx.conversation.related_opportunity_id }, toolCtx, gate.eligibleTools);

  if (!outcome.ok || outcome.output.found === false) {
    return { section: { status: 'not_found' }, calledTool: toolName };
  }

  const { opportunity } = outcome.output;
  const loadedAt = now.toISOString();
  const facts: ContextFact[] = [];
  pushFact(facts, 'opportunity', opportunity.id, 'description', opportunity.description, loadedAt);
  pushFact(facts, 'opportunity', opportunity.id, 'status', opportunity.status, loadedAt);
  pushFact(facts, 'opportunity', opportunity.id, 'cacheAmountCents', opportunity.cacheAmountCents, loadedAt);
  pushFact(facts, 'opportunity', opportunity.id, 'commissionPercent', opportunity.commissionPercent, loadedAt);
  pushFact(facts, 'opportunity', opportunity.id, 'workType', opportunity.workType, loadedAt);
  pushFact(facts, 'opportunity', opportunity.id, 'category', opportunity.category, loadedAt);
  pushFact(facts, 'opportunity', opportunity.id, 'location', opportunity.location, loadedAt);
  pushFact(facts, 'opportunity', opportunity.id, 'eventDate', opportunity.eventDate, loadedAt);

  return { section: { status: 'loaded', facts }, calledTool: toolName };
}

export async function buildBookingSection(toolCtx: ToolContext, gate: Gate, now: Date): Promise<SectionOutcome> {
  const toolName = 'get_booking';
  if (!toolCtx.conversation.related_booking_id) {
    return { section: { status: 'no_link' }, calledTool: null };
  }
  if (!gate.allowedContextSources.includes('booking') || !gate.eligibleTools.includes(toolName)) {
    return { section: { status: 'not_allowed' }, calledTool: null };
  }

  const outcome = await executeTool<
    | { found: true; booking: { id: string; status: string; commissionPercent: number; cacheAmountCents: number | null; description: string | null; eventDate: string | null; eventLocation: string | null } }
    | { found: false }
  >(toolName, { bookingId: toolCtx.conversation.related_booking_id }, toolCtx, gate.eligibleTools);

  if (!outcome.ok || outcome.output.found === false) {
    return { section: { status: 'not_found' }, calledTool: toolName };
  }

  const { booking } = outcome.output;
  const loadedAt = now.toISOString();
  const facts: ContextFact[] = [];
  pushFact(facts, 'booking', booking.id, 'status', booking.status, loadedAt);
  pushFact(facts, 'booking', booking.id, 'commissionPercent', booking.commissionPercent, loadedAt);
  pushFact(facts, 'booking', booking.id, 'cacheAmountCents', booking.cacheAmountCents, loadedAt);
  pushFact(facts, 'booking', booking.id, 'description', booking.description, loadedAt);
  pushFact(facts, 'booking', booking.id, 'eventDate', booking.eventDate, loadedAt);
  pushFact(facts, 'booking', booking.id, 'eventLocation', booking.eventLocation, loadedAt);

  return { section: { status: 'loaded', facts }, calledTool: toolName };
}

export async function buildExternalParticipantSection(toolCtx: ToolContext, gate: Gate, now: Date): Promise<SectionOutcome> {
  const toolName = 'get_external_participant';
  if (!toolCtx.conversation.external_participant_id) {
    return { section: { status: 'no_link' }, calledTool: null };
  }
  if (!gate.allowedContextSources.includes('external_participant') || !gate.eligibleTools.includes(toolName)) {
    return { section: { status: 'not_allowed' }, calledTool: null };
  }

  const outcome = await executeTool<
    | { found: true; participant: { id: string; name: string | null; phone: string | null; email: string | null } }
    | { found: false }
  >(toolName, {}, toolCtx, gate.eligibleTools);

  if (!outcome.ok || outcome.output.found === false) {
    return { section: { status: 'not_found' }, calledTool: toolName };
  }

  const { participant } = outcome.output;
  const loadedAt = now.toISOString();
  const facts: ContextFact[] = [];
  pushFact(facts, 'external_participant', participant.id, 'name', participant.name, loadedAt);
  pushFact(facts, 'external_participant', participant.id, 'phone', participant.phone, loadedAt);
  pushFact(facts, 'external_participant', participant.id, 'email', participant.email, loadedAt);

  return { section: { status: 'loaded', facts }, calledTool: toolName };
}
