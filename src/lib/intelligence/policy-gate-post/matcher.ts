import { isMultiInstanceCategory, SINGULAR_SUBJECT_KEY, SUBJECT_KEY_TAXONOMY, validateApprovedValue } from '../approval/value-schemas';
import type { ProfessionalDecisionCategory } from '../planner/decision-categories';
import { POLICY_GATE_VERSION } from './config';
import type { ActiveApprovalForMatch, CommitmentCheck, ExtractedCommitment, PostModelGateResult } from './types';
import { valuesStructurallyEqual } from './value-equality';

// Doopla Intelligence Core v1 — Post-model Policy Gate: matcher.
// 100% código, puro (sem I/O) — nenhuma função aqui chama o model nem
// toca supabase. É a ÚNICA autoridade sobre allow/block; o extrator só
// propõe candidatos a compromisso, nunca decide.

// Categorias singulares (~9 de 13): 'primary' sempre, ignora
// completamente o que o model propôs em rawSubjectKey — nunca confia
// no model pra algo que o código já sabe deterministicamente.
//
// Categorias multi-instância (scope_change/logistics_commitment/
// contractual_exception/other_commitment_change): tenta o subject_key
// proposto pelo model SE estiver na taxonomia fechada
// (SUBJECT_KEY_TAXONOMY); other_commitment_change não tem taxonomia
// fechada (V2, herdado — nunca inventamos uma agora). Em qualquer caso
// em que o subject_key não pôde ser validado, cai no fallback de
// cardinalidade: se existir EXATAMENTE UMA approval ativa daquela
// categoria neste commercial root, usa o subject_key DELA (caso
// inambíguo — o trabalho só tem uma instância negociada daquela
// categoria, não precisa do model acertar o rótulo). Se existirem
// ZERO ou 2+ approvals ativas na categoria, fica genuinamente
// ambíguo — bloqueia (subject_key_unresolved), nunca escolhe uma
// candidata arbitrária.
export function resolveSubjectKey(
  category: ProfessionalDecisionCategory,
  rawSubjectKey: string | null,
  activeApprovalsInCategory: readonly ActiveApprovalForMatch[]
): string | null {
  if (!isMultiInstanceCategory(category)) return SINGULAR_SUBJECT_KEY;

  const taxonomy = SUBJECT_KEY_TAXONOMY[category];
  if (rawSubjectKey && taxonomy?.includes(rawSubjectKey)) return rawSubjectKey;

  if (activeApprovalsInCategory.length === 1) return activeApprovalsInCategory[0].subjectKey;
  return null;
}

// Match de UM commitment extraído contra o estado real. isCommercialRootTerminal
// é checado por commitment (não só uma vez no topo) de propósito — mantém a
// function pura/testável isoladamente sem depender de onde o chamador
// colocou o check; evaluateCommitments (abaixo) ainda só calcula isso
// uma vez por chamada de gate, nunca uma query por commitment.
export function matchCommitment(
  extracted: ExtractedCommitment,
  activeApprovals: readonly ActiveApprovalForMatch[],
  isCommercialRootTerminal: boolean
): CommitmentCheck {
  const valueValidation = validateApprovedValue(extracted.decisionCategory, extracted.rawValue);
  if (!valueValidation.valid) {
    return {
      decisionCategory: extracted.decisionCategory,
      subjectKey: null,
      result: 'blocked',
      blockReason: 'invalid_extracted_value',
      matchedApprovalRecordId: null,
      extractedValueForDebug: extracted.rawValue,
    };
  }
  const extractedValue = valueValidation.parsed as Record<string, unknown> | null;

  if (isCommercialRootTerminal) {
    return {
      decisionCategory: extracted.decisionCategory,
      subjectKey: null,
      result: 'blocked',
      blockReason: 'commercial_root_terminal',
      matchedApprovalRecordId: null,
      extractedValueForDebug: extractedValue,
    };
  }

  const activeApprovalsInCategory = activeApprovals.filter((a) => a.decisionCategory === extracted.decisionCategory);
  const subjectKey = resolveSubjectKey(extracted.decisionCategory, extracted.rawSubjectKey, activeApprovalsInCategory);
  if (subjectKey === null) {
    return {
      decisionCategory: extracted.decisionCategory,
      subjectKey: null,
      result: 'blocked',
      blockReason: 'subject_key_unresolved',
      matchedApprovalRecordId: null,
      extractedValueForDebug: extractedValue,
    };
  }

  const candidate = activeApprovalsInCategory.find((a) => a.subjectKey === subjectKey);
  if (!candidate) {
    return {
      decisionCategory: extracted.decisionCategory,
      subjectKey,
      result: 'blocked',
      blockReason: 'no_matching_approval',
      matchedApprovalRecordId: null,
      extractedValueForDebug: extractedValue,
    };
  }

  if (!valuesStructurallyEqual(candidate.approvedValue, extractedValue)) {
    return {
      decisionCategory: extracted.decisionCategory,
      subjectKey,
      result: 'blocked',
      blockReason: 'value_mismatch',
      matchedApprovalRecordId: candidate.approvalRecordId,
      extractedValueForDebug: extractedValue,
    };
  }

  return {
    decisionCategory: extracted.decisionCategory,
    subjectKey,
    result: 'matched',
    blockReason: null,
    matchedApprovalRecordId: candidate.approvalRecordId,
    extractedValueForDebug: null,
  };
}

// Multidecisão SEMPRE em AND (item 15 da spec do usuário) — outcome
// só é 'allowed' se TODOS os commitments extraídos casaram. Zero
// commitments extraídos = allowed trivialmente (nada a verificar —
// texto que só coleta contexto/pede pra aguardar/consulta o
// profissional, item 9).
export function evaluateCommitments(
  extracted: readonly ExtractedCommitment[],
  activeApprovals: readonly ActiveApprovalForMatch[],
  isCommercialRootTerminal: boolean
): PostModelGateResult {
  const checks = extracted.map((c) => matchCommitment(c, activeApprovals, isCommercialRootTerminal));
  const firstBlocked = checks.find((c) => c.result === 'blocked');
  const outcome = firstBlocked ? 'blocked' : 'allowed';
  return { outcome, checks, policyVersion: POLICY_GATE_VERSION, primaryBlockReason: firstBlocked?.blockReason ?? null };
}
