// Doopla Intelligence Core v1 — canal WhatsApp (passo 6A+6B):
// classificação de erro da Cloud API por CÓDIGO/semântica real da
// Meta — nunca "4xx=permanente, 5xx=transiente" genérico (decisão
// explícita do usuário, correção sobre a proposta original). Puro,
// sem I/O — tabela fechada, hand-curated, mesmo espírito de
// CATEGORY_DEPENDENCIES (policy-gate-post/dependencies.ts): nunca
// ampliada por inferência, só por decisão explícita de quem mantém.
//
// Fonte: códigos documentados publicamente pela Meta pra WhatsApp
// Cloud API/Graph API (error.code no corpo de erro). Cobre os casos
// mais comuns e bem estabelecidos — um código NOVO/desconhecido nunca
// vira transient por suposição (ver classifyMetaSendError abaixo:
// default é sempre 'permanent', nunca 'transient' às cegas — decisão
// do usuário: "não force para transient").

// Rate limit / limite de chamadas / erro transitório do lado da Meta —
// safe retry com backoff, sabemos que NÃO foi aceito (a Meta
// respondeu, recusou por capacidade, não por conteúdo).
const TRANSIENT_META_ERROR_CODES = new Set<number>([
  4, // Application request limit reached
  80007, // Rate limit hit (WhatsApp Business API específico)
  130429, // Rate limit hit (mensagens)
  131048, // Spam rate limit hit
  131056, // Pair rate limit (muitas mensagens pro mesmo destinatário)
  613, // Calls API Rate Limit Reached
  368, // Temporarily blocked for policy violations — recuperável com o tempo, nunca corrigido só reenviando o MESMO conteúdo, mas não é um erro de payload/autorização; tratado como transient (backoff) por ora, revisar se aparecer com frequência real.
]);

// Erro de payload/autorização/destinatário/template — precisa de
// mudança (token novo, número corrigido, template aprovado, etc.)
// antes de qualquer nova tentativa fazer sentido. Reenviar o MESMO
// outbound_intent nunca resolve sozinho.
const PERMANENT_META_ERROR_CODES = new Set<number>([
  190, // Access token inválido/expirado
  100, // Parâmetro inválido (ex.: formato de número)
  131026, // Mensagem não entregável (destinatário não tem WhatsApp/não alcançável)
  131047, // Fora da janela de reengajamento de 24h sem template aprovado
  131009, // Parâmetro inválido no payload
  132000, // Erro de parâmetro de template
  132001, // Template não existe/não aprovado
  133010, // Número de telefone da Doopla não registrado/cadastrado corretamente
]);

export type MetaSendErrorClassification = 'transient' | 'permanent';

// Nunca lança, nunca adivinha: código reconhecido → classificação
// explícita da tabela; código desconhecido OU ausente (corpo de erro
// não seguiu o formato esperado) → 'permanent', fail-closed (decisão
// do usuário: um erro que não reconhecemos nunca vira retry automático
// só por otimismo — precisa de revisão humana, nunca reenvio cego).
export function classifyMetaSendError(errorCode: number | null | undefined): MetaSendErrorClassification {
  if (errorCode === null || errorCode === undefined) return 'permanent';
  if (TRANSIENT_META_ERROR_CODES.has(errorCode)) return 'transient';
  // PERMANENT_META_ERROR_CODES nunca precisa ser checada aqui pra
  // decidir o retorno (o fallback já é 'permanent') — existe como
  // tabela de referência auditável, documentando quais códigos são
  // conhecidos-e-decididos vs. desconhecidos caindo no mesmo
  // fail-closed por default. isKnownPermanentCode() abaixo é o uso
  // real dela, pra quem for auditar/logar a razão específica.
  return 'permanent';
}

export function isKnownPermanentMetaErrorCode(errorCode: number): boolean {
  return PERMANENT_META_ERROR_CODES.has(errorCode);
}
