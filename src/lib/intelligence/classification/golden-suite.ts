import type { ConversationMessageAuthorType } from '@/lib/supabase/types';
import type { Intent } from './intents';

// Doopla Intelligence Core v1 — Bloco 3: golden suite semântica.
//
// Não é um teste de engenharia (isso já é coberto por
// bloco3-tests/bloco3-audit-tests, com model call simulado). Isto é
// a lista de casos representativos de linguagem real de booking e
// rotina profissional, com o(s) intent(s) esperado(s), pensada pra
// rodar contra o model de verdade — hoje só em Preview (ver
// src/app/dev/classification-golden-suite/).
//
// expectedIntents: qualquer um destes valores como primaryIntent
// conta como PASS — pra casos genuinamente ambíguos, listar mais de
// um é intencional (o objetivo não é forçar uma "resposta certa"
// única, é confirmar que o model reconhece a leitura razoável em vez
// de fabricar certeza sobre algo que não está nesta mensagem isolada).
export type GoldenSuiteCase = {
  name: string;
  category: string;
  input: string;
  expectedIntents: Intent[];
  note?: string;
  // Casos genuinamente ambíguos sem contexto: acertar UM dos valores
  // listados em expectedIntents não é suficiente pra PASS — a
  // classificação também precisa ter representado a própria incerteza
  // (classificationStatus="ambiguous" ou effectiveConfidence !== "high").
  // "Acertar por sorte" uma leitura plausível não prova que o
  // classifier reconheceu a ambiguidade real da mensagem.
  expectAmbiguous?: boolean;
  // Mensagens anteriores opcionais, mais antiga primeiro — usadas
  // pelos casos "negativos" da regra de resposta dependente de
  // contexto: provam que, HAVENDO contexto suficiente, uma resposta
  // curta continua resolvendo pra uma intenção específica em vez de
  // cair em "outro"/ambiguous por reflexo.
  previousMessages?: Array<{ authorType: ConversationMessageAuthorType; text: string }>;
};

export const GOLDEN_SUITE_CASES: GoldenSuiteCase[] = [
  { name: 'orçamento inequívoco', category: 'orcamento', input: 'Quanto custa um show de 2 horas?', expectedIntents: ['orcamento'] },
  { name: 'disponibilidade inequívoca', category: 'disponibilidade', input: 'Ela consegue sábado que vem?', expectedIntents: ['disponibilidade'] },
  { name: 'desconto', category: 'desconto', input: 'Faz 2500 e fecha?', expectedIntents: ['desconto'] },
  { name: 'condição de pagamento', category: 'condicao_pagamento', input: 'Pode ser 50% antes e 50% no dia do evento?', expectedIntents: ['condicao_pagamento'] },
  { name: 'logística', category: 'logistica', input: 'Qual o endereço exato do evento?', expectedIntents: ['logistica'] },
  { name: 'rider', category: 'rider', input: 'Manda o rider técnico pra galera da produção do local.', expectedIntents: ['rider'] },
  {
    name: 'contrato + pagamento',
    category: 'contrato',
    input: 'O contrato está certo, mas ainda não recebi o sinal.',
    expectedIntents: ['contrato', 'financeiro_booking'],
    note: 'multi-intent plausível: contrato (documento) + financeiro_booking (sinal não recebido)',
  },
  { name: 'cobrança curta', category: 'cobranca', input: 'E a nota?', expectedIntents: ['cobranca'], note: 'mensagem muito curta — atenção à confiança reportada' },
  { name: 'material profissional', category: 'material_profissional', input: 'Faz uma bio minha mais curta pro Instagram.', expectedIntents: ['material_profissional'] },
  { name: 'reclamação', category: 'reclamacao', input: 'Esse cliente está me enrolando, já é a terceira vez que ele muda o horário.', expectedIntents: ['reclamacao'] },
  { name: 'suporte', category: 'suporte', input: 'Não estou conseguindo entrar no meu painel da Doopla.', expectedIntents: ['suporte'] },
  { name: 'booking informado por fora', category: 'booking_update', input: 'Fechei um trabalho sábado por R$3000.', expectedIntents: ['booking_update'] },
  { name: 'preferência do profissional', category: 'treinamento_profissional', input: 'Não quero mais lembrete no dia que eu vou tocar.', expectedIntents: ['treinamento_profissional'] },
  { name: 'financeiro — pagamento parcial recebido', category: 'financeiro_booking', input: 'Recebi metade.', expectedIntents: ['financeiro_booking'] },
  { name: 'financeiro — pagamento pendente', category: 'financeiro_booking', input: 'O pagamento ainda não caiu.', expectedIntents: ['financeiro_booking'] },
  { name: 'financeiro — sinal pago', category: 'financeiro_booking', input: 'O sinal foi pago.', expectedIntents: ['financeiro_booking'] },
  { name: 'financeiro — promessa de pagamento', category: 'financeiro_booking', input: 'Ele disse que paga amanhã.', expectedIntents: ['financeiro_booking'] },
  { name: 'financeiro — saldo restante recebido', category: 'financeiro_booking', input: 'Entrou o restante.', expectedIntents: ['financeiro_booking'] },
  { name: 'financeiro — saldo pendente com valor', category: 'financeiro_booking', input: 'Ainda faltam R$800.', expectedIntents: ['financeiro_booking'] },
  {
    name: 'fronteira: negociação, não relato financeiro',
    category: 'desconto (fronteira)',
    input: 'Consegue baixar pra 2 mil?',
    expectedIntents: ['desconto'],
    note: 'testa se o model NÃO confunde negociação prospectiva com financeiro_booking',
  },
  {
    name: 'ambígua — extremamente curta',
    category: 'ambígua',
    input: 'quanto?',
    expectedIntents: ['orcamento', 'desconto', 'cobranca'],
    note: 'genuinamente ambígua sem mensagem anterior — o teste real é se classificationStatus vem "ambiguous"/confiança baixa, não acertar um único valor',
    expectAmbiguous: true,
  },
  {
    name: 'ambígua — "pode ser"',
    category: 'ambígua',
    input: 'pode ser',
    expectedIntents: ['orcamento', 'disponibilidade', 'condicao_pagamento', 'outro'],
    note: 'resposta a algo fora desta mensagem isolada',
    expectAmbiguous: true,
  },
  {
    name: 'ambígua — "fechou"',
    category: 'ambígua',
    input: 'fechou',
    expectedIntents: ['booking_update', 'desconto', 'outro'],
    expectAmbiguous: true,
  },
  {
    name: 'multi-intent simples',
    category: 'multi-intent',
    input: 'Ela está livre sábado? Se estiver, quanto fica?',
    expectedIntents: ['disponibilidade', 'orcamento'],
    note: 'espera-se primary+secondary cobrindo os dois, nunca só um escolhido arbitrariamente',
  },
  {
    name: 'multi-intent booking_update+rider',
    category: 'multi-intent',
    input: 'Preciso trocar o horário e mandar o rider.',
    expectedIntents: ['booking_update', 'rider'],
    note: 'a data/horário do evento é termo central do acordo — mudar isso é booking_update, não logistica (reservada pra coordenação de execução com os termos centrais já fixados); rider tem intent próprio, nunca vira material_profissional',
  },
  {
    name: 'coloquial + erro de português',
    category: 'coloquial',
    input: 'oi mano cê ta ai? preciso sabe quanto fica um trampo de 3h',
    expectedIntents: ['orcamento'],
  },
  { name: 'inglês', category: 'idioma', input: 'Hey, is she available next Saturday?', expectedIntents: ['disponibilidade'] },
  { name: 'mistura PT/EN', category: 'idioma', input: 'Oi, just checking se ela tá free no sábado', expectedIntents: ['disponibilidade'] },
  {
    name: 'transcript de áudio imperfeito',
    category: 'transcript imperfeito',
    input: 'oi ce consegue fazer duzentos reais amenos pra fechar hoje mesmo',
    expectedIntents: ['desconto'],
    note: 'simula transcrição de áudio (sem pontuação/acentos, palavras coladas)',
  },
  { name: 'sem intenção operacional', category: 'sem intenção', input: 'Bom dia! Tudo bem com você?', expectedIntents: ['outro'] },
  {
    name: 'muda de assunto no meio',
    category: 'muda de assunto',
    input: 'Sobre o show de sábado, ah e outra coisa, vocês fazem eventos corporativos também?',
    expectedIntents: ['booking_update', 'orcamento', 'suporte', 'outro'],
    note: 'segundo tópico ("fazem eventos corporativos?") é uma pergunta sobre ESCOPO/TIPO de serviço oferecido — não existe intent pra isso na taxonomia atual (não é orcamento de um trabalho específico, não é disponibilidade, não é suporte técnico). "outro" aqui é uma resposta conservadora defensável, não um erro — lacuna real de taxonomia documentada, proposta de solução pendente de decisão (ex.: um intent futuro tipo consulta_servico), não implementada silenciosamente',
  },
  {
    name: 'depende de mensagem anterior (fora desta simulação)',
    category: 'depende do contexto',
    input: 'sim, pode ser',
    expectedIntents: ['outro'],
    note: 'sentido real depende de uma mensagem anterior que não existe nesta simulação isolada — mede comportamento conservador sem contexto',
    expectAmbiguous: true,
  },
  {
    name: 'resposta dependente de contexto — "sim"',
    category: 'depende do contexto',
    input: 'sim',
    expectedIntents: ['outro'],
    note: 'confirmação solta sem conteúdo temático próprio e sem mensagem anterior disponível — não deve fabricar disponibilidade/orçamento/booking_update',
    expectAmbiguous: true,
  },
  {
    name: 'resposta dependente de contexto — "fechado"',
    category: 'depende do contexto',
    input: 'fechado',
    expectedIntents: ['outro'],
    note: 'variação de confirmação solta sem contexto — mesma regra geral de "fechou"/"sim, pode ser"',
    expectAmbiguous: true,
  },
  {
    name: 'resposta dependente de contexto — "beleza"',
    category: 'depende do contexto',
    input: 'beleza',
    expectedIntents: ['outro'],
    note: 'confirmação coloquial solta, sem conteúdo temático próprio e sem mensagem anterior disponível',
    expectAmbiguous: true,
  },
  {
    name: 'resposta dependente de contexto — "isso"',
    category: 'depende do contexto',
    input: 'isso',
    expectedIntents: ['outro'],
    note: 'confirmação solta sem antecedente disponível',
    expectAmbiguous: true,
  },
  {
    name: 'resposta dependente de contexto — "pode"',
    category: 'depende do contexto',
    input: 'pode',
    expectedIntents: ['outro'],
    note: 'confirmação solta sem antecedente disponível',
    expectAmbiguous: true,
  },
  {
    name: 'resposta dependente de contexto — "acho que sim"',
    category: 'depende do contexto',
    input: 'acho que sim',
    expectedIntents: ['outro'],
    note: 'confirmação hesitante solta, sem conteúdo temático próprio e sem mensagem anterior disponível',
    expectAmbiguous: true,
  },
  {
    name: 'CONTROLE NEGATIVO — resposta curta com contexto anterior suficiente',
    category: 'depende do contexto (negativo)',
    input: 'fechado',
    previousMessages: [{ authorType: 'professional', text: 'Posso fechar o show de sábado às 20h por R$2000?' }],
    expectedIntents: ['booking_update'],
    note: 'mesma palavra do caso "fechado" isolado, mas agora com mensagem anterior que deixa claro do que se trata — a regra de resposta dependente de contexto NÃO deve se aplicar aqui; espera-se leitura específica (booking_update), não outro/ambiguous',
  },
];
