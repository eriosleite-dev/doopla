import type { ProfessionalDecisionCategory } from '../planner/decision-categories';

// Doopla Intelligence Core v1 — extrator de proposta inbound: golden
// suite semântica. Mesmo raciocínio das outras golden suites deste
// projeto: não é teste de engenharia (isso é o determinístico com
// model call simulado) — é a lista de casos representativos pensada
// pra rodar contra o model de verdade, hoje só em Preview.
//
// Cada caso testa a REGRA DE PROVENANCE do usuário diretamente: o
// valor precisa estar literal na mensagem, contexto nunca completa.
export type InboundProposalGoldenSuiteCase = {
  name: string;
  messageText: string;
  expectedProposals: Array<{ decisionCategory: ProfessionalDecisionCategory; subjectKey?: string }>;
  note?: string;
};

export const INBOUND_PROPOSAL_GOLDEN_SUITE_CASES: InboundProposalGoldenSuiteCase[] = [
  {
    name: 'proposta interrogativa com valor literal — preço',
    messageText: 'Consegue fazer por R$2.400?',
    expectedProposals: [{ decisionCategory: 'price_or_cache' }],
    note: 'exemplo literal do usuário — interrogativo conta, o valor está na própria mensagem',
  },
  {
    name: 'pergunta SEM valor — nunca produz proposta',
    messageText: 'Qual seu valor pra esse tipo de evento?',
    expectedProposals: [],
    note: 'pede um valor, não afirma um — regra do usuário',
  },
  {
    name: 'confirmação curta sem valor restatado — nunca produz proposta',
    messageText: 'Sim, pode ser.',
    expectedProposals: [],
    note: '"sim"/"pode" nunca criam candidato, mesmo soando como confirmação — regra explícita do usuário',
  },
  {
    name: 'confirmação "fechado" isolada — nunca produz proposta',
    messageText: 'Fechado!',
    expectedProposals: [],
  },
  {
    name: 'afirmação direta com valor literal — duração',
    messageText: 'Precisamos de 5 horas de evento.',
    expectedProposals: [{ decisionCategory: 'duration_change' }],
  },
  {
    name: 'proposta com subject_key explícito no próprio texto — logística',
    messageText: 'Vocês cobrem o transporte também?',
    expectedProposals: [],
    note: 'pergunta sem valor concreto (não afirma se cobre ou não) — nunca proposta',
  },
  {
    name: 'afirmação de logística com valor concreto no texto',
    messageText: 'Consigo pagar até R$300 de transporte pra vocês.',
    expectedProposals: [{ decisionCategory: 'logistics_commitment', subjectKey: 'transport' }],
  },
  {
    name: 'data relativa resolvível por closed-candidate-selection',
    messageText: 'Consegue sábado?',
    expectedProposals: [{ decisionCategory: 'date_change' }],
    note: 'closed-candidate-selection — precisa resolver via temporalCandidateLabel, nunca calcular sozinho',
  },
  {
    name: 'mensagem social, sem nenhuma proposta',
    messageText: 'Oi! Tudo bem?',
    expectedProposals: [],
  },
];
