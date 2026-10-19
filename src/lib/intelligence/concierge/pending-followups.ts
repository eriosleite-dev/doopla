// Doopla Intelligence Core v1 — Acompanhamento proativo / pendências
// (16/10/2026, ADR 0006, resposta ao item 5 do pedido da fundadora).
//
// Mesmo princípio estrutural de learning/memory-policy.ts: módulo
// 100% ISOLADO de propósito — nenhum I/O, nenhum Supabase, nenhuma
// migration, nenhuma conexão com runtime/Classifier/Planner/cron.
// Funções puras — recebem o estado atual (pendências já existentes)
// como parâmetro e devolvem o próximo estado. Pronto pra ser ligado a
// uma tabela Postgres real depois (mesma troca "array em memória" por
// "linha lida/escrita via RPC" de memory-policy.ts), nunca
// implementado como toggle de produção nesta etapa.
//
// Categorias de pendência vêm de DOOPLA_AI_FIRST_DOCUMENTO_MESTRE_V2.docx
// (seção 43, Follow-up) — gatilhos operacionais REAIS já decididos
// pela fundadora, nunca lembretes inventados: "proposta sem resposta",
// "cliente disse que vai falar com marketing/produção", "cliente
// prometeu retorno em data específica", "contrato aguardando
// assinatura", "sinal ou saldo pendente", "informação de produção
// faltando".
//
// Princípio central (mesma seção, repetido): respeitar o prazo que o
// PRÓPRIO cliente prometeu, nunca insistir infinitamente, encerrar
// como "sem retorno" quando adequado — nunca um motor de lembretes
// agressivo e genérico.

export const PENDING_FOLLOWUP_KINDS = [
  'proposal_no_response',
  'client_said_will_check_internally',
  'client_promised_return_by_date',
  'contract_awaiting_signature',
  'deposit_or_balance_pending',
  'missing_production_info',
] as const;
export type PendingFollowupKind = (typeof PENDING_FOLLOWUP_KINDS)[number];

export const PENDING_FOLLOWUP_STATUSES = ['open', 'resolved', 'closed_no_response', 'cancelled'] as const;
export type PendingFollowupStatus = (typeof PENDING_FOLLOWUP_STATUSES)[number];

// Evidência real de onde o gatilho nasceu — nunca um lembrete sem
// origem rastreável (mesmo princípio de MemoryEvidence em
// memory-policy.ts).
export type PendingFollowupEvidence = {
  sourceType: 'conversation_message' | 'booking' | 'opportunity';
  sourceId: string;
};

export type PendingFollowup = {
  id: string;
  professionalId: string;
  // Booking/opportunity a que esta pendência pertence — isolamento
  // segue o mesmo tenant/registro, nunca solto no ar.
  bookingId: string | null;
  opportunityId: string | null;
  kind: PendingFollowupKind;
  // Quem precisa agir pra destravar — nunca ambíguo. "doopla" quando o
  // próximo passo é a própria Doopla insistir/checar (ex.: reenviar
  // follow-up); "professional"/"external_participant" quando alguém
  // precisa decidir algo que só essa pessoa pode.
  responsibleParty: 'doopla' | 'professional' | 'external_participant';
  evidence: PendingFollowupEvidence;
  // Prazo PROMETIDO pela própria pessoa (cliente/profissional), nunca
  // um prazo que a Doopla inventou sozinha — null quando não há
  // prazo explícito, caso em que dueAt fica a cargo de uma janela
  // padrão definida fora deste módulo (decisão de produto, não lógica
  // pura).
  promisedReturnAt: string | null;
  // Quando este follow-up deveria ser revisitado — sempre calculado,
  // nunca null (mesmo sem promisedReturnAt, o chamador passa um
  // default explícito na criação, nunca este módulo inventa).
  dueAt: string;
  status: PendingFollowupStatus;
  createdAt: string;
  resolvedAt: string | null;
  // Quantas vezes já tentamos (reenvio de follow-up) — usado por
  // selectDuePendingFollowups/shouldStopFollowingUp pra nunca insistir
  // infinitamente (princípio explícito do Documento Mestre, seção 43).
  attemptCount: number;
};

export type PendingFollowupError =
  | 'invalid_professional_id'
  | 'invalid_kind'
  | 'invalid_responsible_party'
  | 'invalid_evidence_source_id'
  | 'invalid_due_at'
  | 'due_at_in_the_past'
  | 'missing_booking_and_opportunity'
  | 'not_open';

export type PendingFollowupResult<T> = { ok: true; followup: T } | { ok: false; reason: PendingFollowupError };

function isValidDateString(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime());
}

// ============================================================
// createPendingFollowup — único jeito de uma pendência nascer.
// Precisa SEMPRE de evidência real e de pelo menos um vínculo
// (booking ou opportunity) — nunca um follow-up solto, sem origem
// nem destino operacional.
// ============================================================

export type CreatePendingFollowupInput = {
  id?: string;
  professionalId: string;
  bookingId?: string | null;
  opportunityId?: string | null;
  kind: PendingFollowupKind;
  responsibleParty: PendingFollowup['responsibleParty'];
  evidence: PendingFollowupEvidence;
  promisedReturnAt?: string | null;
  // Obrigatório mesmo quando promisedReturnAt existe — este módulo
  // nunca decide sozinho a janela padrão quando não há prazo
  // prometido (isso é decisão de produto, de quem chama).
  dueAt: string;
  now?: Date;
};

export function createPendingFollowup(input: CreatePendingFollowupInput): PendingFollowupResult<PendingFollowup> {
  if (!input.professionalId || !input.professionalId.trim()) return { ok: false, reason: 'invalid_professional_id' };
  if (!PENDING_FOLLOWUP_KINDS.includes(input.kind)) return { ok: false, reason: 'invalid_kind' };
  if (!['doopla', 'professional', 'external_participant'].includes(input.responsibleParty)) return { ok: false, reason: 'invalid_responsible_party' };
  if (!input.evidence?.sourceId || !input.evidence.sourceId.trim()) return { ok: false, reason: 'invalid_evidence_source_id' };
  if (!input.bookingId && !input.opportunityId) return { ok: false, reason: 'missing_booking_and_opportunity' };
  if (!isValidDateString(input.dueAt)) return { ok: false, reason: 'invalid_due_at' };
  if (input.promisedReturnAt !== undefined && input.promisedReturnAt !== null && !isValidDateString(input.promisedReturnAt)) {
    return { ok: false, reason: 'invalid_due_at' };
  }

  const now = input.now ?? new Date();
  if (new Date(input.dueAt).getTime() <= now.getTime()) return { ok: false, reason: 'due_at_in_the_past' };

  const followup: PendingFollowup = {
    id: input.id ?? crypto.randomUUID(),
    professionalId: input.professionalId,
    bookingId: input.bookingId ?? null,
    opportunityId: input.opportunityId ?? null,
    kind: input.kind,
    responsibleParty: input.responsibleParty,
    evidence: input.evidence,
    promisedReturnAt: input.promisedReturnAt ?? null,
    dueAt: input.dueAt,
    status: 'open',
    createdAt: now.toISOString(),
    resolvedAt: null,
    attemptCount: 0,
  };
  return { ok: true, followup };
}

// ============================================================
// resolvePendingFollowup / cancelPendingFollowup — únicos jeitos de
// tirar uma pendência de circulação, sempre a partir de 'open'.
// ============================================================

export function resolvePendingFollowup(followup: PendingFollowup, now = new Date()): PendingFollowupResult<PendingFollowup> {
  if (followup.status !== 'open') return { ok: false, reason: 'not_open' };
  return { ok: true, followup: { ...followup, status: 'resolved', resolvedAt: now.toISOString() } };
}

// "Encerrar como sem retorno" (Documento Mestre, seção 43) — nunca
// apagar, sempre um status terminal explícito e auditável.
export function closePendingFollowupAsNoResponse(followup: PendingFollowup, now = new Date()): PendingFollowupResult<PendingFollowup> {
  if (followup.status !== 'open') return { ok: false, reason: 'not_open' };
  return { ok: true, followup: { ...followup, status: 'closed_no_response', resolvedAt: now.toISOString() } };
}

export function cancelPendingFollowup(followup: PendingFollowup, now = new Date()): PendingFollowupResult<PendingFollowup> {
  if (followup.status !== 'open') return { ok: false, reason: 'not_open' };
  return { ok: true, followup: { ...followup, status: 'cancelled', resolvedAt: now.toISOString() } };
}

// Reagenda pra uma nova data (ex.: depois de um reenvio de follow-up)
// — incrementa attemptCount sempre, nunca silenciosamente.
export function rescheduleOpenFollowup(followup: PendingFollowup, nextDueAt: string): PendingFollowupResult<PendingFollowup> {
  if (followup.status !== 'open') return { ok: false, reason: 'not_open' };
  if (!isValidDateString(nextDueAt)) return { ok: false, reason: 'invalid_due_at' };
  return { ok: true, followup: { ...followup, dueAt: nextDueAt, attemptCount: followup.attemptCount + 1 } };
}

// ============================================================
// selectDuePendingFollowups — único ponto de leitura pro futuro
// sweep/cron (quando ligado, fora de escopo aqui — mesmo padrão de
// sweepDelegatedContactExpirations em delegated-contact-flow.ts).
// Isolamento por profissional sempre primeiro filtro.
// ============================================================

export type SelectDuePendingFollowupsParams = {
  professionalId: string;
  now?: Date;
  // Nunca insistir infinitamente (Documento Mestre, seção 43) — teto
  // de tentativas explícito, decisão de quem chama, nunca um valor
  // mágico escondido neste módulo.
  maxAttempts: number;
};

export function selectDuePendingFollowups(followups: readonly PendingFollowup[], params: SelectDuePendingFollowupsParams): PendingFollowup[] {
  const now = params.now ?? new Date();
  return followups
    .filter((f) => f.professionalId === params.professionalId) // isolamento de tenant, sempre primeiro
    .filter((f) => f.status === 'open')
    .filter((f) => new Date(f.dueAt).getTime() <= now.getTime())
    .filter((f) => f.attemptCount < params.maxAttempts) // nunca insiste além do teto — quem chama decide fechar como closed_no_response
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt)); // mais atrasado primeiro, ordem determinística
}

// Pendências que já estouraram o teto de tentativas e deveriam ser
// encerradas como "sem retorno" — leitura separada de
// selectDuePendingFollowups de propósito, pra nunca confundir "hora de
// tentar de novo" com "hora de desistir" (são decisões diferentes,
// mesmo princípio de nunca colapsar estados semanticamente distintos).
export function selectFollowupsToCloseAsNoResponse(followups: readonly PendingFollowup[], params: SelectDuePendingFollowupsParams): PendingFollowup[] {
  const now = params.now ?? new Date();
  return followups
    .filter((f) => f.professionalId === params.professionalId)
    .filter((f) => f.status === 'open')
    .filter((f) => new Date(f.dueAt).getTime() <= now.getTime())
    .filter((f) => f.attemptCount >= params.maxAttempts);
}
