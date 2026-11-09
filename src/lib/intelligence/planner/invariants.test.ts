import { describe, expect, it } from 'vitest';

import { deterministicFallbackResponse, resolveResponsePlan, type ResponsePlanFloorInput } from './invariants';

// P1 UX conversacional (14/10/2026) — fix isolado do travessão literal
// no fallback determinístico (nunca lógica, só a string). Cobre
// exatamente os três planos com fallback de texto.

describe('deterministicFallbackResponse — sem travessão (P1, 14/10/2026)', () => {
  it('consult_professional nunca contém travessão', () => {
    const text = deterministicFallbackResponse('consult_professional');
    expect(text).not.toBeNull();
    expect(text).not.toMatch(/—/);
  });

  it('acknowledge nunca contém travessão', () => {
    const text = deterministicFallbackResponse('acknowledge');
    expect(text).not.toBeNull();
    expect(text).not.toMatch(/—/);
  });

  it('clarify_ambiguity nunca contém travessão', () => {
    const text = deterministicFallbackResponse('clarify_ambiguity');
    expect(text).not.toBeNull();
    expect(text).not.toMatch(/—/);
  });
});

// Achado real de produção (teste controlado da Etapa 2.1, 14/10/2026):
// uma mensagem informativa/solta do professional_self (ex.: "ok, é ela
// ok?") caía no piso de baixa confiança -> clarify_ambiguity, o model
// propunha no_response_needed (draft null) e, sem fallback pra
// clarify_ambiguity, o ciclo inteiro ficava em silêncio (pipeline.ts só
// age quando decision.proposedResponse é truthy). Este teste trava que
// o plano nunca mais fica sem texto.
describe('deterministicFallbackResponse — clarify_ambiguity nunca silencioso (achado real, 15/10/2026)', () => {
  it('ask_external_participant e answer_with_known_information continuam null (dependem do texto real do model)', () => {
    expect(deterministicFallbackResponse('ask_external_participant')).toBeNull();
    expect(deterministicFallbackResponse('answer_with_known_information')).toBeNull();
  });

  it('clarify_ambiguity sempre retorna um texto não vazio', () => {
    const text = deterministicFallbackResponse('clarify_ambiguity');
    expect(text).not.toBeNull();
    expect(text?.trim().length).toBeGreaterThan(0);
  });
});

// Achado da fundadora (19/10/2026, rodada de validação pós-deploy): a
// frase fixa original de consult_professional dizia "antes de eu
// responder ao cliente" incondicionalmente, mesmo numa conversa
// professional_self — onde não existe cliente nenhum nesta troca
// (resolveRecipientType, runtime/recipient.ts, prova que
// consult_professional é SEMPRE endereçado ao profissional nos dois
// tipos de conversa). Estes testes cobrem as dimensões exigidas:
// rebaixamento (implícito — só chega aqui quando o piso já rebaixou o
// plano), ausência de evidência (missingInformation vazio),
// informação irrelevante (blocksProfessionalDecision=false),
// múltiplas informações faltantes (mesma razão e razões diferentes),
// interlocutores diferentes, e dado sensível nunca vazado.
describe('deterministicFallbackResponse — consult_professional distingue interlocutor e razão (19/10/2026)', () => {
  it('sem opts (comportamento padrão) preserva o texto exato de antes desta correção — nunca regride quem já chama sem o novo parâmetro', () => {
    expect(deterministicFallbackResponse('consult_professional')).toBe(
      'Preciso que você confirme esse ponto antes de eu responder ao cliente, pode revisar a conversa e me dar uma posição?'
    );
  });

  it('professional_self nunca menciona "cliente" (não há cliente nesta troca) quando não há informação faltante confiável', () => {
    const text = deterministicFallbackResponse('consult_professional', { conversationType: 'professional_self', missingInformation: [] });
    expect(text).not.toBeNull();
    expect(text?.toLowerCase()).not.toMatch(/cliente/);
  });

  it('external_inquiry continua mencionando "cliente" quando não há informação faltante confiável (comportamento já existente, preservado)', () => {
    const text = deterministicFallbackResponse('consult_professional', { conversationType: 'external_inquiry', missingInformation: [] });
    expect(text?.toLowerCase()).toMatch(/cliente/);
  });

  it('informação faltante que NÃO bloqueia a decisão (blocksProfessionalDecision=false) é ignorada — cai no fallback neutro, nunca vira pergunta', () => {
    const text = deterministicFallbackResponse('consult_professional', {
      conversationType: 'professional_self',
      missingInformation: [{ field: 'cor da camisa do baterista', reason: 'not_yet_provided', blocksProfessionalDecision: false }],
    });
    // Mesmo texto do caso "sem informação faltante confiável" — prova
    // que o campo irrelevante não influenciou a frase.
    expect(text).toBe(deterministicFallbackResponse('consult_professional', { conversationType: 'professional_self', missingInformation: [] }));
  });

  it('razão "unavailable" nunca pede pra fornecer de novo algo que já existe — distingue de "not_yet_provided"', () => {
    const text = deterministicFallbackResponse('consult_professional', {
      conversationType: 'professional_self',
      missingInformation: [{ field: 'qualquer coisa', reason: 'unavailable', blocksProfessionalDecision: true }],
    });
    expect(text).toMatch(/não consegui acessar/);
    expect(text).not.toMatch(/me passe de novo|forneça novamente/i);
  });

  it('razão "not_yet_provided" varia da razão "unavailable" (textos diferentes pra razões diferentes)', () => {
    const unavailable = deterministicFallbackResponse('consult_professional', {
      conversationType: 'professional_self',
      missingInformation: [{ field: 'x', reason: 'unavailable', blocksProfessionalDecision: true }],
    });
    const notYetProvided = deterministicFallbackResponse('consult_professional', {
      conversationType: 'professional_self',
      missingInformation: [{ field: 'x', reason: 'not_yet_provided', blocksProfessionalDecision: true }],
    });
    expect(unavailable).not.toBe(notYetProvided);
  });

  it('múltiplas informações faltantes com a MESMA razão ainda produzem a frase específica dessa razão (não degrada pro neutro só por ter mais de uma)', () => {
    const text = deterministicFallbackResponse('consult_professional', {
      conversationType: 'professional_self',
      missingInformation: [
        { field: 'a', reason: 'not_yet_provided', blocksProfessionalDecision: true },
        { field: 'b', reason: 'not_yet_provided', blocksProfessionalDecision: true },
      ],
    });
    expect(text).toBe(
      deterministicFallbackResponse('consult_professional', {
        conversationType: 'professional_self',
        missingInformation: [{ field: 'a', reason: 'not_yet_provided', blocksProfessionalDecision: true }],
      })
    );
  });

  it('múltiplas informações faltantes com razões DIFERENTES caem no fallback neutro (nunca tenta combinar duas frases numa só)', () => {
    const text = deterministicFallbackResponse('consult_professional', {
      conversationType: 'professional_self',
      missingInformation: [
        { field: 'a', reason: 'not_yet_provided', blocksProfessionalDecision: true },
        { field: 'b', reason: 'unavailable', blocksProfessionalDecision: true },
      ],
    });
    expect(text).toBe('Preciso que você confirme esse ponto antes de eu seguir.');
  });

  it('razão "not_allowed" (falta de autorização) cai no fallback neutro — nunca expõe o motivo técnico do bloqueio', () => {
    const text = deterministicFallbackResponse('consult_professional', {
      conversationType: 'professional_self',
      missingInformation: [{ field: 'dado restrito', reason: 'not_allowed', blocksProfessionalDecision: true }],
    });
    expect(text).toBe('Preciso que você confirme esse ponto antes de eu seguir.');
  });

  it('nunca interpola o valor livre de "field", mesmo quando ele contém algo que pareceria sensível', () => {
    const text = deterministicFallbackResponse('consult_professional', {
      conversationType: 'professional_self',
      missingInformation: [{ field: 'CPF 123.456.789-00 do contratante', reason: 'not_yet_provided', blocksProfessionalDecision: true }],
    });
    expect(text).not.toMatch(/123\.456\.789-00/);
    expect(text).not.toMatch(/CPF/);
  });
});

// Achado real (19/10/2026, validação integrada identidade+fallback,
// golden-suite real contra o model): resolveResponsePlan forçava
// consult_professional pra decisão comercial protegida só quando o
// model escolhia answer_with_known_information — acknowledge e
// clarify_ambiguity passavam direto, sem revisão exigida, mesmo com
// requiresProfessionalDecision=true. Estes testes travam a correção
// (mesma condição decisionNeedsReview, estendida aos 3 planos) e
// provam que os casos que NÃO deveriam mudar continuam intocados.
describe('resolveResponsePlan — piso de decisão protegida cobre acknowledge/clarify_ambiguity, não só answer_with_known_information (achado real, 19/10/2026)', () => {
  const BASE: ResponsePlanFloorInput = {
    modelPlan: 'acknowledge',
    classificationStatus: 'classified',
    effectiveConfidence: 'high',
    requiresProfessionalDecision: true,
    professionalDecisionSignal: 'none',
    triggerHasUsableText: true,
    evidenceUsedCount: 1,
  };

  it('acknowledge + decisão protegida -> força consult_professional (achado real: antes passava direto)', () => {
    expect(resolveResponsePlan({ ...BASE, modelPlan: 'acknowledge' })).toBe('consult_professional');
  });

  it('clarify_ambiguity (escolha do próprio model, classificação confiável) + decisão protegida -> força consult_professional', () => {
    expect(resolveResponsePlan({ ...BASE, modelPlan: 'clarify_ambiguity' })).toBe('consult_professional');
  });

  it('acknowledge SEM decisão protegida -> continua acknowledge (nunca superconservador à toa)', () => {
    expect(resolveResponsePlan({ ...BASE, modelPlan: 'acknowledge', requiresProfessionalDecision: false })).toBe('acknowledge');
  });

  it('acknowledge + decisão protegida, mas professionalDecisionSignal=candidate_contextual (a própria profissional decidindo agora) -> continua acknowledge', () => {
    expect(resolveResponsePlan({ ...BASE, modelPlan: 'acknowledge', professionalDecisionSignal: 'candidate_contextual' })).toBe('acknowledge');
  });

  it('clarify_ambiguity do PISO de classificação não confiável (nunca passa pelo model) continua intocado, independente de requiresProfessionalDecision', () => {
    expect(resolveResponsePlan({ ...BASE, modelPlan: 'answer_with_known_information', effectiveConfidence: 'low', requiresProfessionalDecision: true })).toBe('clarify_ambiguity');
  });

  it('ask_external_participant + decisão protegida -> nunca forçado pra consult_professional (pedir dado ao cliente é ortogonal)', () => {
    expect(resolveResponsePlan({ ...BASE, modelPlan: 'ask_external_participant' })).toBe('ask_external_participant');
  });

  it('answer_with_known_information continua caindo pelos dois motivos de sempre (sem evidência OU decisão protegida)', () => {
    expect(resolveResponsePlan({ ...BASE, modelPlan: 'answer_with_known_information', evidenceUsedCount: 0, requiresProfessionalDecision: false })).toBe('consult_professional');
    expect(resolveResponsePlan({ ...BASE, modelPlan: 'answer_with_known_information', evidenceUsedCount: 1, requiresProfessionalDecision: true })).toBe('consult_professional');
  });
});
