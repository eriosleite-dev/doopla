import { beforeEach, describe, expect, it, vi } from 'vitest';

// Task #72 — fluxo de confirmação de memória de preferências. Mesma
// disciplina de conversation-feedback.ts/professional-self-pause: as
// dependências (persistência, envio, flag) são mockadas no nível de
// módulo — a lógica de decisão real (proposeMemory/reviewMemory) já é
// pura e testada em memory-policy.test.ts, e os recognizers aceitam
// modelCall injetado — este arquivo testa só a ORQUESTRAÇÃO (quando
// cada ramo dispara, quando handled é true/false).

const flagState = { enabled: true };
vi.mock('./app-settings', () => ({ readAppSettingFlag: vi.fn(async () => flagState.enabled) }));

const lastAiMessageState: { value: { id: string; text: string | null } | null } = { value: null };
vi.mock('./recent-conversation-messages', () => ({ fetchLastAiMessage: vi.fn(async () => lastAiMessageState.value) }));

const pendingProposalState: { value: unknown | null } = { value: null };
// vi.mock é hoisted pro topo do arquivo — qualquer vi.fn() referenciado
// de dentro da factory precisa vir de vi.hoisted(), nunca de um const
// solto declarado depois (dá ReferenceError de inicialização).
const { persistProposedMemory, persistMemoryReview, persistAiMessage, sendProfessionalSelfReplyViaWhatsapp } = vi.hoisted(() => ({
  persistProposedMemory: vi.fn(async (_supabase: unknown, memory: unknown) => memory),
  persistMemoryReview: vi.fn(async (_supabase: unknown, params: unknown) => params),
  persistAiMessage: vi.fn(async (_supabase: unknown, params: { body: string }) => ({ id: 'ai-msg-1', body: params.body })),
  sendProfessionalSelfReplyViaWhatsapp: vi.fn(async () => {}),
}));
vi.mock('./professional-memories', () => ({
  getMostRecentProposedMemory: vi.fn(async () => pendingProposalState.value),
  persistProposedMemory,
  persistMemoryReview,
}));
vi.mock('./professional-message', () => ({ persistAiMessage }));
vi.mock('./professional-whatsapp-reply', () => ({ sendProfessionalSelfReplyViaWhatsapp }));

vi.mock('../intelligence/observability', () => ({ logAiUsageEvent: vi.fn(async () => {}) }));

import { buildMemoryConfirmationQuestion } from '../intelligence/learning/memory-policy';
import { runMemoryConfirmationFlow } from './memory-confirmation-flow';

const supabase = {} as never;

const baseParams = {
  professionalId: 'prof-1',
  conversationId: 'conv-1',
  triggerMessageId: 'msg-1',
  channel: 'whatsapp',
};

beforeEach(() => {
  vi.clearAllMocks();
  flagState.enabled = true;
  lastAiMessageState.value = null;
  pendingProposalState.value = null;
});

describe('runMemoryConfirmationFlow', () => {
  it('flag desligada: handled=false, nenhum recognizer chamado', async () => {
    flagState.enabled = false;
    const result = await runMemoryConfirmationFlow(supabase, { ...baseParams, messageText: 'Eu sempre prefiro contratos de 2h.' });
    expect(result.handled).toBe(false);
    expect(persistProposedMemory).not.toHaveBeenCalled();
  });

  it('declaração nova reconhecida: propõe memória e envia a pergunta de confirmação', async () => {
    const result = await runMemoryConfirmationFlow(
      supabase,
      { ...baseParams, messageText: 'Eu sempre prefiro contratos de 2h.' },
      { declarationRecognizerModelCall: async () => ({ parsed: { recognized: true, kind: 'operational_preference', value: 'prefere contratos de 2h', confidence: 0.9, subjectKey: null }, inputTokens: 1, outputTokens: 1 }) }
    );
    expect(result.handled).toBe(true);
    expect(persistProposedMemory).toHaveBeenCalledTimes(1);
    expect(persistAiMessage).toHaveBeenCalledWith(supabase, { conversationId: 'conv-1', contentType: 'text', body: buildMemoryConfirmationQuestion('prefere contratos de 2h') });
    expect(sendProfessionalSelfReplyViaWhatsapp).toHaveBeenCalledTimes(1);
  });

  it('nenhuma declaração reconhecida: handled=false, nada persistido/enviado', async () => {
    const result = await runMemoryConfirmationFlow(
      supabase,
      { ...baseParams, messageText: 'Qual o status do booking de sábado?' },
      { declarationRecognizerModelCall: async () => ({ parsed: { recognized: false, kind: null, value: null, confidence: null, subjectKey: null }, inputTokens: 1, outputTokens: 1 }) }
    );
    expect(result.handled).toBe(false);
    expect(persistProposedMemory).not.toHaveBeenCalled();
    expect(persistAiMessage).not.toHaveBeenCalled();
  });

  it('proposta pendente existe, MAS última mensagem de IA não é a pergunta desta proposta — nunca trata como confirmação (lição do ADR 0010), cai no Ramo 2', async () => {
    pendingProposalState.value = { id: 'mem-1', professionalId: 'prof-1', kind: 'operational_preference', value: 'prefere contratos de 2h', status: 'proposed' };
    lastAiMessageState.value = { id: 'ai-0', text: 'Perfeito, já confirmei o booking de sábado.' };

    const result = await runMemoryConfirmationFlow(
      supabase,
      { ...baseParams, messageText: 'sim' },
      { declarationRecognizerModelCall: async () => ({ parsed: { recognized: false, kind: null, value: null, confidence: null, subjectKey: null }, inputTokens: 1, outputTokens: 1 }) }
    );

    expect(persistMemoryReview).not.toHaveBeenCalled();
    expect(result.handled).toBe(false);
  });

  it('proposta pendente + última mensagem de IA bate com a pergunta desta proposta + resposta confirma: aprova e confirma por mensagem', async () => {
    pendingProposalState.value = {
      id: 'mem-1',
      professionalId: 'prof-1',
      kind: 'operational_preference',
      value: 'prefere contratos de 2h',
      status: 'proposed',
      createdAt: '2026-10-20T10:00:00.000Z',
      evidence: { sourceType: 'professional_message', sourceId: 'msg-0' },
      confidence: 0.9,
      reviewedAt: null,
      reviewedBy: null,
      expiresAt: null,
    };
    lastAiMessageState.value = { id: 'ai-0', text: buildMemoryConfirmationQuestion('prefere contratos de 2h') };

    const result = await runMemoryConfirmationFlow(supabase, { ...baseParams, messageText: 'sim, pode guardar' }, { confirmationRecognizerModelCall: async () => ({ parsed: { decision: 'confirms' }, inputTokens: 1, outputTokens: 1 }) });

    expect(result.handled).toBe(true);
    expect(persistMemoryReview).toHaveBeenCalledWith(supabase, expect.objectContaining({ id: 'mem-1', decision: 'approved' }));
    expect(persistAiMessage).toHaveBeenCalledWith(supabase, { conversationId: 'conv-1', contentType: 'text', body: 'Combinado, vou levar isso em conta daqui pra frente.' });
  });

  it('proposta pendente + continuidade real + resposta rejeita: marca rejected, nunca approved', async () => {
    pendingProposalState.value = {
      id: 'mem-1',
      professionalId: 'prof-1',
      kind: 'operational_preference',
      value: 'prefere contratos de 2h',
      status: 'proposed',
      createdAt: '2026-10-20T10:00:00.000Z',
      evidence: { sourceType: 'professional_message', sourceId: 'msg-0' },
      confidence: 0.9,
      reviewedAt: null,
      reviewedBy: null,
      expiresAt: null,
    };
    lastAiMessageState.value = { id: 'ai-0', text: buildMemoryConfirmationQuestion('prefere contratos de 2h') };

    const result = await runMemoryConfirmationFlow(supabase, { ...baseParams, messageText: 'não, não é isso' }, { confirmationRecognizerModelCall: async () => ({ parsed: { decision: 'rejects' }, inputTokens: 1, outputTokens: 1 }) });

    expect(result.handled).toBe(true);
    expect(persistMemoryReview).toHaveBeenCalledWith(supabase, expect.objectContaining({ id: 'mem-1', decision: 'rejected' }));
  });

  it('proposta pendente + continuidade real + resposta ambígua: nunca decide por conta própria, cai no Ramo 2', async () => {
    pendingProposalState.value = {
      id: 'mem-1',
      professionalId: 'prof-1',
      kind: 'operational_preference',
      value: 'prefere contratos de 2h',
      status: 'proposed',
      createdAt: '2026-10-20T10:00:00.000Z',
      evidence: { sourceType: 'professional_message', sourceId: 'msg-0' },
      confidence: 0.9,
      reviewedAt: null,
      reviewedBy: null,
      expiresAt: null,
    };
    lastAiMessageState.value = { id: 'ai-0', text: buildMemoryConfirmationQuestion('prefere contratos de 2h') };

    const result = await runMemoryConfirmationFlow(
      supabase,
      { ...baseParams, messageText: 'aliás, me conta sobre o booking de sábado' },
      {
        confirmationRecognizerModelCall: async () => ({ parsed: { decision: 'ambiguous' }, inputTokens: 1, outputTokens: 1 }),
        declarationRecognizerModelCall: async () => ({ parsed: { recognized: false, kind: null, value: null, confidence: null, subjectKey: null }, inputTokens: 1, outputTokens: 1 }),
      }
    );

    expect(persistMemoryReview).not.toHaveBeenCalled();
    expect(result.handled).toBe(false);
  });

  it('nova declaração chega com uma proposta antiga ainda sem resposta (continuidade não bate): supersede a antiga como rejected, nunca deixa orfanada', async () => {
    pendingProposalState.value = {
      id: 'mem-antiga',
      professionalId: 'prof-1',
      kind: 'communication_style',
      value: 'prefere tom informal',
      status: 'proposed',
      createdAt: '2026-10-19T10:00:00.000Z',
      evidence: { sourceType: 'professional_message', sourceId: 'msg-0' },
      confidence: 0.8,
      reviewedAt: null,
      reviewedBy: null,
      expiresAt: null,
    };
    // Última mensagem de IA NÃO é a pergunta desta proposta antiga —
    // conversa seguiu pra outra coisa, Ramo 1 nunca a reconhece.
    lastAiMessageState.value = { id: 'ai-999', text: 'Perfeito, já confirmei o booking de sábado.' };

    const result = await runMemoryConfirmationFlow(
      supabase,
      { ...baseParams, messageText: 'Eu sempre prefiro contratos de 2h.' },
      { declarationRecognizerModelCall: async () => ({ parsed: { recognized: true, kind: 'operational_preference', value: 'prefere contratos de 2h', confidence: 0.9, subjectKey: null }, inputTokens: 1, outputTokens: 1 }) }
    );

    expect(result.handled).toBe(true);
    expect(persistMemoryReview).toHaveBeenCalledWith(supabase, expect.objectContaining({ id: 'mem-antiga', decision: 'rejected' }));
    expect(persistProposedMemory).toHaveBeenCalledTimes(1);
  });
});
