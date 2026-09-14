import type { ProfessionalDecisionCategory } from '../planner/decision-categories';

// Doopla Intelligence Core v1 — extrator de proposta inbound: tipos.
//
// Shape estruturalmente igual a ExtractedCommitment (policy-gate-post/types.ts)
// — mesmo par decisionCategory/rawSubjectKey/rawValue, mesma disciplina
// de "model propõe, código valida" — mas deliberadamente um tipo
// PRÓPRIO, não reexportado: o significado é diferente (isto é uma
// proposta que uma das partes fez, nunca um compromisso que a Doopla
// está prestes a enviar) e as duas extrações nunca devem ser
// confundidas ou compostas por acidente.
export type DetectedInboundProposal = {
  decisionCategory: ProfessionalDecisionCategory;
  rawSubjectKey: string | null;
  rawValue: Record<string, unknown> | null;
};
