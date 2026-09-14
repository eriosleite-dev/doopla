'use server';

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { getOpenAIClient } from '@/lib/intelligence/openai-client';
import { extractCommitments, POLICY_GATE_GOLDEN_SUITE_CASES } from '@/lib/intelligence/policy-gate-post';
import type { PolicyGateGoldenSuiteCase } from '@/lib/intelligence/policy-gate-post';

// Ferramenta de desenvolvimento/teste — não é parte do produto. Mesmo
// padrão de /dev/approval-golden-suite: valida o julgamento SEMÂNTICO
// real do extrator do Post-model Policy Gate contra gpt-5-mini, algo
// que os testes de engenharia (model call simulado, ver scratchpad)
// não cobrem.
//
// Cada caso é um proposedResponse sintético (POLICY_GATE_GOLDEN_SUITE_CASES)
// — extractCommitments() nunca importa @supabase/*, nunca toca
// get_active_approvals/record_policy_gate_decision. Testa só a camada
// semântica (o model), nunca o matching (100% código, já coberto nos
// testes determinísticos). Nenhuma decisão real é gravada por esta
// rota.

export type PolicyGateGoldenSuiteCaseResult = {
  name: string;
  proposedResponse: string;
  expectedCategories: string[];
  extractedCategories: string[];
  pass: boolean;
  note?: string;
  error?: string;
};

// Fixture EXCLUSIVA de teste (decisão do usuário) — nunca a verdade
// permanente do domínio. Não existe hoje nenhuma coluna de timezone no
// schema; esta rota dev usa um valor fixo só pra poder exercitar o
// mecanismo de closed-candidate-selection contra o model real. Uma
// integração de produção real precisa fornecer referenceTimestamp (de
// conversation_messages.created_at) e timezone (de uma fonte real,
// ainda a definir) explicitamente — nunca herdar este fixture.
const GOLDEN_SUITE_FIXTURE_TIMEZONE = 'America/Sao_Paulo';

async function requireProfessional() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dev/policy-gate-golden-suite');
  return { supabase, user };
}

// Comparação por CONJUNTO de categorias (nunca ordem, nunca subjectKey
// exato — o objetivo aqui é validar detecção semântica de compromisso,
// não o matching determinístico já coberto pelos testes de
// engenharia). subjectKey esperado, quando presente no caso, também é
// checado.
function evaluateCase(goldenCase: PolicyGateGoldenSuiteCase, extracted: { decisionCategory: string; rawSubjectKey: string | null }[]): boolean {
  const extractedSet = new Set(extracted.map((c) => c.decisionCategory));
  const expectedSet = new Set(goldenCase.expectedCommitments.map((c) => c.decisionCategory));
  if (extractedSet.size !== expectedSet.size) return false;
  for (const cat of expectedSet) {
    if (!extractedSet.has(cat)) return false;
  }
  for (const expected of goldenCase.expectedCommitments) {
    if (!expected.subjectKey) continue;
    const match = extracted.find((c) => c.decisionCategory === expected.decisionCategory && c.rawSubjectKey === expected.subjectKey);
    if (!match) return false;
  }
  return true;
}

export async function runPolicyGateGoldenSuiteAction(): Promise<{ results?: PolicyGateGoldenSuiteCaseResult[]; error?: string }> {
  await requireProfessional();

  try {
    getOpenAIClient();
  } catch {
    return { error: 'openai_not_configured' };
  }

  const results: PolicyGateGoldenSuiteCaseResult[] = [];

  for (const goldenCase of POLICY_GATE_GOLDEN_SUITE_CASES) {
    try {
      const { commitments } = await extractCommitments(goldenCase.proposedResponse, {
        referenceTimestamp: new Date().toISOString(),
        timezone: GOLDEN_SUITE_FIXTURE_TIMEZONE,
        knownEventDate: null,
      });
      const pass = evaluateCase(goldenCase, commitments);
      results.push({
        name: goldenCase.name,
        proposedResponse: goldenCase.proposedResponse,
        expectedCategories: goldenCase.expectedCommitments.map((c) => c.decisionCategory),
        extractedCategories: commitments.map((c) => c.decisionCategory),
        pass,
        note: goldenCase.note,
      });
    } catch (err) {
      results.push({
        name: goldenCase.name,
        proposedResponse: goldenCase.proposedResponse,
        expectedCategories: goldenCase.expectedCommitments.map((c) => c.decisionCategory),
        extractedCategories: [],
        pass: false,
        note: goldenCase.note,
        error: err instanceof Error ? err.message : 'erro desconhecido',
      });
    }
  }

  return { results };
}
