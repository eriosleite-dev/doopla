import { describe, expect, it } from 'vitest';

import { resolveOutboundAction, resolveRecipientType, shouldRunApprovalEngine } from './recipient';

// Doopla — suíte de regressão do WhatsApp (13/10/2026). Cobre a
// decisão PURA de "pra quem é essa resposta" e "qual caminho de saída
// usar" — nunca o envio de verdade (isso é professional-whatsapp-reply.test.ts).

describe('resolveRecipientType — profissional vs cliente externo', () => {
  it('conversa professional_self é sempre pro próprio profissional, nunca pro cliente', () => {
    expect(resolveRecipientType('professional_self', 'answer_with_known_information')).toBe('professional');
  });

  it('conversa external_inquiry com plano normal é pro cliente', () => {
    expect(resolveRecipientType('external_inquiry', 'answer_with_known_information')).toBe('external_participant');
  });

  it('conversa external_inquiry com consult_professional é pro profissional, nunca vaza pro cliente', () => {
    expect(resolveRecipientType('external_inquiry', 'consult_professional')).toBe('professional');
  });
});

describe('resolveOutboundAction — caminho de saída (outbound_intents vs persist_ai_message)', () => {
  it('gate não permitiu: nunca persiste nada', () => {
    expect(resolveOutboundAction('external_participant', 'blocked', true)).toBe('none');
    expect(resolveOutboundAction('professional', 'blocked', false)).toBe('none');
    expect(resolveOutboundAction('external_participant', 'not_applicable', true)).toBe('none');
  });

  it('destino profissional + gate permitido: sempre persist_ai_message (nunca outbound_intents)', () => {
    expect(resolveOutboundAction('professional', 'allowed', false)).toBe('persist_ai_message');
    expect(resolveOutboundAction('professional', 'allowed', true)).toBe('persist_ai_message');
  });

  it('destino cliente + gate permitido + participante vinculado: outbound_intents', () => {
    expect(resolveOutboundAction('external_participant', 'allowed', true)).toBe('create_outbound_intent');
  });

  it('destino cliente + gate permitido SEM participante vinculado: guarda defensiva, nunca cria intent órfão', () => {
    expect(resolveOutboundAction('external_participant', 'allowed', false)).toBe('none');
  });
});

describe('shouldRunApprovalEngine', () => {
  it('só roda pra enunciado do PRÓPRIO profissional sobre um commercial root existente', () => {
    expect(shouldRunApprovalEngine('professional', true)).toBe(true);
  });

  it('cliente nunca aciona o Approval Engine, por mais inequívoco que pareça', () => {
    expect(shouldRunApprovalEngine('external_participant', true)).toBe(false);
  });

  it('sem commercial root, nunca roda — mesmo sendo o profissional falando', () => {
    expect(shouldRunApprovalEngine('professional', false)).toBe(false);
  });
});
