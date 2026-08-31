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

// Toda identidade (categoria+subject) que um conjunto de checks
// efetivamente TOCA — matched OU blocked, qualquer motivo. Nunca usada
// pra decidir approve/block (isso é 100% do Gate) — só pra saber se um
// draft fresco chegou a DISCUTIR o assunto, mesmo que tenha bloqueado
// por um motivo fora do mecanismo de pendência (ex.: commercial_root_terminal).
function touchedIdentities(checks: readonly GateCheckSnapshot[]): BlockedIdentity[] {
  return checks.filter((c) => c.subjectKey !== null).map((c) => ({ decisionCategory: c.decisionCategory, subjectKey: c.subjectKey! }));
}

// Retomada durável — contexto posterior (correção pós-freeze, sem
// migration nova): a reavaliação de uma pendência agora vê a
// conversation INTEIRA até agora, nunca só a fotografia congelada no
// trigger original (achado do usuário: um draft fresco pode
// legitimamente não ter NADA a ver com o que esta pendência
// bloqueava, porque a conversa seguiu pra outro assunto enquanto ela
// esperava). Sem isso, `runResumptionCycle`
// completaria a pendência com um envio que nunca de fato re-confirmou
// o compromisso original — perda silenciosa disfarçada de sucesso.
//
// originalIdentities vem de blockedIdentities(pendingChecks) — as
// MESMAS identidades elegíveis que criaram esta pendência
// (shouldCreatePendingReply). freshChecks é comparado por
// touchedIdentities (matched OU blocked, qualquer motivo) — só
// precisamos saber se o assunto foi de fato revisitado, o outcome real
// (allowed/blocked) continua 100% decisão do Gate re-avaliado.
//
// TODAS as identidades originais precisam ser tocadas, nunca "pelo
// menos uma" (achado da 2ª rodada de auditoria, mesmo princípio já
// aplicado a subject_key_unresolved em isEligibleForAutoMatch/
// shouldAttemptResume): uma pendência pode ter nascido de UMA decisão
// com MÚLTIPLOS commitments bloqueados (ex.: preço E logística no
// mesmo draft original). Se o draft fresco só volta a tratar de um
// deles, resolver/superseder a pendência inteira perderia a obrigação
// do outro silenciosamente — nunca resume/supersede parcial, mesma
// disciplina de "nenhum blocker sem identidade prescinde a pendência
// inteira" já usada pro caso subject_key_unresolved.
export function freshChecksAddressPendingIdentities(pendingChecks: readonly GateCheckSnapshot[], freshChecks: readonly GateCheckSnapshot[]): boolean {
  const originalIdentities = blockedIdentities(pendingChecks);
  if (originalIdentities.length === 0) return false;
  const touched = touchedIdentities(freshChecks);
  return originalIdentities.every((o) => touched.some((t) => t.decisionCategory === o.decisionCategory && t.subjectKey === o.subjectKey));
}
