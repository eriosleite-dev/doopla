import { isMultiInstanceCategory, SINGULAR_SUBJECT_KEY, SUBJECT_KEY_TAXONOMY } from '../approval/value-schemas';
import type { ProfessionalDecisionCategory } from '../planner/decision-categories';

// Doopla Intelligence Core v1 — extrator de proposta inbound:
// resolução de subject_key pra uma proposta NOVA — deliberadamente
// diferente de matcher.ts's resolveSubjectKey() (Bloco 6), que faz
// fallback por cardinalidade contra approvals JÁ EXISTENTES (correto
// pra MATCHING contra algo já aprovado). Aqui não há nada aprovado
// ainda — é a criação de um candidato novo, então o único fallback
// seguro é a taxonomia fechada; sem isso, sem candidato (fail-closed,
// nunca inventa/adivinha uma instância).
export function resolveSubjectKeyForNewProposal(category: ProfessionalDecisionCategory, rawSubjectKey: string | null): string | null {
  if (!isMultiInstanceCategory(category)) return SINGULAR_SUBJECT_KEY;
  const taxonomy = SUBJECT_KEY_TAXONOMY[category];
  if (rawSubjectKey && taxonomy?.includes(rawSubjectKey)) return rawSubjectKey;
  return null;
}
