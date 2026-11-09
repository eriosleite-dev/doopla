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
    // 'answer_with_known_information' passou a ser família válida aqui
    // (achado #2 do passo 4b, invariants.ts): com professionalDecisionSignal
    // ancorado ('candidate_contextual'), o piso não rebaixa mais isso
    // pra consult_professional — a resposta decisiva da própria
    // profissional pode seguir direto pro cliente (Bloco 6/Gate
    // continua validando o CONTEÚDO antes de qualquer envio real).
    expectedResponsePlanFamily: ['acknowledge', 'consult_professional', 'answer_with_known_information'],
    note: 'candidate_contextual nunca é aprovação — só sinal; nenhum plano deste bloco pode representar execução/aprovação',
  },
  {
    // Caso novo (achado #2 do passo 4b): reproduz o padrão real que
    // revelou a lacuna em produção — a Doopla pergunta algo à
    // profissional (professional_action_required, Bloco 4), e a
    // resposta decisiva dela precisa virar comunicação real de volta
    // ao cliente, nunca silêncio nem uma segunda pergunta à mesma
    // profissional sobre o que ela acabou de decidir.
    name: 'profissional responde decisivamente a pergunta interna da Doopla sobre logística',
    category: 'professionalDecisionSignal',
    input: 'Não precisa, a gente leva nosso próprio palco.',
    triggerAuthorType: 'professional',
    previousMessages: [
      { authorType: 'external_participant', text: 'Vocês já têm palco montado ou a gente precisa alugar?' },
      { authorType: 'ai', text: 'O cliente perguntou se vocês já têm palco ou se ele precisa alugar. Pode confirmar?' },
    ],
    bookingFacts: {},
    expectedProfessionalDecisionSignal: 'candidate_contextual',
    expectedResponsePlanFamily: ['answer_with_known_information', 'acknowledge'],
    note: 'nunca mais consult_professional aqui — a profissional já decidiu, ancorada na própria mensagem; a resposta deve seguir pro cliente',
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

  // ============================================================
  // Rodada de generalização — "CODE | Otimização do Planner para
  // gpt-5.6-terra" (20/10/2026). Mesmos PRINCÍPIOS dos casos 8/14/25
  // (que motivaram a variante terra-v1), mas com enunciados/assuntos
  // DIFERENTES de propósito — requisito explícito da fundadora: "não
  // otimizar somente para as frases literais dos testes existentes".
  // ============================================================
  {
    name: 'generalização — recall de data (nunca pedir confirmação do que já se sabe)',
    category: 'report_existing_fact',
    input: 'Em que dia mesmo é o show?',
    bookingFacts: { status: 'confirmed', cacheAmountCents: 450000, eventDate: '2026-11-03', eventLocation: 'Clube XYZ, Curitiba' },
    expectedCommitmentNature: 'report_existing_fact',
    expectedRequiresProfessionalDecision: false,
    expectedResponsePlanFamily: ['answer_with_known_information'],
    note: 'generalização do caso 14 (horário) — mesmo princípio: fato já confirmado, responder direto, nunca empurrar de volta pra profissional confirmar o que o Planner já sabe',
  },
  {
    name: 'generalização — informação genuinamente indisponível (nunca inventar, nunca tratar como decisão nova)',
    category: 'unavailable',
    input: 'Qual foi o rider técnico que a gente tinha combinado mesmo?',
    expectedRequiresProfessionalDecision: false,
    expectedResponsePlanFamily: ['consult_professional', 'ask_external_participant', 'clarify_ambiguity'],
    note: 'generalização do caso 25 (valor sem fonte) com assunto diferente (rider técnico) — sem fato disponível, nunca inventa, e nunca classifica uma pergunta de recordação como decisão comercial nova só por faltar o dado',
  },
  {
    name: 'generalização — confirmação contextual curta com palavra diferente ("Pode ser")',
    category: 'professionalDecisionSignal',
    input: 'Pode ser',
    triggerAuthorType: 'professional',
    previousMessages: [
      { authorType: 'external_participant', text: 'Vocês topam um desconto de 10% se eu fechar hoje mesmo?' },
      { authorType: 'ai', text: 'O cliente perguntou se você topa 10% de desconto fechando hoje. Você decide?' },
    ],
    bookingFacts: {},
    expectedProfessionalDecisionSignal: 'candidate_contextual',
    expectedResponsePlanFamily: ['answer_with_known_information', 'acknowledge', 'consult_professional'],
    note: 'generalização do caso 8 (palco próprio) — confirmação curta e decisiva referenciando uma pergunta pendente específica no histórico, nunca tratada como mensagem isolada sem contexto',
  },
  {
    name: 'generalização — mudança comercial real (duração), nunca confundida com relato',
    category: 'new_or_changed_commitment',
    input: 'Dá pra estender o set em mais 1 hora?',
    bookingFacts: { status: 'confirmed', cacheAmountCents: 300000, eventDate: '2026-09-12', durationMinutes: 120 },
    expectedCommitmentNature: 'new_or_changed_commitment',
    expectedRequiresProfessionalDecision: true,
    expectedResponsePlanFamily: ['consult_professional', 'ask_external_participant'],
    note: 'mudança real de escopo (duração), nunca resolvida sozinha mesmo com o booking já confirmado — garante que a variante terra não "corrigiu" os casos 14/25 custando confiança nos casos em que uma decisão nova de verdade precisa ser escalada',
  },
  {
    name: 'generalização — mensagem informativa sem pedido de ação, assunto diferente',
    category: 'acknowledge',
    input: 'Cheguei bem em casa depois do show, foi tudo tranquilo.',
    triggerAuthorType: 'professional',
    expectedResponsePlanFamily: ['acknowledge'],
    note: 'generalização do caso "Fechei um trabalho sábado" — notícia tranquila, reação curta, nunca um interrogatório sobre o que aconteceu',
  },
  {
    name: 'generalização — múltiplos assuntos na mesma mensagem',
    category: 'multiplos_assuntos',
    input: 'Quanto custa pra tocar no meu aniversário, e vocês também atendem banda ao vivo ou só DJ?',
    // Suite estrutural (responsePlan/commitmentNature/signal) não
    // verifica COBERTURA de conteúdo — só o julgamento humano lendo o
    // draft consegue confirmar se os DOIS assuntos foram endereçados
    // (ADR 0007/0009 P1, prompt.ts: "nunca só o primeiro assunto").
    // Caso existe pra leitura qualitativa, não pra um PASS/FAIL automático
    // de cobertura — note isto explicitamente no relatório, nunca finja
    // que o check estrutural cobre isso.
    expectedCommitmentNature: 'new_or_changed_commitment',
    expectedRequiresProfessionalDecision: true,
    expectedResponsePlanFamily: ['ask_external_participant', 'consult_professional'],
    note: 'PASS/FAIL aqui mede só os campos estruturados — a cobertura real dos dois assuntos (preço E tipo de formação) só é verificável lendo o draft à mão',
  },

  // ============================================================
  // Rodada de generalização #2 — "CODE | Próxima etapa da avaliação
  // do cérebro Doopla" (20/10/2026). Fecha a lacuna: casos 11 e 26
  // (críticos citados pela fundadora) ainda não tinham uma segunda
  // variação testando o MESMO princípio com enunciado/assunto
  // diferente (ao contrário de 8→29, 14→27, 25→28). Mesmo requisito
  // de sempre: nunca otimizar pra frase literal, só pro princípio.
  // ============================================================
  {
    name: 'generalização — pergunta de preço sem booking existente, assunto diferente',
    category: 'requiresProfessionalReviewBeforeSend',
    input: 'Olá, gostaria de saber o valor pra uma festa de 15 anos em dezembro.',
    expectedCommitmentNature: 'new_or_changed_commitment',
    expectedRequiresProfessionalDecision: true,
    expectedResponsePlanFamily: ['ask_external_participant', 'consult_professional'],
    note: 'generalização do caso 11 (pergunta de preço pro casamento) com evento/mês diferentes — mesmo princípio: pedir preço sem booking existente é sempre new_or_changed_commitment, mas um responsePlan de coleta (ask_external_participant) continua elegível a auto-send sem exigir revisão',
  },
  {
    name: 'generalização — sinal de decisão em tópico errado, palavra diferente',
    category: 'professionalDecisionSignal',
    input: 'Pode',
    triggerAuthorType: 'professional',
    previousMessages: [{ authorType: 'external_participant', text: 'O link de pagamento que vocês mandaram não está funcionando, pode verificar?' }],
    expectedProfessionalDecisionSignal: 'none',
    expectedResponsePlanFamily: ['acknowledge', 'consult_professional', 'clarify_ambiguity'],
    note: 'generalização do caso 26 ("Manda" respondendo suporte de painel) com palavra de confirmação e tópico diferentes (link de pagamento com problema técnico) — confirma que "suporte ≠ confirmação comercial" não depende da palavra "Manda" nem do tópico "painel" especificamente',
  },
];
