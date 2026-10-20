import { describe, expect, it } from 'vitest';

import type { ContextPackage, MessageContextItem } from '../context-builder';
import type { MinimalConversation } from '../types';
import { buildClassificationContext } from './classification-context';

// ADR 0005, Etapa 3 bloco 1 (16/10/2026) — validação real do achado
// comprovado: classification-context.ts cortava o histórico pra
// trigger + 2 mensagens anteriores, mesmo o Context Builder já tendo
// carregado até CONTEXT_MAX_MESSAGES (10). Este arquivo prova, com
// cenários de conversa real, que a correção de fato propaga TODO o
// histórico já carregado — nunca um corte próprio e menor.
//
// Importante (pedido explícito da fundadora, 16/10/2026): isto só
// prova que o CANO está desentupido — que o Classifier agora RECEBE a
// âncora da conversa. Não prova, e não pode provar, que o modelo vai
// RACIOCINAR corretamente sobre ela — isso só um teste real contra o
// modelo (golden-suite) ou uso real no WhatsApp confirma.

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
    professionalLearnedPreferences: { status: 'loaded', facts: [] },
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

describe('buildClassificationContext — janela de histórico (ADR 0005, bloco 1)', () => {
  it('conversa real de 6 turnos com correção: a oferta original (turno 1) ainda chega no recentMessages ao classificar o "Sim" final (turno 6)', () => {
    const items = [
      msg({ messageId: 'm1', authorType: 'ai', text: 'Quer que eu te mostre como usar alguma função específica?' }),
      msg({ messageId: 'm2', authorType: 'professional', text: 'Mostre.' }),
      msg({ messageId: 'm3', authorType: 'ai', text: 'A Doopla é uma plataforma que conecta profissionais a clientes.' }),
      msg({ messageId: 'm4', authorType: 'professional', text: 'Não é assim que a Doopla se explica, essa não é a definição correta.' }),
      msg({ messageId: 'm5', authorType: 'ai', text: 'Posso te mostrar outro tutorial então?' }),
      msg({ messageId: 'm6', authorType: 'professional', text: 'Sim' }),
    ];

    const ctx = buildClassificationContext(contextPackageWithMessages(items), CONVERSATION);

    expect(ctx.triggerMessage).toEqual({ authorType: 'professional', text: 'Sim', contentType: 'text' });
    // Antes do bloco 1: recentMessages só tinha m4/m5 (2 anteriores).
    // Agora: as 5 mensagens anteriores inteiras, incluindo a âncora
    // original (m1) que o bug anterior descartava.
    expect(ctx.recentMessages).toHaveLength(5);
    expect(ctx.recentMessages[0]).toEqual({ authorType: 'ai', text: 'Quer que eu te mostre como usar alguma função específica?' });
    expect(ctx.recentMessages.map((m) => m.text)).toContain('Mostre.');
    expect(ctx.recentMessages.map((m) => m.text)).toContain('Não é assim que a Doopla se explica, essa não é a definição correta.');
  });

  it('mudança de assunto e retomada: ao retomar o assunto original 4 turnos depois, ele ainda está no recentMessages', () => {
    const items = [
      msg({ messageId: 'm1', authorType: 'professional', text: 'Chama a Gabi e fala que mandei beijos.' }),
      msg({ messageId: 'm2', authorType: 'ai', text: 'Você já tem autorização pra contatar esse número?' }),
      msg({ messageId: 'm3', authorType: 'professional', text: 'Tenho sim.' }),
      msg({ messageId: 'm4', authorType: 'professional', text: 'Ah, muda meu horário de atendimento pra depois das 18h.' }),
      msg({ messageId: 'm5', authorType: 'ai', text: 'Feito, atualizei seu horário de atendimento.' }),
      msg({ messageId: 'm6', authorType: 'professional', text: 'E aí, conseguiu falar com ela?' }),
    ];

    const ctx = buildClassificationContext(contextPackageWithMessages(items), CONVERSATION);

    expect(ctx.triggerMessage?.text).toBe('E aí, conseguiu falar com ela?');
    expect(ctx.recentMessages).toHaveLength(5);
    // O pedido original de delegação (m1) precisa estar visível — é
    // exatamente o que "conseguiu falar com ela?" está perguntando.
    expect(ctx.recentMessages.map((m) => m.text)).toContain('Chama a Gabi e fala que mandei beijos.');
  });

  it('respeita o teto que o Context Builder já aplicou (nunca busca mais do que recebeu) — 10 mensagens carregadas, 9 em recentMessages', () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      msg({ messageId: `m${i}`, authorType: i % 2 === 0 ? 'professional' : 'ai', text: `mensagem ${i}` })
    );

    const ctx = buildClassificationContext(contextPackageWithMessages(items), CONVERSATION);

    expect(ctx.recentMessages).toHaveLength(9);
    expect(ctx.triggerMessage?.text).toBe('mensagem 9');
    // A mais antiga das 10 carregadas (m0) ainda está presente — nada
    // cortado além do que o próprio Context Builder já limitou.
    expect(ctx.recentMessages[0].text).toBe('mensagem 0');
  });

  it('casos de borda: 0 e 1 mensagem continuam funcionando sem erro', () => {
    const empty = buildClassificationContext(contextPackageWithMessages([]), CONVERSATION);
    expect(empty.triggerMessage).toBeNull();
    expect(empty.recentMessages).toEqual([]);

    const single = buildClassificationContext(
      contextPackageWithMessages([msg({ messageId: 'm1', authorType: 'professional', text: 'Oi' })]),
      CONVERSATION
    );
    expect(single.triggerMessage?.text).toBe('Oi');
    expect(single.recentMessages).toEqual([]);
  });
});
