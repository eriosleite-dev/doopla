import { executeTool } from '../tool-registry';
import type { ContextSource, ToolContext, ToolExecutionError } from '../types';
import { CONTEXT_MAX_BUSINESS_CONTEXT_FIELD_CHARS, CONTEXT_MAX_COMMERCIAL_HISTORY_ITEMS, CONTEXT_MAX_PROFILE_FIELD_CHARS, truncateText } from './budget';
import type { CommercialHistorySection, ContextFact, ContextSection } from './types';

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
//
// Distinção crítica (achado da auditoria adversarial): uma tool pode
// falhar de duas formas MUITO diferentes —
//   (a) outcome.ok === false → a consulta em si falhou (erro de
//       banco/rede/parsing/registro). Não sabemos se o dado existe.
//       Vira status 'unavailable'.
//   (b) outcome.ok === true && output.found === false → a consulta
//       rodou normalmente e não achou nada (ou achou de outro
//       tenant — deliberadamente indistinguível). Vira 'not_found'.
// As duas nunca podem colapsar na mesma branch.

type Gate = { allowedContextSources: ContextSource[]; eligibleTools: string[] };
type SectionOutcome = { section: ContextSection<ContextFact>; calledTool: string | null; unavailableReason?: ToolExecutionError };

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

  const outcome = await executeTool<
    | { found: true; profile: { fullName: string; stageName: string | null; category: string | null; bio: string | null } }
    | { found: false }
  >(toolName, {}, toolCtx, gate.eligibleTools);

  // (a) consulta falhou de verdade — "não consegui verificar".
  if (!outcome.ok) {
    return { section: { status: 'unavailable' }, calledTool: toolName, unavailableReason: outcome.error };
  }
  // (b) consulta rodou, não achou — "verifiquei e não existe".
  if (outcome.output.found === false) {
    return { section: { status: 'not_found' }, calledTool: toolName };
  }

  const { profile } = outcome.output;
  const sourceId = toolCtx.representedProfessionalId;
  const loadedAt = now.toISOString();
  const facts: ContextFact[] = [];
  pushFact(facts, 'professional_profile', sourceId, 'fullName', profile.fullName, loadedAt);
  pushFact(facts, 'professional_profile', sourceId, 'stageName', profile.stageName, loadedAt);
  pushFact(facts, 'professional_profile', sourceId, 'category', profile.category, loadedAt);
  if (profile.bio) {
    const bio = truncateText(profile.bio, CONTEXT_MAX_PROFILE_FIELD_CHARS);
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

  if (!outcome.ok) {
    return { section: { status: 'unavailable' }, calledTool: toolName, unavailableReason: outcome.error };
  }
  if (outcome.output.found === false) {
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

  if (!outcome.ok) {
    return { section: { status: 'unavailable' }, calledTool: toolName, unavailableReason: outcome.error };
  }
  if (outcome.output.found === false) {
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

// Junta uma lista declarada (work_types/client_types/regions/help_areas)
// num único fato — lista vazia é tratada igual a "não informado" (o
// profissional nunca vê essa distinção na UI de perfil, e um array
// vazio nunca é diferente de "nada declarado ainda" pra quem consome).
function pushJoinedListFact(facts: ContextFact[], sourceId: string, field: string, values: string[], loadedAt: string) {
  if (values.length === 0) return;
  pushFact(facts, 'professional_business_context', sourceId, field, values.join(', '), loadedAt);
}

// Professional Intelligence Context — preferências/dados de negócio
// DECLARADOS (mesmos campos de /dashboard/perfil). Mesmo padrão de
// gate das outras seções: nunca dependente de link de conversa (a
// fonte já está sempre em allowedContextSources pro representado, ver
// policy-gate.ts), só checa allowedContextSources/eligibleTools.
export async function buildProfessionalBusinessContextSection(toolCtx: ToolContext, gate: Gate, now: Date): Promise<SectionOutcome> {
  const toolName = 'get_professional_business_context';
  if (!gate.allowedContextSources.includes('professional_business_context') || !gate.eligibleTools.includes(toolName)) {
    return { section: { status: 'not_allowed' }, calledTool: null };
  }

  const outcome = await executeTool<
    | {
        found: true;
        businessContext: {
          feeRange: string | null;
          feeVariesByJobType: boolean | null;
          pricingNotes: string | null;
          negotiationNotes: string | null;
          typicalJobDuration: string | null;
          workTypes: string[];
          clientTypes: string[];
          regions: string[];
          travels: boolean;
          acceptsOutOfCityWork: boolean;
          attentionChannel: string | null;
          helpAreas: string[];
          careerStage: string | null;
          issuesInvoice: boolean | null;
        };
      }
    | { found: false }
  >(toolName, {}, toolCtx, gate.eligibleTools);

  if (!outcome.ok) {
    return { section: { status: 'unavailable' }, calledTool: toolName, unavailableReason: outcome.error };
  }
  if (outcome.output.found === false) {
    return { section: { status: 'not_found' }, calledTool: toolName };
  }

  const { businessContext } = outcome.output;
  const sourceId = toolCtx.representedProfessionalId;
  const loadedAt = now.toISOString();
  const facts: ContextFact[] = [];
  pushFact(facts, 'professional_business_context', sourceId, 'feeRange', businessContext.feeRange, loadedAt);
  pushFact(facts, 'professional_business_context', sourceId, 'feeVariesByJobType', businessContext.feeVariesByJobType, loadedAt);
  if (businessContext.pricingNotes) {
    const t = truncateText(businessContext.pricingNotes, CONTEXT_MAX_BUSINESS_CONTEXT_FIELD_CHARS);
    pushFact(facts, 'professional_business_context', sourceId, 'pricingNotes', t.value, loadedAt, t.truncated);
  }
  if (businessContext.negotiationNotes) {
    const t = truncateText(businessContext.negotiationNotes, CONTEXT_MAX_BUSINESS_CONTEXT_FIELD_CHARS);
    pushFact(facts, 'professional_business_context', sourceId, 'negotiationNotes', t.value, loadedAt, t.truncated);
  }
  pushFact(facts, 'professional_business_context', sourceId, 'typicalJobDuration', businessContext.typicalJobDuration, loadedAt);
  pushJoinedListFact(facts, sourceId, 'workTypes', businessContext.workTypes, loadedAt);
  pushJoinedListFact(facts, sourceId, 'clientTypes', businessContext.clientTypes, loadedAt);
  pushJoinedListFact(facts, sourceId, 'regions', businessContext.regions, loadedAt);
  pushFact(facts, 'professional_business_context', sourceId, 'travels', businessContext.travels, loadedAt);
  pushFact(facts, 'professional_business_context', sourceId, 'acceptsOutOfCityWork', businessContext.acceptsOutOfCityWork, loadedAt);
  pushFact(facts, 'professional_business_context', sourceId, 'attentionChannel', businessContext.attentionChannel, loadedAt);
  pushJoinedListFact(facts, sourceId, 'helpAreas', businessContext.helpAreas, loadedAt);
  pushFact(facts, 'professional_business_context', sourceId, 'careerStage', businessContext.careerStage, loadedAt);
  pushFact(facts, 'professional_business_context', sourceId, 'issuesInvoice', businessContext.issuesInvoice, loadedAt);

  return { section: { status: 'loaded', facts }, calledTool: toolName };
}

type CommercialHistorySectionOutcome = { section: CommercialHistorySection; calledTool: string | null; unavailableReason?: ToolExecutionError };

// Professional Intelligence Context — histórico comercial real
// (bookings passados do próprio profissional), retrieval V1 por
// recência (CONTEXT_MAX_COMMERCIAL_HISTORY_ITEMS, ver budget.ts) —
// cada booking é seu próprio fato individual (sourceId = booking.id),
// NUNCA agregado/calculado. status é sempre incluído por fato — nunca
// omitido — pra nunca deixar implícito que um booking em
// proposta/cancelado "aconteceu" de fato.
export async function buildProfessionalCommercialHistorySection(
  toolCtx: ToolContext,
  gate: Gate,
  now: Date
): Promise<CommercialHistorySectionOutcome> {
  const toolName = 'get_professional_commercial_history';
  if (!gate.allowedContextSources.includes('professional_commercial_history') || !gate.eligibleTools.includes(toolName)) {
    return { section: { status: 'not_allowed' }, calledTool: null };
  }

  const outcome = await executeTool<{
    bookings: {
      id: string;
      status: string;
      cacheAmountCents: number | null;
      commissionPercent: number;
      eventDate: string | null;
      eventLocation: string | null;
      description: string | null;
      createdAt: string;
    }[];
  }>(toolName, { limit: CONTEXT_MAX_COMMERCIAL_HISTORY_ITEMS }, toolCtx, gate.eligibleTools);

  if (!outcome.ok) {
    return { section: { status: 'unavailable' }, calledTool: toolName, unavailableReason: outcome.error };
  }

  const loadedAt = now.toISOString();
  const facts: ContextFact[] = [];
  for (const booking of outcome.output.bookings) {
    pushFact(facts, 'professional_commercial_history', booking.id, 'status', booking.status, loadedAt);
    pushFact(facts, 'professional_commercial_history', booking.id, 'cacheAmountCents', booking.cacheAmountCents, loadedAt);
    pushFact(facts, 'professional_commercial_history', booking.id, 'commissionPercent', booking.commissionPercent, loadedAt);
    pushFact(facts, 'professional_commercial_history', booking.id, 'eventDate', booking.eventDate, loadedAt);
    pushFact(facts, 'professional_commercial_history', booking.id, 'eventLocation', booking.eventLocation, loadedAt);
    pushFact(facts, 'professional_commercial_history', booking.id, 'description', booking.description, loadedAt);
    pushFact(facts, 'professional_commercial_history', booking.id, 'createdAt', booking.createdAt, loadedAt);
  }

  return {
    section: { status: 'loaded', facts, retrievalStrategy: 'recency_bounded_v1', limit: CONTEXT_MAX_COMMERCIAL_HISTORY_ITEMS },
    calledTool: toolName,
  };
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

  if (!outcome.ok) {
    return { section: { status: 'unavailable' }, calledTool: toolName, unavailableReason: outcome.error };
  }
  if (outcome.output.found === false) {
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
