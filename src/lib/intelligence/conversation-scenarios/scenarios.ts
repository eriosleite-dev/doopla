import type { ConversationScenario } from './types';

// Doopla Intelligence Core v1 — golden suite inicial do AI Evaluation
// Harness (ADR 0005, 16/10/2026), construída a partir das conversas
// REAIS relatadas pela fundadora nos testes de WhatsApp (não casos
// hipotéticos). Cada cenário cita a origem — print/horário real — pra
// nunca perder rastreabilidade até o problema concreto que motivou o
// teste.
//
// Importante: as mensagens do PROFISSIONAL são sempre as reais (ou
// uma reformulação fiel, quando o print tinha nome fictício/dado
// sensível). As respostas da DOOPLA nunca são copiadas do print — são
// sempre geradas pelo modelo real nesta execução. Isso significa que
// o texto exato de um turno intermediário pode divergir do que
// aconteceu no print original (o modelo evolui); o que o cenário
// garante é testar a MESMA sequência de mensagens do profissional, na
// mesma ordem, contra o comportamento ATUAL — nunca um replay literal
// de um log congelado.

export const CONVERSATION_SCENARIOS: ConversationScenario[] = [
  {
    id: 'correcao-apos-oferta-tutorial',
    name: 'Correção da explicação institucional após oferta de tutorial',
    category: 'compreensao_continuidade',
    source: 'Teste real 15/10/2026 — "Mostre." / "Não é assim que a Doopla se explica..." / "Sim"',
    seedHistory: [{ authorType: 'ai', text: 'Quer que eu te mostre como usar alguma função específica?' }],
    turns: [
      {
        professionalMessage: 'Mostre.',
        note: 'Mensagem curta, só resolve com o turno anterior no contexto — testa o Problema 1 do diagnóstico (recorte de histórico).',
      },
      {
        professionalMessage: 'Não é assim que a Doopla se explica, essa não é a definição correta.',
        mustNotReask: [],
        note: 'Correção do que a Doopla acabou de dizer — testa se o Classifier/Planner reconhecem isso como correção, não como pedido novo desconexo.',
      },
      {
        professionalMessage: 'Sim',
        mustCiteConversationEvidence: true,
        note: 'Resposta curta de confirmação — só faz sentido se o Planner souber a que pergunta "Sim" está respondendo (precisa ancorar em mensagem real da conversa, nunca responder genericamente).',
      },
    ],
  },
  {
    id: 'delegacao-mudanca-assunto-retomada',
    name: 'Pedido de delegação, mudança de assunto, retomada com "conseguiu?"',
    category: 'delegacao_continuidade',
    source: 'Teste real 15-16/10/2026 — pedido de contato com "Gabi", troca de assunto, "E aí, conseguiu?"',
    turns: [
      {
        professionalMessage: 'Doopla, chama a Gabi e fala que mandei beijos.',
        delegation: {
          activeRequest: null,
          expectedSignal: 'new_request',
        },
        note: 'Pedido de delegação inequívoco — o recognizer isolado precisa reconhecer new_request.',
      },
      {
        professionalMessage: 'Ah, muda meu horário de atendimento pra depois das 18h.',
        delegation: {
          activeRequest: {
            status: 'pending_number',
            literalContentGate: 'pending',
            recipientName: 'Gabi',
            recipientNumberKnown: false,
            pendingConfirmationText: null,
          },
          expectedSignal: 'no_delegation_signal',
        },
        note: 'Mudança de assunto deliberada no meio do pedido de delegação em aberto — o recognizer precisa reconhecer que ISSO não é sobre a Gabi (no_delegation_signal), e o Planner precisa tratar como assunto novo, sem inventar relação com a delegação.',
      },
      {
        professionalMessage: 'E aí, conseguiu falar com ela?',
        mustCiteConversationEvidence: true,
        mustNotReask: ['qual é o número', 'quem é', 'qual o telefone'],
        delegation: {
          activeRequest: {
            status: 'executed',
            literalContentGate: 'sent',
            recipientName: 'Gabi',
            recipientNumberKnown: true,
            pendingConfirmationText: null,
          },
          expectedSignal: 'status_inquiry',
        },
        note: 'Retomada do assunto original 2 turnos depois de uma mudança de assunto — testa Problema 1 (continuidade) e Problema 2 (consulta de status) juntos. O recognizer precisa reconhecer status_inquiry; o Planner nunca pode voltar a perguntar quem é/o número, já fornecidos antes.',
      },
    ],
  },
  {
    id: 'numero-ja-informado-nao-repetir',
    name: 'Número de contato já informado não deve ser pedido de novo',
    category: 'memoria_operacional',
    source: 'Teste real 15/10/2026 — telefone do contato repetido várias vezes, Doopla continuou pedindo (número substituído por sintético nesta fixture — achado da revisão, 16/10/2026: a primeira versão deste arquivo continha o número real do contato usado no teste)',
    turns: [
      {
        // Número deliberadamente fictício (nunca um número real de
        // ninguém) — padrão repetitivo escolhido de propósito pra
        // nunca parecer um número real por coincidência.
        professionalMessage: 'Doopla, manda mensagem pro WhatsApp +55 11 90000-1111, fala que é a Gabi e que mandei beijos.',
        delegation: {
          activeRequest: null,
          expectedSignal: 'new_request',
        },
        note: 'Pedido completo numa mensagem só, número já incluso — nunca deveria haver pergunta de "qual o número" depois disso.',
      },
      {
        professionalMessage: 'Isso mesmo, pode confirmar.',
        mustNotReask: ['qual é o número', 'qual o telefone', 'me passa o número'],
        delegation: {
          activeRequest: {
            status: 'pending_approval',
            literalContentGate: 'pending',
            recipientName: 'Gabi',
            recipientNumberKnown: true,
            pendingConfirmationText: 'Posso confirmar o envio pra Gabi?',
          },
          expectedSignal: 'confirms_pending',
        },
      },
    ],
  },
  {
    id: 'legibilidade-resposta-longa',
    name: 'Formatação de resposta com múltiplos assuntos',
    category: 'formatacao_legibilidade',
    source: 'Achado do diagnóstico (ADR 0005, Problema 5/7) — respostas longas em bloco único, sem separação',
    turns: [
      {
        professionalMessage:
          'Preciso saber três coisas: qual o valor que cobrei do último cliente, se o pagamento dele já caiu, e se dá pra eu mudar meu horário de atendimento pra depois das 18h.',
        note: 'Pergunta com 3 assuntos distintos — resposta deveria separar em parágrafos (\\n\\n), nunca um bloco único de texto corrido nem lista desnecessária pra 3 itens simples.',
      },
    ],
  },
];
