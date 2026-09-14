import type { ProfessionalDecisionCategory } from '../planner/decision-categories';

// Doopla Intelligence Core v1 — Post-model Policy Gate (Bloco novo,
// pós-Bloco 5): tipos centrais.
//
// Princípio: o model PROPÕE (draft do Planner, extração de
// compromisso), o Gate DECIDE — 100% código, matching estrutural
// contra approval_records real. Nunca um segundo Approval Resolver
// (não reinterpreta "sim"/"pode"), nunca confia no model pra revisar
// a própria resposta, nunca cria autoridade — só lê o que o Bloco 5 já
// aprovou.

export const POLICY_GATE_OUTCOMES = ['allowed', 'blocked'] as const;
export type PolicyGateOutcome = (typeof POLICY_GATE_OUTCOMES)[number];

// Motivo de bloqueio de UM commitment extraído — nunca texto livre,
// sempre um destes. Union exaustiva com o CHECK físico da migration
// 0049 (public.policy_gate_decisions.primary_block_reason).
export const POLICY_GATE_BLOCK_REASONS = [
  'no_matching_approval',
  'value_mismatch',
  'subject_key_unresolved',
  'commercial_root_terminal',
  'invalid_extracted_value',
  'extraction_unavailable',
  // Decisão do usuário (dependência entre categorias): a approval
  // usada tem valor exato, mas uma categoria da qual ela depende
  // (dependencies.ts) tem uma approval MAIS RECENTE — a premissa
  // comercial sob a qual esta approval foi dada pode ter mudado.
  'stale_dependency',
  // Fronteira do Runtime (migration 0051, decisão final do usuário):
  // o draft afirma pelo menos um compromisso concreto (ExtractedCommitment
  // não-vazio) endereçado a um external_participant, mas o profissional
  // ainda não tem dados de recebimento configurados
  // (public.is_operationally_ready). Nunca checado pra intake/discovery
  // puro (extraction vazia) nem pra mensagens internas ao próprio
  // profissional — só quando o texto já está pisando em território de
  // negociação/compromisso.
  'professional_not_operationally_ready',
] as const;
export type PolicyGateBlockReason = (typeof POLICY_GATE_BLOCK_REASONS)[number];

// Um compromisso estruturado extraído do proposedResponse — nunca
// texto livre reconstituído, sempre no shape fechado de
// APPROVED_VALUE_SCHEMAS (reusado de approval/value-schemas.ts).
export type ExtractedCommitment = {
  decisionCategory: ProfessionalDecisionCategory;
  // Proposto pelo model, SEM validação ainda — resolveSubjectKey()
  // (matcher.ts) é quem decide o valor final (código, nunca o model).
  rawSubjectKey: string | null;
  // Também não-validado ainda — validateApprovedValue() (reusado de
  // value-schemas.ts) decide se é aceitável.
  rawValue: Record<string, unknown> | null;
};

// Resultado do matching de UM commitment extraído contra o estado
// real (approval_records ativos + status estrutural do commercial
// root) — sempre um dos dois, nunca um terceiro estado ambíguo.
export type CommitmentCheck = {
  decisionCategory: ProfessionalDecisionCategory;
  subjectKey: string | null; // null só quando result='blocked' e o motivo é subject_key_unresolved/invalid_extracted_value
  result: 'matched' | 'blocked';
  blockReason: PolicyGateBlockReason | null;
  matchedApprovalRecordId: string | null;
  // Só preenchido quando result='blocked' — nunca duplicado quando
  // matched (o valor já está em approval_records, referenciável por
  // matchedApprovalRecordId; duplicar o valor aprovado aqui seria
  // armazenamento redundante de dado sensível, ver migration 0049).
  extractedValueForDebug: Record<string, unknown> | null;
};

export type PostModelGateResult = {
  outcome: PolicyGateOutcome;
  checks: CommitmentCheck[];
  policyVersion: string;
  // Primeiro motivo de bloqueio (ordem determinística: primeiro check
  // bloqueado do array) — ou 'extraction_unavailable' quando o
  // extrator falhou totalmente ANTES de produzir qualquer check
  // individual (checks fica vazio nesse caso). null só quando
  // outcome='allowed'. Espelha policy_gate_decisions.primary_block_reason
  // (migration 0049) — coluna controlada (CHECK), nunca texto livre.
  primaryBlockReason: PolicyGateBlockReason | null;
};

// Fatia de ActiveApprovalCandidate (approval/canonicalize.ts) que o
// matcher precisa — não importa o tipo inteiro do Bloco 5 pra não
// acoplar aos campos que só fazem sentido dentro de ResolutionContext
// (mesmo raciocínio estrutural de types.ts em intelligence/types.ts:
// nunca inverter a dependência entre blocos).
export type ActiveApprovalForMatch = {
  approvalRecordId: string;
  decisionCategory: string;
  subjectKey: string;
  approvedValue: Record<string, unknown> | null;
  version: number;
  // ISO-8601, ecoado direto de approval_records.created_at (get_active_approvals
  // já retorna a linha inteira). Única base pra checagem de
  // stale_dependency — version não é comparável ENTRE categorias
  // diferentes (é por chain), created_at é o único sinal de ordem
  // temporal cross-categoria disponível.
  createdAt: string;
};
