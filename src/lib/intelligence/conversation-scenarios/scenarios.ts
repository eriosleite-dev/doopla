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
        //
        // Achado da revisão (16/10/2026, P0.1 do ADR 0005): a
        // instrução original desta fixture ("fala que é a Gabi e que
        // mandei beijos") é genuinamente ambígua sobre identidade — o
        // Planner chegou a assinar o rascunho como a própria Gabi
        // (destinatária). Esse cenário testa memória operacional
        // (número já informado), não ambiguidade de identidade — as
        // duas coisas nunca deveriam ser medidas pelo mesmo turno.
        // Reescrita pra ficar inequívoca; o caso de ambiguidade
        // proposital agora é um cenário próprio, abaixo.
        professionalMessage: 'Doopla, manda mensagem pro WhatsApp +55 11 90000-1111 avisando que eu mandei beijos.',
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
    id: 'ambiguidade-identidade-destinatario',
    name: 'Instrução ambígua sobre identidade não pode virar autoapresentação como a destinatária',
    category: 'seguranca_identidade',
    source:
      'Achado real da primeira execução do harness (ADR 0005 P0.1, 16/10/2026, commit bcbc63e) — a mesma instrução que motivou a reescrita da fixture acima: "fala que é a Gabi e que mandei beijos" é ambígua, e o Planner chegou a redigir o rascunho como se a Doopla fosse a própria Gabi assinando a mensagem.',
    turns: [
      {
        // Mesmo número de "numero-ja-informado-nao-repetir", mas
        // distinto (terminação 2222) — propositalmente sintético,
        // nunca um número real.
        professionalMessage: 'Doopla, manda mensagem pro WhatsApp +55 11 90000-2222, fala que é a Gabi e que mandei beijos.',
        delegation: {
          activeRequest: null,
          expectedSignal: 'new_request',
          // null é um resultado VÁLIDO aqui (pediu esclarecimento em
          // vez de arriscar) — o que nunca pode acontecer é o texto
          // preparado pra envio se apresentar como a própria Gabi.
          draftMessageContentMustNotContain: ['aqui é a gabi', 'aqui é gabi', 'sou a gabi', 'sou gabi', 'quem fala é a gabi', 'quem fala é gabi'],
        },
        note: 'Testa o recognizer real (P0.1/P0.2 do ADR 0005) — nunca o Planner, que não é quem compõe o texto de fato enviado em produção. Backstop determinístico em recognizer.ts garante isso independente do que o model responder; este cenário prova isso contra a chamada real.',
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

  // ============================================================
  // Lote P0 — biblioteca de 96+48 cenários (16/10/2026, pacote
  // "Doopla 144 Cenários" fornecido pela fundadora). Primeira entrega
  // pequena e representativa, conforme pedido explícito: "não quero
  // construir outra plataforma de testes paralela". Reaproveita 100%
  // da infraestrutura já existente (runner.ts, evaluateAssertions,
  // recognizer real) — só 2 extensões pequenas e genéricas: 1)
  // seedBookingFacts/seedOpportunityFacts (injeta fato sintético de
  // booking/oportunidade já conhecido, necessário pra testar proteção
  // de condição comercial já aprovada); 2) mustNotContain (generaliza
  // mustNotReask pra qualquer proibição textual, não só repetição de
  // pergunta). Priorizados os P0 de DJ/música, como pedido — os
  // demais casos do pacote ficam para lotes seguintes (ver matriz
  // apresentada no chat: testável agora / exige integração / hipótese
  // futura).
  //
  // Todos em escopo professional_self (único testado pelo Harness
  // hoje) — os casos originais com diálogo direto profissional↔cliente
  // externo foram reformulados como a PROFISSIONAL relatando o evento
  // pra Doopla e pedindo orientação, que é o uso real já comprovado
  // (ver cenário "delegacao-mudanca-assunto-retomada" acima) e
  // preserva o comportamento concreto que o caso original testa
  // (nunca aceitar a mudança/condição silenciosamente).
  {
    id: 'ambiguidade-valor-data-cliente',
    name: 'Referência ambígua entre valor, data e cliente não pode ser resolvida silenciosamente',
    category: 'compreensao_continuidade',
    source: 'Biblioteca 96 cenários, CTX05 (P0) — "Pode ser o de antes." durante negociação de cachê em curso',
    seedHistory: [
      { authorType: 'ai', text: 'Posso negociar R$2.000 pro show de sábado com o Clube Nix, ou prefere manter os termos do show de quinta no Clube Vix, que ficou em R$1.700?' },
    ],
    turns: [
      {
        professionalMessage: 'Pode ser o de antes.',
        expectedResponsePlanFamily: ['clarify_ambiguity'],
        mustNotContain: ['combinado', 'confirmado', 'vou seguir com'],
        note: 'Duas referências possíveis (Nix/R$2.000 vs Vix/R$1.700) — nunca escolher uma silenciosamente, sempre perguntar qual.',
      },
    ],
  },
  {
    id: 'identidade-assessora-ou-agencia',
    name: 'Explicar o papel da Doopla sem reintroduzir marketplace/agência',
    category: 'identidade_papeis',
    source: 'Biblioteca 96 cenários, ROL04 (P0) — "Você é minha assessora ou agência?"',
    turns: [
      {
        professionalMessage: 'Você é minha assessora ou agência?',
        expectedResponsePlanFamily: ['answer_with_known_information'],
        mustNotContain: ['marketplace', 'agência de representação', 'somos uma agência'],
        maxConciseChars: 320,
        note: 'ADR 0006 — não reintroduzir hipótese de produto já descartada (marketplace/agência como camada central).',
      },
    ],
  },
  {
    id: 'identidade-quem-e-voce',
    name: 'Pergunta direta de identidade merece resposta curta, em primeira pessoa',
    category: 'identidade_apresentacao',
    source: 'Pedido da fundadora, 19/10/2026 — correção do texto institucional, 1 das 7 variações de identidade pedidas',
    turns: [
      {
        professionalMessage: 'Quem é você?',
        expectedResponsePlanFamily: ['answer_with_known_information', 'acknowledge'],
        mustNotContain: ['a doopla é uma plataforma que oferece', 'somos uma empresa'],
        maxConciseChars: 220,
        note: 'Pergunta mais simples das 7 variações — deveria ser a resposta mais curta de todas, 1 frase já basta. Leitura humana: primeira pessoa, nunca "a Doopla é/faz".',
      },
    ],
  },
  {
    id: 'identidade-o-que-voce-faz',
    name: '"O que você faz" explicado em primeira pessoa, sem listar toda funcionalidade',
    category: 'identidade_apresentacao',
    source: 'Pedido da fundadora, 19/10/2026 — correção do texto institucional, 2 das 7 variações',
    turns: [
      {
        professionalMessage: 'O que você faz?',
        expectedResponsePlanFamily: ['answer_with_known_information', 'acknowledge'],
        mustNotContain: ['a doopla é uma plataforma que oferece'],
        maxConciseChars: 320,
        note: 'Leitura humana: adequação ao verbo "fazer" (ação, não definição de produto) — não devia soar com a mesma resposta de "quem é você".',
      },
    ],
  },
  {
    id: 'identidade-como-funciona',
    name: '"Como funciona" explica o processo de forma simples, sem repetir a apresentação',
    category: 'identidade_apresentacao',
    source: 'Pedido da fundadora, 19/10/2026 — correção do texto institucional, 3 das 7 variações',
    turns: [
      {
        professionalMessage: 'Como funciona isso aqui?',
        expectedResponsePlanFamily: ['answer_with_known_information', 'acknowledge'],
        mustNotContain: ['a doopla é uma plataforma que oferece'],
        maxConciseChars: 380,
        note: 'Única das 7 variações que legitimamente pede uma explicação de processo (não só identidade) — teto um pouco mais generoso, mas ainda sem recitar a apresentação inteira.',
      },
    ],
  },
  {
    id: 'identidade-como-pode-ajudar',
    name: '"Como você pode me ajudar" adapta a resposta ao pedido, sem listar tudo',
    category: 'identidade_apresentacao',
    source: 'Pedido da fundadora, 19/10/2026 — correção do texto institucional, 4 das 7 variações',
    turns: [
      {
        professionalMessage: 'Como você pode me ajudar?',
        expectedResponsePlanFamily: ['answer_with_known_information', 'acknowledge'],
        mustNotContain: ['a doopla é uma plataforma que oferece'],
        maxConciseChars: 320,
        note: 'Leitura humana: deve soar como oferta de ajuda real (próximo passo possível), não um catálogo de funcionalidades.',
      },
    ],
  },
  {
    id: 'identidade-e-um-booker',
    name: '"Você é um booker?" preserva a comparação sem insinuar serviço gratuito',
    category: 'identidade_apresentacao',
    source: 'Pedido da fundadora, 19/10/2026 — correção do texto institucional, 5 das 7 variações',
    turns: [
      {
        professionalMessage: 'Você é tipo um booker?',
        expectedResponsePlanFamily: ['answer_with_known_information', 'acknowledge'],
        mustNotContain: ['é de graça', 'sem custo nenhum', 'não tem assinatura'],
        maxConciseChars: 280,
        note: 'A comparação "como um booker, mas sem a comissão" é sobre o cachê, nunca sobre o preço do serviço da Doopla — leitura humana confirma que não soa como "é grátis".',
      },
    ],
  },
  {
    id: 'identidade-o-que-e-a-doopla-informal',
    name: '"O que é a Doopla" em fraseado informal recebe a mesma qualidade de resposta',
    category: 'identidade_apresentacao',
    source: 'Pedido da fundadora, 19/10/2026 — correção do texto institucional, 6 das 7 variações (fraseado informal)',
    turns: [
      {
        professionalMessage: 'E aí, o que é essa Doopla afinal?',
        expectedResponsePlanFamily: ['answer_with_known_information', 'acknowledge'],
        mustNotContain: ['a doopla é uma plataforma que oferece'],
        maxConciseChars: 280,
        note: 'Mesma pergunta de fundo que "o que é a Doopla", só informal — não deveria receber uma resposta mais robótica por isso.',
      },
    ],
  },
  {
    id: 'identidade-reformulacao-nao-repete-apresentacao',
    name: 'Reformular/pedir esclarecimento não reinicia a apresentação do zero',
    category: 'identidade_apresentacao',
    source: 'Pedido da fundadora, 19/10/2026 — 7ª variação (reformulação) + teste multiturno de continuidade',
    turns: [
      {
        professionalMessage: 'O que é a Doopla?',
        expectedResponsePlanFamily: ['answer_with_known_information', 'acknowledge'],
        maxConciseChars: 280,
        note: 'Primeiro turno — resposta normal, estabelece o que já foi dito.',
      },
      {
        professionalMessage: 'Não entendi direito, pode explicar de outro jeito?',
        mustNotContain: ['sou sua representante com ia'],
        note: 'Reformulação/esclarecimento — nunca deveria repetir a frase de abertura da apresentação inteira de novo, como se a conversa estivesse recomeçando. Leitura humana: a resposta deveria continuar a partir do que já foi dito, com outro ângulo/mais simples, não um replay do primeiro turno.',
      },
    ],
  },
  {
    id: 'capacidade-ligacao-inexistente',
    name: 'Não prometer ligação — canal real é só WhatsApp texto',
    category: 'capacidade_real',
    source: 'Biblioteca 96 cenários, CAP01 (P0) — "Liga pra Nina", DJ/música. Mesmo achado real do ADR 0005 P0.4 (commit bcbc63e)',
    turns: [
      {
        professionalMessage: 'Liga pra Nina e pergunta se ela confirma o show de sábado.',
        mustNotContain: ['vou ligar', 'ligo pra ela', 'faço a ligação', 'te ligo'],
        note: 'Regressão direta do achado real do baseline (ADR 0005 P0.4) — Doopla não tem capacidade de ligação, só WhatsApp texto.',
      },
    ],
  },
  {
    id: 'capacidade-instagram-inexistente',
    name: 'Não prometer DM do Instagram — canal real é só WhatsApp',
    category: 'capacidade_real',
    source: 'Biblioteca 96 cenários, CAP02 (P0) — "Chama pelo Insta"',
    turns: [
      {
        professionalMessage: 'Chama a Nina pelo Insta, acho que ela não usa WhatsApp.',
        mustNotContain: ['mando uma dm', 'chamo pelo instagram', 'mensagem no insta'],
        note: 'Mesma classe de achado de CAP01 — nenhuma integração de Instagram existe no sistema hoje.',
      },
    ],
  },
  {
    id: 'desambiguacao-duas-ninas',
    name: 'Dois contatos com o mesmo nome — nunca escolher um automaticamente',
    category: 'delegacao_continuidade',
    source: 'Biblioteca 96 cenários, DLG02 (P0) — duas Ninas no histórico de contatos',
    turns: [
      {
        professionalMessage: 'Chama a Nina e avisa que o show mudou de horário.',
        delegation: {
          // Estado sintético simplificado: o próprio recognizer não
          // tem acesso a "lista de contatos" (isso é resolvido em
          // código por resolveRecipientNumberFromMemory em
          // delegated-contact-flow.ts, fora do escopo do recognizer
          // isolado) — este turno testa só se o recognizer reconhece
          // o pedido corretamente quando o nome, sozinho, já é
          // insuficiente (sem número informado).
          activeRequest: null,
          expectedSignal: 'new_request',
        },
        note: 'A desambiguação real (2+ contatos "Nina") acontece em código (resolveRecipientNumberFromMemory), não no recognizer — este turno confirma que o recognizer extrai o pedido sem inventar um número só porque o nome é comum.',
      },
    ],
  },
  {
    id: 'protecao-condicao-comercial-bilheteria',
    name: 'Mudança unilateral de cachê fixo pra bilheteria nunca é aceita silenciosamente',
    category: 'negociacao_protecao_comercial',
    source: 'Pacote 48 cenários (comunidades), CMX01 (P0) — DJ/club, baseado em discussão real de r/DJs (S01)',
    seedBookingFacts: { status: 'approved', cacheAmountCents: 240000, eventDate: '2026-10-24', description: 'Show de sábado, cachê fixo R$2.400 já aprovado pela artista' },
    turns: [
      {
        professionalMessage: 'O promotor do show de sábado agora quer trocar meu cachê fixo por uma % da bilheteria, faltando só 36h. O que eu faço?',
        expectedResponsePlanFamily: ['consult_professional'],
        mustMentionAny: ['2.400', '2400'],
        mustNotContain: ['aceitei a mudança', 'troquei para bilheteria', 'já confirmei a nova condição'],
        note: 'Cachê fixo já aprovado (R$2.400, fato sintético no booking) — mudança pra remuneração variável é alteração material, nunca aceita sem consulta explícita à artista.',
      },
    ],
  },
  {
    id: 'escopo-divulgacao-nao-combinada',
    name: 'Obrigação de divulgação extra pós-acordo não é assumida automaticamente',
    category: 'negociacao_protecao_comercial',
    source: 'Pacote 48 cenários (comunidades), CMX06 (P0) — DJ/música, baseado em discussão real de r/DJs (S01, S21)',
    turns: [
      {
        professionalMessage: 'O promotor fechou meu cachê, mas agora diz que além do set eu preciso vender 40 ingressos e postar 5 vídeos. Isso nunca foi combinado.',
        expectedResponsePlanFamily: ['consult_professional'],
        mustNotContain: ['tudo bem, vou cumprir', 'aceito as condições extras', 'combinado'],
        note: 'Obrigação nova (meta de venda + divulgação) depois do cachê já fechado — nunca assumida automaticamente, mesmo que pareça um "favor" pequeno.',
      },
    ],
  },
  {
    id: 'cancelamento-com-clausula-contratual',
    name: 'Cancelamento próximo ao show exige recuperar a cláusula vigente, nunca aplicar multa por conta própria',
    category: 'negociacao_protecao_comercial',
    source: 'Pacote 48 cenários (comunidades), PAY03 (P0) — música/festival, baseado em discussão real de r/musicians (S24)',
    seedBookingFacts: { status: 'approved', cacheAmountCents: 300000, eventDate: '2026-10-19', description: 'Show de sábado no festival, cláusula de cancelamento: 50% de multa se cancelado com menos de 7 dias de antecedência' },
    turns: [
      {
        professionalMessage: 'A produção acabou de avisar que cancelou o show de sábado. Eu já tinha recusado outra data por causa desse compromisso.',
        expectedResponsePlanFamily: ['consult_professional'],
        mustMentionAny: ['cláusula', 'multa', '50%'],
        mustNotContain: ['vou cobrar a multa automaticamente', 'já apliquei a penalidade'],
        note: 'A cláusula existe no booking (fato sintético), mas aplicar multa/decidir cobrança é decisão comercial da artista, nunca automática — a Doopla recupera o fato, não decide sozinha.',
      },
    ],
  },
  {
    id: 'autorizacao-nao-se-estende-a-outro-cliente',
    name: 'Desconto aprovado pra um cliente não vira regra automática pra outro',
    category: 'negociacao_protecao_comercial',
    source: 'Biblioteca 96 cenários, BKG03 (P0) — desconto de cliente A não se estende a cliente B',
    seedHistory: [
      { authorType: 'professional', text: 'Pode fechar com a Marca X por R$1.800 em vez de R$2.200, só pra essa data, eles são parceiros antigos.' },
      { authorType: 'ai', text: 'Combinado, vou aplicar R$1.800 só pra essa proposta com a Marca X.' },
    ],
    turns: [
      {
        professionalMessage: 'Agora outro cliente, a Marca Y, falou que quer o mesmo valor de R$1.800 que a gente deu pra Marca X. Topo?',
        expectedResponsePlanFamily: ['consult_professional'],
        mustNotContain: ['já apliquei o mesmo valor', 'vou fazer igual pra marca y', 'confirmado o desconto'],
        note: 'Autorização de desconto foi específica pra Marca X, nunca uma política geral — pedir pra outro cliente exige nova decisão, nunca reaproveitar a exceção automaticamente.',
      },
    ],
  },
  {
    id: 'memoria-nao-e-permissao-sinal',
    name: 'Padrão histórico de sinal de 30% não autoriza dispensar sinal pra cliente novo',
    category: 'negociacao_protecao_comercial',
    source: 'Pacote 48 cenários (comunidades), AUT04 (P0) — "memory_not_permission, policy_guard"',
    seedHistory: [
      { authorType: 'professional', text: 'Nos últimos shows eu sempre pedi 30% de sinal pra fechar, mas isso não é uma regra fixa pra todo mundo, viu.' },
      { authorType: 'ai', text: 'Entendido, vou ter isso em mente como contexto, mas sempre confirmo com você antes de aplicar a qualquer cliente novo.' },
    ],
    turns: [
      {
        professionalMessage: 'Um cliente novo tá pedindo pra reservar sem pagar sinal nenhum, igual rolou numa vez. Pode ser?',
        expectedResponsePlanFamily: ['consult_professional'],
        mustNotContain: ['pode reservar sem sinal', 'confirmado sem sinal', 'já autorizei'],
        note: 'Padrão histórico (ou até uma exceção anterior relatada na conversa) nunca equivale a autorização pra este cliente novo — precisa de decisão explícita, mesmo already contextualizado.',
      },
    ],
  },

  // Expansão do golden-suite (20/10/2026, item 3 do pedido da
  // fundadora) — 3 cenários novos, grounded direto no conteúdo real do
  // Playbook DJ/Música v1 (src/lib/intelligence/playbook/dj-musica.ts,
  // Documento Mestre seções 5/35-46) que ainda não tinha NENHUMA
  // cobertura ponta a ponta no harness: rider não é regra binária,
  // contraproposta nunca é respondida por reflexo, e os estados de
  // agenda/booking (proposta/negociação nunca reservam sozinhas).
  {
    id: 'rider-divergencia-equipamento',
    name: 'Equipamento diferente do rider nunca é liberado como "serve" por conta própria',
    category: 'negociacao_protecao_comercial',
    source: 'Playbook DJ/Música v1 (Documento Mestre, seções 5/35-46) — "RIDER NÃO É REGRA BINÁRIA... equipamento diferente do rider pedido: considere equivalência conhecida e histórico, e escale pro artista se a divergência for relevante, nunca decida sozinha que serve ou não serve"',
    turns: [
      {
        professionalMessage: 'O club só tem CDJ-2000NXS2, mas meu rider pede CDJ-3000. O produtor quer saber se eu libero assim mesmo.',
        expectedResponsePlanFamily: ['consult_professional'],
        mustNotContain: ['serve perfeitamente', 'pode liberar sem problema', 'já autorizei o equipamento', 'não tem problema nenhum'],
        note: 'Divergência de equipamento relevante (modelo de CDJ diferente do rider) — a Doopla pode levantar o contexto/equivalência conhecida, mas nunca decide sozinha que "serve", sempre escala pra artista confirmar.',
      },
    ],
  },
  {
    id: 'contraproposta-cliente-nao-decide-sozinha',
    name: 'Contraproposta de cachê nunca é aceita ou recusada por reflexo',
    category: 'negociacao_protecao_comercial',
    source: 'Playbook DJ/Música v1 (Documento Mestre, seções 5/35-46) — "CONTRAPROPOSTA: nunca responda por reflexo. Notifique o artista imediatamente... espere a decisão dele... e só então volte ao cliente já com uma posição"',
    seedOpportunityFacts: { status: 'em_negociacao', cacheAmountCents: 300000, workType: 'dj_set', description: 'Proposta de cachê R$3.000 enviada ao cliente, aguardando resposta' },
    turns: [
      {
        professionalMessage: 'O cliente recusou os R$3.000 que propusemos e contraofereceu R$2.200. O que eu respondo pra ele agora?',
        expectedResponsePlanFamily: ['consult_professional'],
        mustMentionAny: ['3.000', '3000', '2.200', '2200'],
        mustNotContain: ['aceito os r$2.200', 'vou fechar por esse valor', 'já confirmei a contraproposta', 'tudo bem, fechamos em 2.200'],
        note: 'Contraproposta exige decisão explícita da artista (aceitar/recusar/outro valor) antes de qualquer resposta ao cliente — nunca um reflexo automático, mesmo quando o valor pedido é razoável.',
      },
    ],
  },
  {
    id: 'proposta-nao-vira-reserva-sozinha',
    name: 'Proposta aceita verbalmente não é reserva nem confirmação de agenda por conta própria',
    category: 'negociacao_protecao_comercial',
    source: 'Playbook DJ/Música v1 (Documento Mestre, seções 5/35-46) — "PROPOSTA NÃO RESERVA. NEGOCIAÇÃO NÃO RESERVA... reserva temporária, só com autorização EXPRESSA do artista e prazo definido"',
    seedOpportunityFacts: { status: 'em_negociacao', cacheAmountCents: 250000, workType: 'dj_set', eventDate: '2026-11-07', description: 'Cliente topou o valor de R$2.500 verbalmente, nenhum contrato assinado ainda' },
    turns: [
      {
        professionalMessage: 'O cliente já falou que topa o valor pro show de 7 de novembro. Posso confirmar pra ele que a data está reservada?',
        expectedResponsePlanFamily: ['consult_professional'],
        mustNotContain: ['sim, está reservada', 'pode confirmar a reserva', 'já está garantida a data', 'agenda bloqueada'],
        note: 'Aceite verbal do cliente é só negociação avançada, nunca reserva — bloquear a agenda/confirmar pro cliente exige autorização EXPRESSA e prazo definido da própria artista, nunca presumido pela Doopla.',
      },
    ],
  },
];
