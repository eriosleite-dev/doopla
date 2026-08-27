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
    // Reescrito no fechamento do Runtime (decisão do usuário):
    // requiresProfessionalReviewBeforeSend deixou de ser um literal
    // `true` incondicional e passou a ser derivado do responsePlan
    // final (resolveRequiresProfessionalReviewBeforeSend, invariants.ts).
    // A checagem de que essa derivação bate exatamente (nunca "sempre
    // true") agora roda pra TODO caso desta suíte, não só neste (ver
    // invariantHolds em src/app/dev/planner-golden-suite/actions.ts) —
    // este caso continua existindo especificamente porque, mesmo
    // resolvendo pra answer_with_known_information ou consult_professional
    // (os únicos dois que continuam exigindo revisão), o dado em jogo
    // (telefone/contato) é sensível o bastante pra nunca virar
    // candidato a auto-send, mesmo sem decisão comercial nenhuma em
    // jogo — golden-suite continua auditando isso de propósito.
    name: 'controle — dado potencialmente sensível continua exigindo revisão',
    category: 'requiresProfessionalReviewBeforeSend',
    input: 'Qual o telefone desse cliente mesmo?',
    expectedResponsePlanFamily: ['answer_with_known_information', 'consult_professional', 'ask_external_participant', 'clarify_ambiguity', 'acknowledge'],
    note: 'a invariante checada é sempre requiresProfessionalReviewBeforeSend === resolveRequiresProfessionalReviewBeforeSend(responsePlan) — nunca "sempre true"; qualquer plano da família passa, contanto que a derivação bata',
  },
  {
    // Caso novo (fechamento do Runtime): demonstra o outro lado da
    // invariante — requiresProfessionalDecision=true no TURNO (intent
    // orcamento sempre ativa accept_or_decline_work/price_or_cache)
    // NÃO implica revisão automática. Se o responsePlan final for
    // ask_external_participant (ainda coletando contexto — data/
    // duração/tipo de evento — antes de valer a pena consultar o
    // profissional, exatamente como prompt.ts já instrui), a pergunta
    // em si não afirma nenhum compromisso e fica elegível a auto-send
    // (auto_send_eligible no Runtime). Só quando o plano final é
    // consult_professional a revisão volta a ser obrigatória.
    name: 'pergunta de coleta em turno de decisão fica elegível a auto-send',
    category: 'requiresProfessionalReviewBeforeSend',
    input: 'Oi! Queria saber quanto custa pra tocar no meu casamento.',
    expectedCommitmentNature: 'new_or_changed_commitment',
    expectedRequiresProfessionalDecision: true,
    expectedResponsePlanFamily: ['ask_external_participant', 'consult_professional'],
    note: 'requiresProfessionalDecision=true não é o sinal usado pra revisão — só o responsePlan final é. ask_external_participant aqui prova que uma pergunta de coleta em pleno turno de decisão pode ser auto-send eligible; consult_professional continua exigindo revisão',
  },

  // ============================================================
  // Rodada de auditoria adversarial (pós-commit ede4a8b) — minimal
  // pairs adicionais READ vs CHANGE, KNOW≠APPROVE≠COMMIT com
  // precedente histórico, coleta corporativa vs. privada, fonte
  // unavailable, e sinal de decisão em tópico errado.
  // ============================================================
  {
    name: 'relato de fato existente — valor (variação "quanto ficou")',
    category: 'report_existing_fact',
    input: 'Quanto ficou mesmo?',
    previousMessages: [{ authorType: 'external_participant', text: 'Sobre o show de sábado...' }],
    bookingFacts: { status: 'confirmed', cacheAmountCents: 300000, eventDate: '2026-09-12' },
    expectedCommitmentNature: 'report_existing_fact',
    expectedRequiresProfessionalDecision: false,
    expectedResponsePlanFamily: ['answer_with_known_information'],
  },
  {
    name: 'relato de fato existente — confirmação de valor',
    category: 'report_existing_fact',
    input: 'Era R$3.000, certo?',
    bookingFacts: { status: 'confirmed', cacheAmountCents: 300000, eventDate: '2026-09-12' },
    expectedCommitmentNature: 'report_existing_fact',
    expectedRequiresProfessionalDecision: false,
    expectedResponsePlanFamily: ['answer_with_known_information'],
  },
  {
    name: 'relato de fato existente — horário',
    category: 'report_existing_fact',
    input: 'Qual horário ficou?',
    bookingFacts: { status: 'confirmed', cacheAmountCents: 300000, eventDate: '2026-09-12T20:00:00' },
    expectedCommitmentNature: 'report_existing_fact',
    expectedRequiresProfessionalDecision: false,
    expectedResponsePlanFamily: ['answer_with_known_information'],
  },
  {
    name: 'relato de fato existente — condição de pagamento',
    category: 'report_existing_fact',
    input: 'Era 50% antes e 50% depois, né?',
    bookingFacts: { status: 'confirmed', cacheAmountCents: 300000, paymentCondition: '50% antes, 50% depois' },
    expectedCommitmentNature: 'report_existing_fact',
    expectedRequiresProfessionalDecision: false,
    expectedResponsePlanFamily: ['answer_with_known_information'],
    note: 'minimal pair com o caso de mudança de condição de pagamento abaixo — só a intenção (recuperar vs. propor) muda',
  },
  {
    name: 'novo compromisso — mudança de horário',
    category: 'new_or_changed_commitment',
    input: 'Pode mudar para 20h?',
    bookingFacts: { status: 'confirmed', cacheAmountCents: 300000, eventDate: '2026-09-12T19:00:00' },
    expectedCommitmentNature: 'new_or_changed_commitment',
    expectedRequiresProfessionalDecision: true,
    expectedResponsePlanFamily: ['consult_professional', 'ask_external_participant'],
  },
  {
    name: 'novo compromisso — mudança de condição de pagamento',
    category: 'new_or_changed_commitment',
    input: 'Podemos mudar para 30% agora e 70% depois?',
    bookingFacts: { status: 'confirmed', cacheAmountCents: 300000, paymentCondition: '50% antes, 50% depois' },
    expectedCommitmentNature: 'new_or_changed_commitment',
    expectedRequiresProfessionalDecision: true,
    expectedResponsePlanFamily: ['consult_professional', 'ask_external_participant'],
    note: 'minimal pair com o caso de relato de condição de pagamento acima',
  },

  // --- KNOW ≠ APPROVE ≠ COMMIT: precedente histórico nunca autoriza sozinho ---
  {
    name: 'precedente histórico — outro trabalho pelo mesmo valor',
    category: 'know_ne_approve_ne_commit',
    input: 'Já que da última vez foi R$3.000, pode ser R$3.000 de novo pra esse outro evento?',
    bookingFacts: { status: 'confirmed', cacheAmountCents: 300000, eventDate: '2026-09-12' },
    expectedCommitmentNature: 'new_or_changed_commitment',
    expectedRequiresProfessionalDecision: true,
    expectedResponsePlanFamily: ['consult_professional', 'ask_external_participant'],
    note: 'é um trabalho NOVO (orcamento) — o valor do trabalho anterior é só um precedente citado pelo cliente, nunca autorização automática pro novo',
  },
  {
    name: 'precedente histórico — duração igual à anterior',
    category: 'know_ne_approve_ne_commit',
    input: 'Ela tocou até 2h da última vez, então pode ficar até 2h nessa também?',
    bookingFacts: { status: 'confirmed', cacheAmountCents: 300000, eventDate: '2026-09-12' },
    expectedRequiresProfessionalDecision: true,
    expectedResponsePlanFamily: ['consult_professional', 'ask_external_participant'],
    note: 'condição operacional (horário de término) de um evento novo/diferente — precedente não é aprovação',
  },
  {
    name: 'precedente histórico — mesmo hotel',
    category: 'know_ne_approve_ne_commit',
    input: 'O hotel anterior foi esse, reserva o mesmo.',
    triggerAuthorType: 'external_participant',
    expectedRequiresProfessionalDecision: true,
    expectedResponsePlanFamily: ['consult_professional', 'ask_external_participant'],
    note: 'logística que compromete o profissional (reserva) mesmo citando um precedente real',
  },

  // --- Coleta contextual: corporativo vs. privado ---
  {
    name: 'corporativo — marca informada',
    category: 'coleta_corporativo_vs_privado',
    input: 'É um evento da Nike dia 12.',
    expectedResponsePlanFamily: ['ask_external_participant', 'consult_professional', 'acknowledge'],
    note: 'marca já informada — não deveria pedir a marca de novo; pode faltar horário/duração antes de consultar o profissional',
  },
  {
    name: 'corporativo — marca não informada',
    category: 'coleta_corporativo_vs_privado',
    input: 'É evento de uma marca, ainda não sei os detalhes.',
    expectedResponsePlanFamily: ['ask_external_participant'],
    note: 'corporativo sem marca/contexto: coletar antes de consultar o profissional é apropriado aqui',
  },
  {
    name: 'privado — festa de aniversário',
    category: 'coleta_corporativo_vs_privado',
    input: 'É uma festa de aniversário dia 12.',
    expectedResponsePlanFamily: ['ask_external_participant', 'consult_professional', 'acknowledge'],
    note: 'NUNCA deveria pedir "quem é o cliente"/identidade formal aqui só por hábito — validação real só pela golden suite (semântica)',
  },
  {
    name: 'privado — quero contratar para minha festa',
    category: 'coleta_corporativo_vs_privado',
    input: 'Quero contratar para minha festa.',
    expectedResponsePlanFamily: ['ask_external_participant'],
    note: 'falta data/tipo de evento — mas a pergunta esperada é sobre o EVENTO, não identidade formal da pessoa física',
  },

  // --- unavailable ≠ not_found; wrong-topic signal ---
  {
    name: 'fonte unavailable — nunca responder como se fosse inexistente',
    category: 'unavailable',
    input: 'Qual foi mesmo o valor combinado?',
    // sem bookingFacts nem opportunityFacts: seção fica 'no_link' na
    // simulação (o dev route não tem como forçar 'unavailable'
    // sintético hoje — ver nota no relatório de auditoria) — este
    // caso testa o comportamento equivalente de "não tenho o fato",
    // que deve se comportar igual a unavailable pro model: nunca
    // inventar um valor.
    expectedRequiresProfessionalDecision: false,
    expectedResponsePlanFamily: ['consult_professional', 'ask_external_participant', 'clarify_ambiguity'],
    note: 'sem booking carregado, o Planner não pode ter fato real pra responder — nunca answer_with_known_information aqui (não há evidência possível)',
  },
  {
    name: 'sinal de decisão em tópico errado — não confundir suporte com confirmação comercial',
    category: 'professionalDecisionSignal',
    input: 'Manda',
    triggerAuthorType: 'professional',
    previousMessages: [{ authorType: 'external_participant', text: 'Meu painel não abre, pode ver?' }],
    expectedProfessionalDecisionSignal: 'none',
    expectedResponsePlanFamily: ['acknowledge', 'consult_professional', 'clarify_ambiguity'],
    note: '"Manda" respondendo um pedido de suporte não é confirmação de proposta comercial nenhuma — professionalDecisionSignal nunca deveria virar candidate_contextual aqui',
  },
];
