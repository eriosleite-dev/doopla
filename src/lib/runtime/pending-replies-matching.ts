import type { GateCheckSnapshot } from './pending-replies';

// Doopla Intelligence Core v1 — Runtime: matching de pendências. 100%
// código puro (sem I/O), testável isoladamente — mesma disciplina de
// matcher.ts (Bloco 6) e recipient.ts/disposition.ts (fechamento do
// Runtime). SQL só executa o que estas funções já decidiram, nunca
// decide sozinho.

// Só estes três motivos representam "falta decisão/aprovação do
// profissional" — os outros (invalid_extracted_value, commercial_root_terminal,
// professional_not_operationally_ready, extraction_unavailable) são
// classes de problema DIFERENTES que uma approval nunca resolve (dado
// malformado, raiz morta, profissional sem dados de recebimento,
// extrator fora do ar) — nunca criam pendência neste mecanismo.
const PENDING_REPLY_ELIGIBLE_BLOCK_REASONS = new Set(['no_matching_approval', 'stale_dependency', 'subject_key_unresolved']);

export function shouldCreatePendingReply(checks: readonly GateCheckSnapshot[]): boolean {
  return checks.some((c) => c.result === 'blocked' && c.blockReason !== null && PENDING_REPLY_ELIGIBLE_BLOCK_REASONS.has(c.blockReason));
}

// Elegibilidade pra matching AUTOMÁTICO (supersessão na criação, ou
// retomada disparada por approval resolvida) — decisão do usuário,
// dois ajustes finais: se QUALQUER commitment necessário desta
// pendência ficou subject_key_unresolved, a pendência INTEIRA nunca
// entra no fluxo automático (nunca resume parcial silenciosamente, e
// nunca supersede por identidade que não dá pra provar). Isso vale
// mesmo que OUTROS commitments da mesma pendência tenham subject_key
// resolvido — um blocker sem identidade prescinde a pendência inteira
// de auto-match.
export function isEligibleForAutoMatch(checks: readonly GateCheckSnapshot[]): boolean {
  return !checks.some((c) => c.result === 'blocked' && c.blockReason === 'subject_key_unresolved');
}

export type BlockedIdentity = { decisionCategory: string; subjectKey: string };

// Identidades REAIS (categoria+subject resolvido) dos commitments
// bloqueados por motivo que uma approval resolve — nunca inclui
// subject_key_unresolved (subjectKey null ali, não há identidade pra
// extrair) nem os motivos fora do escopo deste mecanismo.
export function blockedIdentities(checks: readonly GateCheckSnapshot[]): BlockedIdentity[] {
  return checks
    .filter((c) => c.result === 'blocked' && c.blockReason !== null && PENDING_REPLY_ELIGIBLE_BLOCK_REASONS.has(c.blockReason) && c.subjectKey !== null)
    .map((c) => ({ decisionCategory: c.decisionCategory, subjectKey: c.subjectKey! }));
}

function identitiesOverlap(a: readonly BlockedIdentity[], b: readonly BlockedIdentity[]): boolean {
  return a.some((x) => b.some((y) => x.decisionCategory === y.decisionCategory && x.subjectKey === y.subjectKey));
}

// Uma pendência ANTIGA só é supersedida por uma NOVA quando: a antiga
// é elegível a auto-match (nunca supersede uma subject_key_unresolved
// por identidade que não dá pra provar — decisão do usuário) E as
// identidades bloqueadas se sobrepõem de verdade (categoria+subject
// reais, nunca root/categoria sozinhos).
export function shouldSupersedeOnCreation(oldChecks: readonly GateCheckSnapshot[], newChecks: readonly GateCheckSnapshot[]): boolean {
  if (!isEligibleForAutoMatch(oldChecks)) return false;
  return identitiesOverlap(blockedIdentities(oldChecks), blockedIdentities(newChecks));
}

// Vale a pena tentar retomar esta pendência agora que estas
// identidades foram aprovadas? Só quando elegível (nenhum blocker
// subject_key_unresolved) E pelo menos uma identidade bloqueada bate
// com o que acabou de ser aprovado. A resolução DE VERDADE (todos os
// commitments, não só este) é sempre decidida pelo Gate re-avaliado
// do zero — isto só decide se vale tentar, nunca se vai dar certo.
export function shouldAttemptResume(pendingChecks: readonly GateCheckSnapshot[], newlyApprovedIdentities: readonly BlockedIdentity[]): boolean {
  if (!isEligibleForAutoMatch(pendingChecks)) return false;
  return identitiesOverlap(blockedIdentities(pendingChecks), newlyApprovedIdentities);
}
