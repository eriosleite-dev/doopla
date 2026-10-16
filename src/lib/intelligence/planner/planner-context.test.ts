import { describe, expect, it } from 'vitest';

import type { ContextPackage, MessageContextItem } from '../context-builder';
import type { IntentClassification } from '../classification';
import type { MinimalConversation } from '../types';
import { buildPlannerContext } from './planner-context';

// ADR 0005, Etapa 3 bloco 1 (16/10/2026) — mesma validação de
// classification-context.test.ts, agora pro Planner. Prova que
// buildPlannerContext também propaga todo o histórico já carregado
// pelo Context Builder, nunca um corte próprio de 2 mensagens.

function msg(partial: Partial<MessageContextItem> & { authorType: MessageContextItem['authorType']; text: string }): MessageContextItem {
  return {
    messageId: partial.messageId ?? `msg-${Math.random()}`,
    createdAt: partial.createdAt ?? new Date().toISOString(),
    direction: partial.authorType === 'professional' || partial.authorType === 'external_participant' ? 'inbound' : 'outbound',
    contentType: 'text',
    truncated: false,
    provenance: { sourceType: 'conversation_message', sourceId: partial.messageId ?? 'src' },
    ...partial,
  };
}

function contextPackageWithMessages(items: MessageContextItem[]): ContextPackage {
  return {
    conversationId: 'conv-1',
    representedProfessionalId: 'prof-1',
    builtAt: new Date().toISOString(),
    professional: { status: 'loaded', facts: [] },
    professionalBusinessContext: { status: 'not_found' },
    professionalCommercialHistory: { status: 'loaded', facts: [], retrievalStrategy: 'recency_bounded_v1', limit: 5 },
    messages: { status: 'loaded', items, windowMessageCount: items.length, windowSince: new Date().toISOString() },
    opportunity: { status: 'no_link' },
    booking: { status: 'no_link' },
    externalParticipant: { status: 'no_link' },
  };
}

const CONVERSATION: MinimalConversation = {
  id: 'conv-1',
  represented_professional_id: 'prof-1',
  mandate: 'active',
  status: 'active',
  current_state: 'ongoing',
  conversation_type: 'professional_self',
  external_participant_id: null,
  related_opportunity_id: null,
  related_booking_id: null,
};

const CLASSIFICATION: IntentClassification = {
  classificationStatus: 'classified',
  primaryIntent: 'outro',
  secondaryIntents: [],
  modelConfidence: 'medium',
  effectiveConfidence: 'medium',
  contextCompleteness: 'complete',
  relevantCompetencies: [],
};

describe('buildPlannerContext — janela de histórico (ADR 0005, bloco 1)', () => {
  it('conversa real de 6 turnos com correção: a oferta original ainda chega pro Planner no turno do "Sim"', () => {
    const items = [
      msg({ messageId: 'm1', authorType: 'ai', text: 'Quer que eu te mostre como usar alguma função específica?' }),
      msg({ messageId: 'm2', authorType: 'professional', text: 'Mostre.' }),
      msg({ messageId: 'm3', authorType: 'ai', text: 'A Doopla é uma plataforma que conecta profissionais a clientes.' }),
      msg({ messageId: 'm4', authorType: 'professional', text: 'Não é assim que a Doopla se explica, essa não é a definição correta.' }),
      msg({ messageId: 'm5', authorType: 'ai', text: 'Posso te mostrar outro tutorial então?' }),
      msg({ messageId: 'm6', authorType: 'professional', text: 'Sim' }),
    ];

    const ctx = buildPlannerContext(contextPackageWithMessages(items), CONVERSATION, CLASSIFICATION);

    expect(ctx.triggerMessage?.text).toBe('Sim');
    expect(ctx.recentMessages).toHaveLength(5);
    expect(ctx.recentMessages[0].text).toBe('Quer que eu te mostre como usar alguma função específica?');
    expect(ctx.recentMessages[0].messageId).toBe('m1');
  });

  it('delegação com retomada: "conseguiu?" chega com o pedido original de delegação ainda visível pro Planner', () => {
    const items = [
      msg({ messageId: 'm1', authorType: 'professional', text: 'Chama a Gabi e fala que mandei beijos.' }),
      msg({ messageId: 'm2', authorType: 'ai', text: 'Você já tem autorização pra contatar esse número?' }),
      msg({ messageId: 'm3', authorType: 'professional', text: 'Tenho sim.' }),
      msg({ messageId: 'm4', authorType: 'professional', text: 'Ah, muda meu horário de atendimento pra depois das 18h.' }),
      msg({ messageId: 'm5', authorType: 'ai', text: 'Feito, atualizei seu horário de atendimento.' }),
      msg({ messageId: 'm6', authorType: 'professional', text: 'E aí, conseguiu falar com ela?' }),
    ];

    const ctx = buildPlannerContext(contextPackageWithMessages(items), CONVERSATION, CLASSIFICATION);

    expect(ctx.recentMessages.map((m) => m.messageId)).toContain('m1');
  });

  it('respeita o teto que o Context Builder já aplicou — 10 mensagens carregadas, 9 em recentMessages', () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      msg({ messageId: `m${i}`, authorType: i % 2 === 0 ? 'professional' : 'ai', text: `mensagem ${i}` })
    );

    const ctx = buildPlannerContext(contextPackageWithMessages(items), CONVERSATION, CLASSIFICATION);

    expect(ctx.recentMessages).toHaveLength(9);
    expect(ctx.recentMessages[0].text).toBe('mensagem 0');
  });

  it('casos de borda: 0 e 1 mensagem continuam funcionando sem erro', () => {
    const empty = buildPlannerContext(contextPackageWithMessages([]), CONVERSATION, CLASSIFICATION);
    expect(empty.triggerMessage).toBeNull();
    expect(empty.recentMessages).toEqual([]);

    const single = buildPlannerContext(
      contextPackageWithMessages([msg({ messageId: 'm1', authorType: 'professional', text: 'Oi' })]),
      CONVERSATION,
      CLASSIFICATION
    );
    expect(single.triggerMessage?.text).toBe('Oi');
    expect(single.recentMessages).toEqual([]);
  });
});
