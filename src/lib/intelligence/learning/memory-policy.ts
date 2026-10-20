// Doopla Intelligence Core — Fundação de Memória Profissional (Etapa B,
// Head of AI + Principal AI Engineer, 15/10/2026).
//
// Módulo 100% ISOLADO de propósito: nenhum I/O, nenhum Supabase,
// nenhuma migration, nenhuma conexão com o runtime/Classifier/Planner/
// Context Builder. Funções puras — recebem o estado atual (memórias
// já existentes) como parâmetro e devolvem o próximo estado, nunca
// mantêm nada em memória própria. Isso espelha o padrão já
// estabelecido no resto do Intelligence Core (ex.: planner/invariants.ts,
// delegated-contact/recognizer.ts) e deixa este módulo pronto pra ser
// ligado a uma tabela Postgres real depois, sem reescrever a lógica —
// só trocar "array em memória" por "linha lida/escrita via RPC".
//
// Princípio central, repetido em cada função: MEMÓRIA NUNCA É
// AUTORIZAÇÃO COMERCIAL, não importa a confiança do model nem a fonte
// da evidência. `selectContextMemories` devolve sempre `contextOnly:
// true` (tipo literal, não um boolean solto que alguém possa esquecer
// de checar) — o Planner/Context Builder, quando este módulo for
// ligado a eles (fora de escopo aqui), precisa tratar isso como
// conhecimento de fundo, nunca como um registro em approval_records.
//
// Riscos conhecidos que este protótipo NÃO resolve (documentados, não
// escondidos — fora de escopo desta etapa, aguardando desenho
// separado com aprovação da fundadora):
// - Preferências contraditórias: duas memórias aprovadas do mesmo
//   kind podem dizer coisas opostas; selectContextMemories hoje só
//   desempata por "mais recente" no dedup por (kind, valor
//   normalizado) — não detecta contradição semântica entre valores
//   DIFERENTES do mesmo kind (ex.: "prefere contratos de 2h" vs
//   "prefere contratos de 4h" nunca colidem no dedup, os dois
//   passariam juntos pro contexto).
// - Supersession: não existe um conceito de "esta memória substitui
//   aquela outra" — uma correção nova vira uma proposta nova
//   independente, nunca marca a antiga como superada automaticamente.
// - Trilha de auditoria completa: reviewedAt/reviewedBy guardam só a
//   ÚLTIMA decisão: não há histórico de quem propôs, quem revisou,
//   quantas vezes foi editada.
// - Eliminação de dados (LGPD): revokeMemory muda o status, nunca
//   apaga o registro — right to be forgotten de verdade exige um
//   mecanismo de exclusão física separado, com seu próprio desenho.
// - Persistência concorrente: estas funções são puras (sem lock, sem
//   transação) — quando ligadas a Postgres, cada transição de estado
//   (propose/review/revoke) precisa do mesmo rigor de claim/lease já
//   usado em outbound_intents/pending_delegated_contacts (UPDATE...
//   WHERE status atual, nunca um "ler depois escrever" ingênuo), senão
//   duas revisões simultâneas da mesma proposta podem colidir.

export const MEMORY_KINDS = ['communication_style', 'operational_preference', 'commercial_preference', 'client_context'] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

export const MEMORY_EVIDENCE_SOURCE_TYPES = ['professional_message', 'professional_edit', 'booking_outcome', 'client_message'] as const;
export type MemoryEvidenceSourceType = (typeof MEMORY_EVIDENCE_SOURCE_TYPES)[number];

export const MEMORY_STATUSES = ['proposed', 'approved', 'rejected', 'revoked'] as const;
export type MemoryStatus = (typeof MEMORY_STATUSES)[number];

export const MAX_MEMORY_VALUE_CHARS = 500;
export const MAX_CONTEXT_MEMORIES = 8;

export type MemoryEvidence = {
  sourceType: MemoryEvidenceSourceType;
  // ID da origem (mensagem, booking, edição) — nunca o texto bruto
  // duplicado aqui. O texto fica só na fonte original (conversation_messages,
  // bookings etc.), auditável de volta por este ID quando este módulo
  // for ligado ao banco.
  sourceId: string;
};

export type ProfessionalMemory = {
  id: string;
  professionalId: string;
  kind: MemoryKind;
  value: string;
  evidence: MemoryEvidence;
  // 0..1 — autoavaliação de confiança na extração, NUNCA uma
  // autorização. Uma confiança alta de uma evidência client_message
  // continua exigindo revisão humana explícita (reviewMemory) antes de
  // qualquer uso — nada aqui "pula a fila" por causa da confiança.
  confidence: number;
  status: MemoryStatus;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  expiresAt: string | null;
};

export type MemoryPolicyError =
  | 'invalid_professional_id'
  | 'invalid_kind'
  | 'invalid_evidence_source_type'
  | 'invalid_evidence_source_id'
  | 'empty_value'
  | 'value_too_long'
  | 'invalid_confidence'
  | 'invalid_expires_at'
  | 'expires_at_in_the_past'
  | 'not_proposed'
  | 'not_approved'
  | 'reviewer_not_authorized';

export type MemoryPolicyResult<T> = { ok: true; memory: T } | { ok: false; reason: MemoryPolicyError };

function isValidDateString(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime());
}

// ============================================================
// proposeMemory — único jeito de uma memória nascer. SEMPRE
// status='proposed', nunca aprovada de origem (nem quando a evidência
// vem de booking_outcome ou é dada como alta confiança) — "evidência
// de cliente jamais equivale a instrução confiável" generaliza aqui
// pra TODA fonte: nenhuma fonte, sozinha, autoriza. Só reviewMemory
// (uma decisão humana explícita) muda isso.
// ============================================================

export type ProposeMemoryInput = {
  // Opcional — quando omitido, gera via crypto.randomUUID() (mesmo
  // padrão já usado em beta-integration/trigger.ts pra eventos sem
  // provider real). Testes passam um id fixo pra determinismo.
  id?: string;
  professionalId: string;
  kind: MemoryKind;
  value: string;
  evidence: MemoryEvidence;
  confidence: number;
  expiresAt?: string | null;
  now?: Date;
};

export function proposeMemory(input: ProposeMemoryInput): MemoryPolicyResult<ProfessionalMemory> {
  if (!input.professionalId || !input.professionalId.trim()) return { ok: false, reason: 'invalid_professional_id' };
  if (!MEMORY_KINDS.includes(input.kind)) return { ok: false, reason: 'invalid_kind' };
  if (!MEMORY_EVIDENCE_SOURCE_TYPES.includes(input.evidence?.sourceType)) return { ok: false, reason: 'invalid_evidence_source_type' };
  if (!input.evidence?.sourceId || !input.evidence.sourceId.trim()) return { ok: false, reason: 'invalid_evidence_source_id' };

  const trimmedValue = input.value?.trim() ?? '';
  if (trimmedValue.length === 0) return { ok: false, reason: 'empty_value' };
  // Rejeita em vez de truncar: truncar um valor tipo "nunca aceita
  // evento fora de SP, a menos que o cachê cubra deslocamento" na
  // marca de 500 caracteres poderia cortar justo a ressalva, invertendo
  // o sentido. Melhor recusar e pedir uma versão mais curta do que
  // guardar uma memória malformada que parece completa mas não é.
  if (trimmedValue.length > MAX_MEMORY_VALUE_CHARS) return { ok: false, reason: 'value_too_long' };

  if (typeof input.confidence !== 'number' || Number.isNaN(input.confidence) || input.confidence < 0 || input.confidence > 1) {
    return { ok: false, reason: 'invalid_confidence' };
  }

  const now = input.now ?? new Date();
  let expiresAt: string | null = null;
  if (input.expiresAt !== undefined && input.expiresAt !== null) {
    if (!isValidDateString(input.expiresAt)) return { ok: false, reason: 'invalid_expires_at' };
    if (new Date(input.expiresAt).getTime() <= now.getTime()) return { ok: false, reason: 'expires_at_in_the_past' };
    expiresAt = input.expiresAt;
  }

  const memory: ProfessionalMemory = {
    id: input.id ?? crypto.randomUUID(),
    professionalId: input.professionalId,
    kind: input.kind,
    value: trimmedValue,
    evidence: input.evidence,
    confidence: input.confidence,
    status: 'proposed',
    createdAt: now.toISOString(),
    reviewedAt: null,
    reviewedBy: null,
    expiresAt,
  };
  return { ok: true, memory };
}

// ============================================================
// reviewMemory — única function que pode mover 'proposed' ->
// 'approved'/'rejected'. "Validar identidade autenticada" (requisito
// explícito da fundadora), traduzido pra este módulo isolado sem
// acesso a auth real: reviewerId precisa ser EXATAMENTE o
// professionalId dono da memória — nunca uma string qualquer, nunca o
// id de quem forneceu a evidência (o cliente nunca pode ser seu
// próprio revisor, mesmo que a evidência tenha vindo dele). Quando
// este módulo for ligado ao runtime real, quem chama reviewMemory
// precisa ter resolvido reviewerId a partir de uma sessão autenticada
// de verdade (auth.uid()) — este módulo só garante que o ID
// apresentado bate com o dono, nunca resolve "quem está logado" (isso
// é responsabilidade de quem integra, fora de escopo aqui).
// ============================================================

export type ReviewMemoryInput = {
  memory: ProfessionalMemory;
  reviewerId: string;
  decision: 'approved' | 'rejected';
  now?: Date;
};

export function reviewMemory(input: ReviewMemoryInput): MemoryPolicyResult<ProfessionalMemory> {
  if (input.memory.status !== 'proposed') return { ok: false, reason: 'not_proposed' };
  if (!input.reviewerId || input.reviewerId !== input.memory.professionalId) return { ok: false, reason: 'reviewer_not_authorized' };

  const now = input.now ?? new Date();
  return {
    ok: true,
    memory: { ...input.memory, status: input.decision, reviewedAt: now.toISOString(), reviewedBy: input.reviewerId },
  };
}

// ============================================================
// revokeMemory — único jeito de tirar uma memória já aprovada de
// circulação. Requisito explícito: "deve impedir que uma memória
// revogada volte ao contexto" — satisfeito estruturalmente por
// selectContextMemories abaixo, que só aceita status==='approved'
// (nunca 'revoked'); esta function garante que a TRANSIÇÃO em si só
// parte de 'approved' (nunca revoga uma proposta nunca aprovada, nem
// revoga duas vezes) e exige a mesma prova de identidade de
// reviewMemory.
// ============================================================

export type RevokeMemoryInput = {
  memory: ProfessionalMemory;
  revokedBy: string;
  now?: Date;
};

export function revokeMemory(input: RevokeMemoryInput): MemoryPolicyResult<ProfessionalMemory> {
  if (input.memory.status !== 'approved') return { ok: false, reason: 'not_approved' };
  if (!input.revokedBy || input.revokedBy !== input.memory.professionalId) return { ok: false, reason: 'reviewer_not_authorized' };

  const now = input.now ?? new Date();
  return {
    ok: true,
    memory: { ...input.memory, status: 'revoked', reviewedAt: now.toISOString(), reviewedBy: input.revokedBy },
  };
}

// ============================================================
// selectContextMemories — único ponto de leitura pro Context
// Builder/Planner (quando ligado, fora de escopo aqui). Isolamento
// por profissional SEMPRE primeiro filtro (nunca confia que o array
// de entrada já veio filtrado) — mesma disciplina de "nunca confia só
// num parâmetro" já documentada em tool-registry.ts.
// ============================================================

export type ContextMemoryView = {
  id: string;
  kind: MemoryKind;
  value: string;
  confidence: number;
  // Tipo literal `true`, nunca `boolean` solto — estruturalmente
  // impossível esquecer de marcar isto como contexto, não autorização
  // (mesmo espírito do schema do Planner que exclui wait_for_* por
  // impossibilidade estrutural, não checagem em runtime).
  contextOnly: true;
};

export type SelectContextMemoriesParams = {
  professionalId: string;
  now?: Date;
  limit?: number;
};

export function selectContextMemories(memories: readonly ProfessionalMemory[], params: SelectContextMemoriesParams): ContextMemoryView[] {
  const now = params.now ?? new Date();
  const limit = params.limit ?? MAX_CONTEXT_MEMORIES;

  const eligible = memories.filter((m) => {
    if (m.professionalId !== params.professionalId) return false; // isolamento de tenant, sempre primeiro
    if (m.status !== 'approved') return false; // nunca proposed/rejected/revoked
    if (m.expiresAt !== null && new Date(m.expiresAt).getTime() <= now.getTime()) return false; // nunca expirada
    return true;
  });

  // Deduplicação determinística: mesma (kind, valor normalizado) só
  // pode contribuir UMA vez pro contexto — mantém a mais recente
  // (createdAt desc, desempate por id asc pra ordem 100% previsível
  // mesmo com timestamps idênticos). Não resolve contradição semântica
  // entre valores DIFERENTES do mesmo kind (ver riscos residuais no
  // topo do arquivo) — só duplicidade literal/quase-literal.
  const dedupKey = (m: ProfessionalMemory) => `${m.kind}|${m.value.trim().toLowerCase()}`;
  const byKey = new Map<string, ProfessionalMemory>();
  for (const m of eligible) {
    const key = dedupKey(m);
    const existing = byKey.get(key);
    if (!existing || isMoreRecent(m, existing)) byKey.set(key, m);
  }

  const ordered = [...byKey.values()].sort((a, b) => {
    const byDate = b.createdAt.localeCompare(a.createdAt); // mais recente primeiro
    if (byDate !== 0) return byDate;
    return a.id.localeCompare(b.id); // desempate determinístico, nunca ordem de insersão do Map
  });

  return ordered.slice(0, limit).map((m) => ({
    id: m.id,
    kind: m.kind,
    value: m.value,
    confidence: m.confidence,
    contextOnly: true,
  }));
}

// ============================================================
// buildMemoryConfirmationQuestion — pergunta determinística enviada
// depois de propor uma memória (task #72). Pura, sem I/O, por um
// motivo estrutural específico: o pipeline precisa COMPARAR a última
// mensagem de IA da conversa contra o resultado desta function (pra
// ESTA linha específica) antes de tratar a próxima mensagem da
// profissional como resposta à confirmação — nunca aceitar "existe
// uma proposta pendente" como prova suficiente de continuidade (mesma
// lição estrutural do ADR 0010: estado antigo nunca decide por si só,
// sem verificar que é realmente sobre o que está sendo perguntado
// agora). Gerar isto em dois lugares diferentes (ao propor, ao
// comparar) com a MESMA function pura elimina o risco de os dois
// textos divergirem por acidente.
// ============================================================

export function buildMemoryConfirmationQuestion(value: string): string {
  return `Anotei que você disse: "${value}". Posso guardar isso como uma preferência sua, pra eu levar em conta daqui pra frente?`;
}

// ============================================================
// Task #76 (ADR 0012) — DESENHO/PREPARAÇÃO, nunca wiring ainda.
//
// resolveMemorySupersessionCandidate: decide se uma declaração nova
// contradiz (mesmo kind, mesmo escopo) uma memória JÁ APROVADA, ou
// coexiste com ela (mesmo kind, escopo diferente) — distinção exigida
// explicitamente pela fundadora ("sempre 2h" -> "sempre 4h" substitui;
// "2h em bares" e "4h em casamentos" convivem). Nunca decide por
// `kind` sozinho (isso seria substituição indiscriminada, rejeitada
// por ela) — mesmo raciocínio de subjectKey já validado em
// policy-gate-post/matcher.ts (resolveSubjectKey): o model PROPÕE um
// rótulo livre curto de escopo (ex. "bar", "casamento"), nunca decide
// ele mesmo o que fazer com isso — só esta function pura, 100% código,
// é autoridade sobre supersede/coexist/ambiguous.
//
// Tipos próprios (ScopedMemoryCandidate), DELIBERADAMENTE não
// integrados a ProfessionalMemory/professional_memories ainda — a
// coluna subjectKey não existe no schema real (migration 0119 não
// previu isto). Função pura primeiro, schema depois, só com aprovação
// explícita (ver ADR 0012) — mesma ordem de sempre neste projeto.
// ============================================================

export type ScopedMemoryCandidate = {
  id: string;
  kind: MemoryKind;
  // null = regra geral, sem escopo específico (ex.: "sempre faço 2h").
  // Normalizado (trim + lowercase) na comparação, nunca no dado
  // guardado — o valor original, como o model propôs, é preservado.
  subjectKey: string | null;
  value: string;
};

export type MemorySupersessionResolution =
  | { kind: 'coexist' }
  | { kind: 'supersede_candidate'; existing: ScopedMemoryCandidate }
  // Duas ou mais aprovadas do mesmo kind+subjectKey (nunca deveria
  // existir se esta mesma function sempre decidiu a entrada de cada
  // uma — mas dado legado ou um subjectKey ambíguo que não desempatou
  // claramente também cai aqui) — NUNCA escolhe uma candidata
  // arbitrariamente, mesmo princípio de resolveSubjectKey (policy-gate-post).
  | { kind: 'ambiguous'; matches: ScopedMemoryCandidate[] };

function normalizeSubjectKey(subjectKey: string | null): string | null {
  const trimmed = subjectKey?.trim().toLowerCase() ?? '';
  return trimmed.length === 0 ? null : trimmed;
}

export function resolveMemorySupersessionCandidate(
  declaration: { kind: MemoryKind; subjectKey: string | null },
  existingApproved: readonly ScopedMemoryCandidate[]
): MemorySupersessionResolution {
  const declaredSubjectKey = normalizeSubjectKey(declaration.subjectKey);

  const sameSubject = existingApproved.filter((m) => m.kind === declaration.kind && normalizeSubjectKey(m.subjectKey) === declaredSubjectKey);

  if (sameSubject.length === 0) return { kind: 'coexist' };
  if (sameSubject.length === 1) return { kind: 'supersede_candidate', existing: sameSubject[0] };
  return { kind: 'ambiguous', matches: sameSubject };
}

// ============================================================
// buildMemorySupersessionQuestion — pergunta determinística quando
// resolveMemorySupersessionCandidate devolve 'supersede_candidate'.
// Mesmo motivo estrutural de buildMemoryConfirmationQuestion: gerada
// uma única vez, nunca duas formulações divergentes pro mesmo caso.
// Menciona a preferência antiga EXPLICITAMENTE — nunca substitui
// silenciosamente sem a profissional saber o que está sendo trocado.
// ============================================================

export function buildMemorySupersessionQuestion(newValue: string, oldValue: string): string {
  return `Anotei que você disse: "${newValue}". Isso substitui a preferência anterior ("${oldValue}"), certo? Se sim, vou atualizar.`;
}

function isMoreRecent(a: ProfessionalMemory, b: ProfessionalMemory): boolean {
  const byDate = a.createdAt.localeCompare(b.createdAt);
  if (byDate !== 0) return byDate > 0;
  return a.id.localeCompare(b.id) > 0;
}
