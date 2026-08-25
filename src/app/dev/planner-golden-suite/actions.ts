'use server';

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { classifyIntent } from '@/lib/intelligence/classification';
import type { ContextFact, ContextPackage, MessageContextItem } from '@/lib/intelligence/context-builder';
import { getOpenAIClient } from '@/lib/intelligence/openai-client';
import { planResponse, PLANNER_GOLDEN_SUITE_CASES } from '@/lib/intelligence/planner';
import type { PlannerGoldenSuiteCase } from '@/lib/intelligence/planner';
import type { ActorContext, MinimalConversation, ToolContext } from '@/lib/intelligence/types';

// Ferramenta de desenvolvimento/teste — não é parte do produto. Mesmo
// padrão de /dev/classification-golden-suite: checagem de sessão
// própria, zero pegada em banco (ContextPackage/MinimalConversation
// sintéticos em memória), classifyIntent()/planResponse() nunca tocam
// supabase.from()/.rpc() (prova estrutural, coberta em teste
// determinístico). A única chamada de rede real é ao model, pela
// mesma abstração já auditada.

export type PlannerGoldenSuiteCaseResult = {
  name: string;
  category: string;
  input: string;
  responsePlan: string;
  commitmentNature: string;
  requiresProfessionalDecision: boolean;
  professionalDecisionCategory: string[];
  professionalDecisionSignal: string;
  requiresProfessionalReviewBeforeSend: boolean;
  proposedResponse: string | null;
  pass: boolean;
  note?: string;
  error?: string;
};

async function requireProfessional() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dev/planner-golden-suite');
  return { supabase, user };
}

function factsFromRecord(
  sourceType: 'opportunity' | 'booking',
  sourceId: string,
  record: Record<string, string | number | boolean>,
  loadedAt: string
): ContextFact[] {
  return Object.entries(record).map(([field, value]) => ({
    sourceType,
    sourceId,
    field,
    value,
    factType: 'structured' as const,
    loadedAt,
  }));
}

function buildSyntheticContext(
  goldenCase: PlannerGoldenSuiteCase,
  professionalId: string
): { contextPackage: ContextPackage; conversation: MinimalConversation } {
  const conversation: MinimalConversation = {
    id: 'planner-golden-suite-synthetic',
    represented_professional_id: professionalId,
    mandate: 'active',
    status: 'open',
    current_state: 'novo',
    conversation_type: 'external_inquiry',
    external_participant_id: null,
    related_opportunity_id: null,
    related_booking_id: null,
  };

  const now = new Date().toISOString();
  const previousItems: MessageContextItem[] = (goldenCase.previousMessages ?? []).map((m, i) => ({
    messageId: `planner-golden-suite-previous-${i}`,
    createdAt: now,
    authorType: m.authorType,
    direction: m.authorType === 'external_participant' ? 'inbound' : 'outbound',
    contentType: 'text',
    text: m.text,
    truncated: false,
    provenance: { sourceType: 'conversation_message', sourceId: `planner-golden-suite-previous-${i}` },
  }));
  const triggerItem: MessageContextItem = {
    messageId: 'planner-golden-suite-trigger',
    createdAt: now,
    authorType: goldenCase.triggerAuthorType ?? 'external_participant',
    direction: (goldenCase.triggerAuthorType ?? 'external_participant') === 'external_participant' ? 'inbound' : 'outbound',
    contentType: 'text',
    text: goldenCase.input,
    truncated: false,
    provenance: { sourceType: 'conversation_message', sourceId: 'planner-golden-suite-trigger' },
  };
  const items = [...previousItems, triggerItem];

  const contextPackage: ContextPackage = {
    conversationId: conversation.id,
    representedProfessionalId: professionalId,
    builtAt: now,
    professional: { status: 'loaded', facts: [] },
    messages: { status: 'loaded', items, windowMessageCount: items.length, windowSince: now },
    opportunity: goldenCase.opportunityFacts
      ? { status: 'loaded', facts: factsFromRecord('opportunity', 'planner-golden-suite-opportunity', goldenCase.opportunityFacts, now) }
      : { status: 'no_link' },
    booking: goldenCase.bookingFacts
      ? { status: 'loaded', facts: factsFromRecord('booking', 'planner-golden-suite-booking', goldenCase.bookingFacts, now) }
      : { status: 'no_link' },
    externalParticipant: { status: 'no_link' },
  };

  return { contextPackage, conversation };
}

export async function runPlannerGoldenSuiteAction(): Promise<{ results?: PlannerGoldenSuiteCaseResult[]; error?: string }> {
  const { supabase, user } = await requireProfessional();

  try {
    getOpenAIClient();
  } catch {
    return { error: 'openai_not_configured' };
  }

  const actorContext: ActorContext = {
    representedProfessionalId: user.id,
    actorType: 'professional',
    actorProfileId: user.id,
    capabilities: ['read_professional_profile', 'read_opportunity', 'read_booking', 'read_external_participant'],
    triggerSource: 'dev_test_panel',
  };

  const results: PlannerGoldenSuiteCaseResult[] = [];

  for (const goldenCase of PLANNER_GOLDEN_SUITE_CASES) {
    const { contextPackage, conversation } = buildSyntheticContext(goldenCase, user.id);
    const toolCtx: ToolContext = {
      representedProfessionalId: user.id,
      actorContext,
      conversation,
      supabase,
    };

    try {
      const { classification } = await classifyIntent(toolCtx, contextPackage);
      const { decision } = await planResponse(toolCtx, contextPackage, classification);

      const planMatches = (goldenCase.expectedResponsePlanFamily as string[]).includes(decision.responsePlan);
      const commitmentMatches = !goldenCase.expectedCommitmentNature || decision.commitmentNature === goldenCase.expectedCommitmentNature;
      const requiresDecisionMatches =
        goldenCase.expectedRequiresProfessionalDecision === undefined ||
        decision.requiresProfessionalDecision === goldenCase.expectedRequiresProfessionalDecision;
      const signalMatches =
        !goldenCase.expectedProfessionalDecisionSignal || decision.professionalDecisionSignal === goldenCase.expectedProfessionalDecisionSignal;
      // Invariante checada em TODO caso, não só no de controle: nenhuma
      // saída do Planner pode ser marcada como autorizada pra envio.
      const invariantHolds = decision.requiresProfessionalReviewBeforeSend === true;

      const pass = planMatches && commitmentMatches && requiresDecisionMatches && signalMatches && invariantHolds;

      results.push({
        name: goldenCase.name,
        category: goldenCase.category,
        input: goldenCase.input,
        responsePlan: decision.responsePlan,
        commitmentNature: decision.commitmentNature,
        requiresProfessionalDecision: decision.requiresProfessionalDecision,
        professionalDecisionCategory: decision.professionalDecisionCategory,
        professionalDecisionSignal: decision.professionalDecisionSignal,
        requiresProfessionalReviewBeforeSend: decision.requiresProfessionalReviewBeforeSend,
        proposedResponse: decision.proposedResponse,
        pass,
        note: goldenCase.note,
      });
    } catch (err) {
      results.push({
        name: goldenCase.name,
        category: goldenCase.category,
        input: goldenCase.input,
        responsePlan: 'erro',
        commitmentNature: 'erro',
        requiresProfessionalDecision: true,
        professionalDecisionCategory: [],
        professionalDecisionSignal: 'none',
        requiresProfessionalReviewBeforeSend: true,
        proposedResponse: null,
        pass: false,
        note: goldenCase.note,
        error: err instanceof Error ? err.message : 'erro desconhecido',
      });
    }
  }

  return { results };
}
