import type { ResolutionContextV1 } from './canonicalize';

// Doopla Intelligence Core v1 — Bloco 5: golden suite semântica do
// Approval Resolver. Mesmo raciocínio das golden suites do Classifier
// e do Planner: não é teste de engenharia (isso é coberto pelos testes
// determinísticos com model call simulado, ver scratchpad) — é a lista
// de casos representativos pra rodar contra o model de verdade, hoje
// só em Preview (ver src/app/dev/approval-golden-suite/).
//
// Cada caso já é um ResolutionContextV1 sintético completo — não passa
// por buildResolutionContext() nem toca supabase (prova estrutural:
// resolveApproval() nunca importa @supabase/*). O closed-candidate-
// selection principle é testável diretamente aqui: o caso "sem
// candidato correspondente" prova que o resolver não inventa
// referência fora do que foi enumerado.

export type ApprovalGoldenSuiteCase = {
  name: string;
  category: string;
  context: ResolutionContextV1;
  professionalStatementText: string; // só documentação — o texto real já está em messageWindow
  expectedOutcome: 'resolved' | 'inconclusive';
  expectedOperationType?: 'contextual_decision' | 'explicit_decision' | 'counterproposal' | 'revocation' | 'professional_initiated';
  note?: string;
};

function ctx(overrides: Partial<ResolutionContextV1>): ResolutionContextV1 {
  return {
    contextSchemaVersion: 'v1',
    professionalId: 'golden-prof',
    commercialRootId: 'golden-root',
    messageWindow: [],
    activeApprovalCandidates: [],
    communicatedProposalCandidates: [],
    structuralFacts: { bookingStatus: 'proposta_enviada' },
    ...overrides,
  };
}

export const APPROVAL_GOLDEN_SUITE_CASES: ApprovalGoldenSuiteCase[] = [
  {
    name: 'confirmação direta de proposta comunicada — "Pode."',
    category: 'contextual_decision',
    professionalStatementText: 'Pode.',
    context: ctx({
      messageWindow: [
        { messageId: 'gm-1', authorType: 'external_participant', contentDigest: 'd1' },
        { messageId: 'gm-2', authorType: 'professional', contentDigest: 'd2' },
      ],
      communicatedProposalCandidates: [
        {
          candidateId: 'gc-1',
          decisionCategory: 'price_or_cache',
          subjectKey: 'primary',
          proposedBy: 'external_participant',
          sourceMessageId: 'gm-1',
          proposedValue: { amountCents: 250000 },
        },
      ],
    }),
    expectedOutcome: 'resolved',
    expectedOperationType: 'contextual_decision',
    note: 'exemplo canônico da spec (R$2.500/"Pode.") — único candidato aberto, referência inequívoca',
  },
  {
    name: 'sem candidato correspondente — nunca inventa referência',
    category: 'no_match',
    professionalStatementText: 'Fechado.',
    context: ctx({
      messageWindow: [{ messageId: 'gm-3', authorType: 'professional', contentDigest: 'd3' }],
      communicatedProposalCandidates: [],
      activeApprovalCandidates: [],
    }),
    expectedOutcome: 'inconclusive',
    note: 'closed-candidate-selection principle: sem candidato algum no contexto, o resolver não pode inventar um — precisa retornar inconclusive',
  },
  {
    name: 'duas propostas concorrentes plausíveis — ambiguidade genuína',
    category: 'ambiguous',
    professionalStatementText: 'Fechado nesse valor.',
    context: ctx({
      messageWindow: [{ messageId: 'gm-4', authorType: 'professional', contentDigest: 'd4' }],
      communicatedProposalCandidates: [
        { candidateId: 'gc-2', decisionCategory: 'price_or_cache', subjectKey: 'primary', proposedBy: 'external_participant', sourceMessageId: 'gm-5', proposedValue: { amountCents: 250000 } },
        { candidateId: 'gc-3', decisionCategory: 'price_or_cache', subjectKey: 'primary', proposedBy: 'professional', sourceMessageId: 'gm-6', proposedValue: { amountCents: 280000 } },
      ],
    }),
    expectedOutcome: 'inconclusive',
    note: 'dois candidatos plausíveis pra mesma chain, nenhum sinal de qual — fail-closed, nunca escolhe por suposição',
  },
  {
    name: 'decisão iniciada pelo profissional, sem candidato externo (Gate 2)',
    category: 'professional_initiated',
    professionalStatementText: 'Nesse trabalho quero cobrar mais R$300 de deslocamento.',
    context: ctx({
      messageWindow: [{ messageId: 'gm-7', authorType: 'professional', contentDigest: 'd7' }],
      communicatedProposalCandidates: [],
    }),
    expectedOutcome: 'resolved',
    expectedOperationType: 'professional_initiated',
    note: 'autocontida — nunca exige communicatedProposalMessageIds (CHECK simétrico na migration 0045)',
  },
  {
    name: 'revogação explícita de decisão anterior',
    category: 'revocation',
    professionalStatementText: 'Na verdade, cancela esse desconto que eu tinha aceitado.',
    context: ctx({
      messageWindow: [{ messageId: 'gm-8', authorType: 'professional', contentDigest: 'd8' }],
      activeApprovalCandidates: [{ approvalRecordId: 'ga-1', decisionCategory: 'discount', subjectKey: 'primary', approvedValue: { amountCents: 20000 }, version: 1 }],
    }),
    expectedOutcome: 'resolved',
    expectedOperationType: 'revocation',
    note: 'approvedValue precisa vir null (CHECK simétrico: revocation exige approved_value null)',
  },
  {
    name: 'contraproposta sobre proposta comunicada',
    category: 'counterproposal',
    professionalStatementText: 'Não consigo por R$2.500, fecho por R$2.800.',
    context: ctx({
      messageWindow: [{ messageId: 'gm-9', authorType: 'professional', contentDigest: 'd9' }],
      communicatedProposalCandidates: [
        { candidateId: 'gc-4', decisionCategory: 'price_or_cache', subjectKey: 'primary', proposedBy: 'external_participant', sourceMessageId: 'gm-10', proposedValue: { amountCents: 250000 } },
      ],
    }),
    expectedOutcome: 'resolved',
    expectedOperationType: 'counterproposal',
  },
];
