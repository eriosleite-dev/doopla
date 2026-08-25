'use server';

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { classifyIntent, GOLDEN_SUITE_CASES } from '@/lib/intelligence/classification';
import type { ContextPackage } from '@/lib/intelligence/context-builder';
import { getOpenAIClient } from '@/lib/intelligence/openai-client';
import type { ActorContext, MinimalConversation, ToolContext } from '@/lib/intelligence/types';

// Ferramenta de desenvolvimento/teste — não é parte do produto.
// Mesmo padrão de /dev/intelligence-test: checagem de sessão própria,
// sem confiar em nada vindo do client.
//
// Zero pegada em banco: cada caso da golden suite roda contra um
// ContextPackage/MinimalConversation SINTÉTICOS, montados em memória
// — nunca uma conversa real é criada/lida. classifyIntent() nunca
// toca supabase.from()/.rpc() (confirmado na auditoria adversarial do
// Bloco 3), então isto não altera nenhum dado de produção. A única
// chamada de rede real é ao model de classificação, usando a MESMA
// abstração já auditada (getOpenAIClient(), só lê
// process.env.OPENAI_API_KEY no servidor — a chave nunca chega ao
// client, nunca é logada, nunca aparece em nenhum campo devolvido
// aqui).

export type GoldenSuiteCaseResult = {
  name: string;
  category: string;
  input: string;
  expectedIntents: string[];
  returnedPrimaryIntent: string;
  returnedSecondaryIntents: string[];
  modelConfidence: string;
  effectiveConfidence: string;
  classificationStatus: string;
  pass: boolean;
  note?: string;
  error?: string;
};

async function requireProfessional() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dev/classification-golden-suite');
  return { supabase, user };
}

function buildSyntheticContext(
  triggerText: string,
  professionalId: string
): { contextPackage: ContextPackage; conversation: MinimalConversation } {
  const conversation: MinimalConversation = {
    id: 'golden-suite-synthetic',
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
  const contextPackage: ContextPackage = {
    conversationId: conversation.id,
    representedProfessionalId: professionalId,
    builtAt: now,
    professional: { status: 'loaded', facts: [] },
    messages: {
      status: 'loaded',
      items: [
        {
          messageId: 'golden-suite-trigger',
          createdAt: now,
          authorType: 'external_participant',
          direction: 'inbound',
          contentType: 'text',
          text: triggerText,
          truncated: false,
          provenance: { sourceType: 'conversation_message', sourceId: 'golden-suite-trigger' },
        },
      ],
      windowMessageCount: 1,
      windowSince: now,
    },
    opportunity: { status: 'no_link' },
    booking: { status: 'no_link' },
    externalParticipant: { status: 'no_link' },
  };

  return { contextPackage, conversation };
}

export async function runGoldenSuiteAction(): Promise<{ results?: GoldenSuiteCaseResult[]; error?: string }> {
  const { supabase, user } = await requireProfessional();

  // Falha cedo e com clareza se a chave não estiver configurada neste
  // ambiente — nunca deixa isso virar 32 resultados silenciosamente
  // "invalid" que pareceriam falha de classificação em vez de
  // configuração ausente. classifyIntent() cria seu próprio client
  // internamente (mesma abstração), esta chamada aqui é só a checagem.
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

  const results: GoldenSuiteCaseResult[] = [];

  for (const goldenCase of GOLDEN_SUITE_CASES) {
    const { contextPackage, conversation } = buildSyntheticContext(goldenCase.input, user.id);
    const toolCtx: ToolContext = {
      representedProfessionalId: user.id,
      actorContext,
      conversation,
      supabase,
    };

    try {
      const { classification } = await classifyIntent(toolCtx, contextPackage);
      const returnedIntents = [classification.primaryIntent, ...classification.secondaryIntents];
      const pass = goldenCase.expectedIntents.some((intent) => returnedIntents.includes(intent));

      results.push({
        name: goldenCase.name,
        category: goldenCase.category,
        input: goldenCase.input,
        expectedIntents: goldenCase.expectedIntents,
        returnedPrimaryIntent: classification.primaryIntent,
        returnedSecondaryIntents: classification.secondaryIntents,
        modelConfidence: classification.modelConfidence,
        effectiveConfidence: classification.effectiveConfidence,
        classificationStatus: classification.classificationStatus,
        pass,
        note: goldenCase.note,
      });
    } catch (err) {
      results.push({
        name: goldenCase.name,
        category: goldenCase.category,
        input: goldenCase.input,
        expectedIntents: goldenCase.expectedIntents,
        returnedPrimaryIntent: 'erro',
        returnedSecondaryIntents: [],
        modelConfidence: 'low',
        effectiveConfidence: 'low',
        classificationStatus: 'invalid',
        pass: false,
        note: goldenCase.note,
        error: err instanceof Error ? err.message : 'erro desconhecido',
      });
    }
  }

  return { results };
}
