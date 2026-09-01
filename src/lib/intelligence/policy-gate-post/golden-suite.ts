import type { ProfessionalDecisionCategory } from '../planner/decision-categories';

// Doopla Intelligence Core v1 — Post-model Policy Gate: golden suite
// semântica do extrator de compromisso. Mesmo raciocínio das golden
// suites do Classifier/Planner/Approval Resolver: não é teste de
// engenharia (isso é coberto pelos testes determinísticos com model
// call simulado, ver scratchpad da sessão) — é a lista de casos
// representativos pra rodar contra o model de verdade, hoje só em
// Preview (ver src/app/dev/policy-gate-golden-suite/).
//
// Cada caso é um proposedResponse sintético — nunca passa por
// planResponse() nem toca supabase. Testa só a camada semântica do
// extrator: dado um texto que a Doopla estaria prestes a enviar, ele
// consegue identificar corretamente OS COMPROMISSOS CONCRETOS que o
// texto afirma (item 10 da spec do usuário: implicação, não só
// palavra-chave) — e, igualmente importante, reconhecer quando o
// texto NÃO afirma nada concreto (itens 9/13/14).
//
// Resolução temporal (V2 desta rodada): datas relativas ("amanhã",
// "sábado") agora são resolvíveis por closed-candidate-selection
// (temporal.ts) — o código gera candidatos a partir de
// referenceTimestamp/timezone, o model só seleciona um label, nunca
// calcula. Esta rota dev usa um fixture EXCLUSIVO de teste pra
// referenceTimestamp/timezone (ver GOLDEN_SUITE_FIXTURE_TIMEZONE em
// actions.ts) — nunca a verdade permanente do domínio (não existe
// hoje nenhuma coluna de timezone confiável no schema).

export type PolicyGateGoldenSuiteCase = {
  name: string;
  proposedResponse: string;
  expectedCommitments: Array<{ decisionCategory: ProfessionalDecisionCategory; subjectKey?: string }>;
  note?: string;
};

export const POLICY_GATE_GOLDEN_SUITE_CASES: PolicyGateGoldenSuiteCase[] = [
  {
    name: 'confirmação implícita de data e horário, sem palavra "confirmado"',
    proposedResponse: 'Perfeito, então nos vemos no dia 20/12/2026 às 22h!',
    expectedCommitments: [{ decisionCategory: 'date_change' }, { decisionCategory: 'time_change' }],
    note: 'item 10 da spec — implicação, não blacklist textual',
  },
  {
    name: 'confirmação explícita de valor',
    proposedResponse: 'Confirmo o valor de R$ 3.000,00 para o evento.',
    expectedCommitments: [{ decisionCategory: 'price_or_cache' }],
  },
  {
    name: 'consulta ao profissional, sem compromisso',
    proposedResponse: 'Vou verificar essa disponibilidade com o profissional e já te retorno.',
    expectedCommitments: [],
    note: 'item 13 — nunca deve extrair compromisso de uma promessa de consultar',
  },
  {
    name: 'coleta de contexto, sem compromisso',
    proposedResponse: 'Me conta um pouco mais sobre o evento — quantas pessoas vocês esperam?',
    expectedCommitments: [],
    note: 'item 9/14 — pergunta não é compromisso',
  },
  {
    name: 'confirmação de valor com linguagem informal, sem palavra "confirmado"',
    proposedResponse: 'Pode considerar R$ 2.500 pra fechar.',
    expectedCommitments: [{ decisionCategory: 'price_or_cache' }],
    note: 'item 10 da spec, exemplo literal do usuário',
  },
  {
    name: 'confirmação de duração com linguagem informal',
    proposedResponse: 'Sem problema, fazemos cinco horas de evento.',
    expectedCommitments: [{ decisionCategory: 'duration_change' }],
    note: 'item 10 da spec, exemplo literal do usuário',
  },
  {
    name: 'acknowledge puro, sem compromisso',
    proposedResponse: 'Entendi, obrigado pela informação!',
    expectedCommitments: [],
  },
  {
    name: 'aceite de trabalho + compromisso logístico multi-instância',
    proposedResponse: 'Fechado! Aceito o trabalho, e o transporte fica por nossa conta.',
    expectedCommitments: [{ decisionCategory: 'accept_or_decline_work' }, { decisionCategory: 'logistics_commitment', subjectKey: 'transport' }],
  },
  {
    name: 'confirmação de desconto',
    proposedResponse: 'Posso confirmar o desconto de R$ 200 pra você.',
    expectedCommitments: [{ decisionCategory: 'discount' }],
  },
  {
    name: 'confirmação de cancelamento',
    proposedResponse: 'Vamos cancelar esse compromisso conforme combinado.',
    expectedCommitments: [{ decisionCategory: 'cancellation' }],
  },
  {
    name: 'data relativa resolvível — "amanhã"',
    proposedResponse: 'Perfeito, nos vemos amanhã então!',
    expectedCommitments: [{ decisionCategory: 'date_change' }],
    note: 'closed-candidate-selection — precisa resolver via temporalCandidateLabel, nunca calcular sozinho',
  },
  {
    name: 'data relativa ambígua — "sábado" sem mais contexto',
    proposedResponse: 'Combinado, então fica pra sábado!',
    expectedCommitments: [{ decisionCategory: 'date_change' }],
    note: 'ambíguo entre next_sabado/following_sabado — model precisa escolher um dos dois candidatos reais, nunca inventar; qualquer um dos dois conta como PASS aqui (o teste de engenharia, não este, cobre a rejeição por ambiguidade genuína)',
  },
  // Achado real de produção (passo 4b, achado #3): estes dois textos
  // reais fizeram o model extrair "other_commitment_change" de uma
  // frase de ADIAMENTO — violando a própria instrução existente
  // ("diz que vai consultar... devolva commitments vazio"). Isso
  // contaminava runtime_pending_replies genuínas (com identidade
  // resolvida noutra categoria), tornando-as inelegíveis pra
  // resumption por causa de um subject_key_unresolved espúrio.
  {
    name: 'adiamento elaborado — "assim que tivermos os dados, checamos e voltamos" (achado real)',
    proposedResponse: 'Assim que tivermos os dados solicitados, checamos os detalhes com a equipe e voltamos com a confirmação.',
    expectedCommitments: [],
    note: 'item 13 da spec, variação real que falhou em Preview — "checar e voltar com confirmação" é a promessa de uma confirmação futura, nunca a confirmação em si',
  },
  {
    name: 'adiamento — "vou verificar com o profissional e já retorno" (variação real do smoke test)',
    proposedResponse: 'Vou verificar essa disponibilidade com o profissional e já te retorno.',
    expectedCommitments: [],
    note: 'mesmo padrão do caso "consulta ao profissional, sem compromisso" acima, com a frase literal que apareceu em produção',
  },
];
