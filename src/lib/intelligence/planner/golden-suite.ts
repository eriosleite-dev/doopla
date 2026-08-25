import type { ConversationMessageAuthorType } from '@/lib/supabase/types';
import type { CommitmentNature, ProfessionalDecisionSignal } from './types';
import type { ResponsePlan } from './response-plan';

// Doopla Intelligence Core v1 — Bloco 4: golden suite semântica do
// Response Planner. Mesmo raciocínio da golden suite do Classifier
// (classification/golden-suite.ts): não é teste de engenharia (isso é
// coberto por testes com model call simulado) — é a lista de casos
// representativos pensada pra rodar contra o model de verdade, hoje
// só em Preview (ver src/app/dev/planner-golden-suite/).
//
// Cada caso já inclui o setup sintético de fatos/mensagens anteriores
// necessário — não fabrica um IntentClassification à mão, ele roda de
// verdade (classifyIntent -> planResponse), então o caso precisa fazer
// sentido também pro Classifier.
export type PlannerGoldenSuiteCase = {
  name: string;
  category: string;
  input: string;
  triggerAuthorType?: ConversationMessageAuthorType; // default 'external_participant'
  previousMessages?: Array<{ authorType: ConversationMessageAuthorType; text: string }>;
  bookingFacts?: Record<string, string | number | boolean>;
  opportunityFacts?: Record<string, string | number | boolean>;
  expectedCommitmentNature?: CommitmentNature;
  expectedRequiresProfessionalDecision?: boolean;
  expectedResponsePlanFamily: ResponsePlan[]; // qualquer um destes conta como PASS
  expectedProfessionalDecisionSignal?: ProfessionalDecisionSignal;
  note?: string;
};

export const GOLDEN_SUITE_CASES: PlannerGoldenSuiteCase[] = [
  {
    name: 'relato de fato existente — valor',
    category: 'report_existing_fact',
    input: 'Qual foi mesmo o valor combinado?',
    bookingFacts: { status: 'confirmed', cacheAmountCents: 300000, eventDate: '2026-09-12', eventLocation: 'Espaço Villa, São Paulo' },
    expectedCommitmentNature: 'report_existing_fact',
    expectedRequiresProfessionalDecision: false,
    expectedResponsePlanFamily: ['answer_with_known_information'],
    note: 'booking já existe com o valor — isso é recuperar um fato, nunca uma decisão nova',
  },
  {
    name: 'relato de fato existente — endereço',
    category: 'report_existing_fact',
    input: 'Qual endereço ficou combinado mesmo?',
    bookingFacts: { status: 'confirmed', cacheAmountCents: 300000, eventDate: '2026-09-12', eventLocation: 'Espaço Villa, São Paulo' },
    expectedCommitmentNature: 'report_existing_fact',
    expectedRequiresProfessionalDecision: false,
    expectedResponsePlanFamily: ['answer_with_known_information'],
  },
  {
    name: 'novo compromisso — desconto',
    category: 'new_or_changed_commitment',
    input: 'Pode fazer por R$2.500?',
    bookingFacts: { status: 'confirmed', cacheAmountCents: 300000, eventDate: '2026-09-12', eventLocation: 'Espaço Villa, São Paulo' },
    expectedCommitmentNature: 'new_or_changed_commitment',
    expectedRequiresProfessionalDecision: true,
    expectedResponsePlanFamily: ['consult_professional', 'ask_external_participant'],
    note: 'nunca answer_with_known_information — pedir desconto é sempre negociação nova, mesmo com o valor atual conhecido',
  },
  {
    name: 'novo compromisso — mudança de endereço',
    category: 'new_or_changed_commitment',
    input: 'Dá pra mudar o evento pra outro endereço, bem mais longe do combinado?',
    bookingFacts: { status: 'confirmed', cacheAmountCents: 300000, eventDate: '2026-09-12', eventLocation: 'Espaço Villa, São Paulo' },
    expectedCommitmentNature: 'new_or_changed_commitment',
    expectedRequiresProfessionalDecision: true,
    expectedResponsePlanFamily: ['consult_professional', 'ask_external_participant'],
    note: 'mudança de local que compromete o profissional (distância maior) — nunca resolvido sozinho, mesmo sendo tecnicamente "logistica"',
  },
  {
    name: 'social — bom dia',
    category: 'acknowledge',
    input: 'Bom dia! Tudo bem?',
    expectedRequiresProfessionalDecision: false,
    expectedResponsePlanFamily: ['acknowledge'],
    note: 'nunca no_response_needed — mensagem social/humana sempre merece reação',
  },
  {
    name: 'profissional relata fato novo',
    category: 'acknowledge',
    input: 'Fechei um trabalho sábado.',
    triggerAuthorType: 'professional',
    expectedResponsePlanFamily: ['acknowledge'],
    note: 'notícia, não pergunta — reação curta, sem consulta a si mesmo',
  },
  {
    name: 'profissional confirma com contexto forte',
    category: 'professionalDecisionSignal',
    input: 'Fechado',
    triggerAuthorType: 'professional',
    previousMessages: [
      { authorType: 'external_participant', text: 'Consegue fazer o show da Nike dia 12, por R$3.000?' },
    ],
    bookingFacts: {},
    expectedProfessionalDecisionSignal: 'candidate_contextual',
    expectedResponsePlanFamily: ['acknowledge', 'consult_professional'],
    note: 'candidate_contextual nunca é aprovação — só sinal; nenhum plano deste bloco pode representar execução/aprovação',
  },
  {
    name: 'profissional confirma sem referente',
    category: 'professionalDecisionSignal',
    input: 'Fechado',
    triggerAuthorType: 'professional',
    expectedProfessionalDecisionSignal: 'candidate_ambiguous',
    expectedResponsePlanFamily: ['clarify_ambiguity'],
    note: 'sem proposta específica no contexto recente — nunca um "candidate_contextual" de graça',
  },
  {
    name: 'controle — fato interno nunca vira autorizado pra envio',
    category: 'requiresProfessionalReviewBeforeSend',
    input: 'Qual o telefone desse cliente mesmo?',
    expectedResponsePlanFamily: ['answer_with_known_information', 'consult_professional', 'ask_external_participant', 'clarify_ambiguity', 'acknowledge'],
    note: 'qualquer que seja o plano, requiresProfessionalReviewBeforeSend precisa continuar true — esta é a invariante que este caso audita, não o plano em si',
  },
];
