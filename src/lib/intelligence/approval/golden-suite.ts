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

// messageContents: conteúdo legível pro model (achado real desta
// rodada — antes desta correção, o resolver só via contentDigest, um
// hash opaco, nunca o texto). Cada caso abaixo passa exatamente o
// texto documentado em professionalStatementText — nunca um
// placeholder.
function ctx(overrides: Partial<ResolutionContextV1>): ResolutionContextV1 {
  return {
    contextSchemaVersion: 'v1',
    professionalId: 'golden-prof',
    commercialRootId: 'golden-root',
    messageWindow: [],
    activeApprovalCandidates: [],
    communicatedProposalCandidates: [],
    structuralFacts: { bookingStatus: 'proposta_enviada' },
    messageContents: [],
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
      messageContents: [
        { messageId: 'gm-1', usableText: 'Consegue fazer por R$2.500?' },
        { messageId: 'gm-2', usableText: 'Pode.' },
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
      messageContents: [{ messageId: 'gm-3', usableText: 'Fechado.' }],
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
      messageContents: [{ messageId: 'gm-4', usableText: 'Fechado nesse valor.' }],
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
      messageContents: [{ messageId: 'gm-7', usableText: 'Nesse trabalho quero cobrar mais R$300 de deslocamento.' }],
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
      messageContents: [{ messageId: 'gm-8', usableText: 'Na verdade, cancela esse desconto que eu tinha aceitado.' }],
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
      messageContents: [{ messageId: 'gm-9', usableText: 'Não consigo por R$2.500, fecho por R$2.800.' }],
      communicatedProposalCandidates: [
        { candidateId: 'gc-4', decisionCategory: 'price_or_cache', subjectKey: 'primary', proposedBy: 'external_participant', sourceMessageId: 'gm-10', proposedValue: { amountCents: 250000 } },
      ],
    }),
    expectedOutcome: 'resolved',
    expectedOperationType: 'counterproposal',
  },

  // ============================================================
  // Casos adversariais: decisão autocontida vs. mera menção (achado
  // real do smoke test — "Pode fechar por R$3000!" nunca resolvia,
  // porque o resolver nunca via o texto de verdade; ver
  // messageContents em canonicalize.ts). Cada caso abaixo só é
  // testável de forma confiável AGORA que o model recebe o texto
  // legível — antes desta correção, nenhum destes casos provava nada
  // sobre o julgamento real do model.
  // ============================================================
  {
    name: 'decisão autocontida, frase soa como resposta — "Pode fechar por R$3.000."',
    category: 'professional_initiated',
    professionalStatementText: 'Pode fechar por R$3.000.',
    context: ctx({
      messageWindow: [{ messageId: 'gm-11', authorType: 'professional', contentDigest: 'd11' }],
      messageContents: [{ messageId: 'gm-11', usableText: 'Pode fechar por R$3.000.' }],
      communicatedProposalCandidates: [],
    }),
    expectedOutcome: 'resolved',
    expectedOperationType: 'professional_initiated',
    note: 'achado real do smoke test — declaração autocontida mesmo soando como confirmação; sem candidato pra confirmar, precisa resolver sozinha',
  },
  {
    name: 'decisão autocontida, frase soa como resposta — "Fecha em R$3.000 então."',
    category: 'professional_initiated',
    professionalStatementText: 'Fecha em R$3.000 então.',
    context: ctx({
      messageWindow: [{ messageId: 'gm-12', authorType: 'professional', contentDigest: 'd12' }],
      messageContents: [{ messageId: 'gm-12', usableText: 'Fecha em R$3.000 então.' }],
      communicatedProposalCandidates: [],
    }),
    expectedOutcome: 'resolved',
    expectedOperationType: 'professional_initiated',
  },
  {
    name: 'mera avaliação de valor, não é decisão — "R$3.000 é pouco."',
    category: 'mention_not_decision',
    professionalStatementText: 'R$3.000 é pouco.',
    context: ctx({
      messageWindow: [{ messageId: 'gm-13', authorType: 'professional', contentDigest: 'd13' }],
      messageContents: [{ messageId: 'gm-13', usableText: 'R$3.000 é pouco.' }],
      communicatedProposalCandidates: [],
    }),
    expectedOutcome: 'inconclusive',
    note: 'comenta um valor, não decide nada — NUNCA vira professional_initiated',
  },
  {
    name: 'pergunta sobre valor, não é decisão — "Ele ofereceu R$3.000?"',
    category: 'mention_not_decision',
    professionalStatementText: 'Ele ofereceu R$3.000?',
    context: ctx({
      messageWindow: [{ messageId: 'gm-14', authorType: 'professional', contentDigest: 'd14' }],
      messageContents: [{ messageId: 'gm-14', usableText: 'Ele ofereceu R$3.000?' }],
      communicatedProposalCandidates: [],
    }),
    expectedOutcome: 'inconclusive',
    note: 'pergunta, não afirma decisão nenhuma',
  },
  {
    name: 'descrição de hábito, não é decisão pra este trabalho — "Normalmente cobro R$3.000."',
    category: 'mention_not_decision',
    professionalStatementText: 'Normalmente cobro R$3.000.',
    context: ctx({
      messageWindow: [{ messageId: 'gm-15', authorType: 'professional', contentDigest: 'd15' }],
      messageContents: [{ messageId: 'gm-15', usableText: 'Normalmente cobro R$3.000.' }],
      communicatedProposalCandidates: [],
    }),
    expectedOutcome: 'inconclusive',
    note: 'descreve um padrão geral, nunca decide o valor deste commercial root específico',
  },
  {
    name: 'valor incerto, não é decisão — "Talvez R$3.000."',
    category: 'mention_not_decision',
    professionalStatementText: 'Talvez R$3.000.',
    context: ctx({
      messageWindow: [{ messageId: 'gm-16', authorType: 'professional', contentDigest: 'd16' }],
      messageContents: [{ messageId: 'gm-16', usableText: 'Talvez R$3.000.' }],
      communicatedProposalCandidates: [],
    }),
    expectedOutcome: 'inconclusive',
    note: 'incerteza explícita — nunca vira decisão inequívoca',
  },
  {
    name: 'referente ausente do contexto — "Pode usar aquele valor combinado."',
    category: 'no_match',
    professionalStatementText: 'Pode usar aquele valor combinado.',
    context: ctx({
      messageWindow: [{ messageId: 'gm-17', authorType: 'professional', contentDigest: 'd17' }],
      messageContents: [{ messageId: 'gm-17', usableText: 'Pode usar aquele valor combinado.' }],
      communicatedProposalCandidates: [],
    }),
    expectedOutcome: 'inconclusive',
    note: 'depende de um "valor combinado" que não está no ResolutionContext fornecido — closed-candidate-selection principle, nunca inventa o referente',
  },
  {
    name: 'aceite curto sem referente inequívoco — "Pode."',
    category: 'no_match',
    professionalStatementText: 'Pode.',
    context: ctx({
      messageWindow: [{ messageId: 'gm-18', authorType: 'professional', contentDigest: 'd18' }],
      messageContents: [{ messageId: 'gm-18', usableText: 'Pode.' }],
      communicatedProposalCandidates: [],
    }),
    expectedOutcome: 'inconclusive',
    note: 'aceite curto SEM candidato algum pra confirmar — nunca vira professional_initiated sozinho (não carrega valor/condição própria); a instrução do resolver exige referente inequívoco pra este tipo de frase',
  },

  // ============================================================
  // Achado real do smoke test 3b (auditoria do fechamento do passo 3):
  // a frase "Pode fechar por R$3.000." resolvia sozinha (caso acima),
  // mas continuava inconclusive no pipeline real — porque o
  // messageWindow real SEMPRE tem a pergunta do cliente logo antes
  // ("quanto custa...?"), nunca a frase isolada. Nenhum caso anterior
  // reproduzia esse formato de 2 mensagens (pergunta sem valor +
  // resposta decisiva). Este caso reproduz fielmente a forma real do
  // contexto (mesmas 2 mensagens, mesmos textos, structuralFacts de
  // opportunity — não booking) pra provar a correção antes de pedir
  // outro smoke test real.
  // ============================================================
  {
    name: 'pergunta do cliente + resposta decisiva do profissional (formato real do smoke test 3b)',
    category: 'professional_initiated',
    professionalStatementText: 'Pode fechar por R$3.000.',
    context: ctx({
      structuralFacts: { opportunityStatus: 'novo' },
      messageWindow: [
        { messageId: 'gm-19', authorType: 'external_participant', contentDigest: 'd19' },
        { messageId: 'gm-20', authorType: 'professional', contentDigest: 'd20' },
      ],
      messageContents: [
        { messageId: 'gm-19', usableText: 'oi, quanto custa tocar no meu casamento 20/12?' },
        { messageId: 'gm-20', usableText: 'Pode fechar por R$3.000.' },
      ],
      communicatedProposalCandidates: [],
    }),
    expectedOutcome: 'resolved',
    expectedOperationType: 'professional_initiated',
    note: 'reproduz o formato real do smoke test 3b — pergunta do cliente (sem valor, nunca vira candidato) seguida da resposta decisiva do profissional; ainda autocontida, nunca inconclusive só por ter uma pergunta antes',
  },
];
