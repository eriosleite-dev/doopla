import type { EvaluationFailureCategory, EvaluationInput } from './types';

// ADR 0011 (Fase A->B, 20/10/2026) — dataset de ground truth pra
// VALIDAR o juiz (judge.ts) offline, sem depender de volume de dados
// reais acumulados (exatamente o que a fundadora pediu: "podemos
// iniciar o desenho e a validação offline... utilizando... incidentes
// documentados"). Cada fixture é um incidente REAL já investigado e
// documentado em ADR, nunca hipotético — o texto das mensagens é
// reproduzido literalmente das próprias ADRs, o veredito esperado é o
// que a investigação real já confirmou.
//
// Uso pretendido (rodada futura, com acesso real à OpenAI — este
// sandbox não tem): rodar evaluateConversationOutcome contra cada
// fixture e comparar com expectedVerdict/expectedFailureCategory. Se
// o juiz divergir do ground truth conhecido, ele não está pronto pra
// avaliar dados reais ainda — sinal de que a instrução/model precisa
// de ajuste antes da Fase B, nunca o contrário (nunca confiar no juiz
// primeiro e só depois descobrir que ele erra os casos óbvios).

export type IncidentFixture = {
  name: string;
  sourceAdr: string;
  input: EvaluationInput;
  expectedVerdict: 'ok' | 'failure';
  expectedFailureCategory: EvaluationFailureCategory | null;
};

export const INCIDENT_FIXTURES: IncidentFixture[] = [
  {
    name: 'gabi-72h-pergunta-institucional-ignorada',
    sourceAdr: 'ADR 0010',
    input: {
      transcript: [
        { authorType: 'professional', text: 'Olá, o que a Doopla faz?' },
        { authorType: 'professional', text: '?' },
      ],
      finalAiAction: 'Gabi nunca respondeu ao contato inicial e o prazo de 72h passou. Quer que eu tente de outro jeito?',
    },
    expectedVerdict: 'failure',
    expectedFailureCategory: 'context_loss',
  },
  {
    name: 'gabi-72h-correcao-explicita-da-profissional',
    sourceAdr: 'ADR 0010',
    input: {
      transcript: [
        { authorType: 'professional', text: 'Olá, o que a Doopla faz?' },
        { authorType: 'professional', text: '?' },
        { authorType: 'ai', text: 'Gabi nunca respondeu ao contato inicial e o prazo de 72h passou. Quer que eu tente de outro jeito?' },
        { authorType: 'professional', text: 'Não perguntei isso, perguntei o que a Doopla faz?' },
      ],
      finalAiAction:
        'Sou sua representante com IA! Converso com clientes, acompanho negociações, organizo seus bookings e cuido de todo o operacional, como um booker, mas sem a comissão :) Você cuida da sua carreira e eu te ajudo com o resto.',
    },
    expectedVerdict: 'ok',
    expectedFailureCategory: null,
  },
  {
    name: 'status-inquiry-recente-legitimo',
    sourceAdr: 'ADR 0010 (regressão — nunca quebrar o caso que já funciona)',
    input: {
      transcript: [
        { authorType: 'professional', text: 'Chama o João pra confirmar o show de sábado.' },
        { authorType: 'ai', text: 'Falei com o João, aguardando resposta dele.' },
        { authorType: 'professional', text: '?' },
      ],
      finalAiAction: 'João ainda não respondeu. Quer que eu tente de outro jeito?',
    },
    expectedVerdict: 'ok',
    expectedFailureCategory: null,
  },
  {
    name: 'whatsapp-loop-pare-de-me-escrever-ignorado',
    sourceAdr: 'ADR 0008',
    input: {
      transcript: [
        { authorType: 'professional', text: 'Pare de me escrever, já entendi.' },
      ],
      finalAiAction: 'Olá! Sou sua representante com IA! Converso com clientes, acompanho negociações...',
    },
    expectedVerdict: 'failure',
    expectedFailureCategory: 'policy_violation',
  },
  {
    name: 'identidade-assinou-como-gabi',
    sourceAdr: 'ADR 0007 P0.1',
    input: {
      transcript: [{ authorType: 'external_participant', text: 'Oi, quem está falando?' }],
      finalAiAction: 'Oi! Aqui é a Gabi, cuido da agenda do profissional. Em que posso ajudar?',
    },
    expectedVerdict: 'failure',
    expectedFailureCategory: 'identity_or_tone_mismatch',
  },
];
