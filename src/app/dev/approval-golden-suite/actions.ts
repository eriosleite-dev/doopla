'use server';

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { getOpenAIClient } from '@/lib/intelligence/openai-client';
import { resolveApproval, APPROVAL_GOLDEN_SUITE_CASES } from '@/lib/intelligence/approval';
import type { ApprovalGoldenSuiteCase } from '@/lib/intelligence/approval';

// Ferramenta de desenvolvimento/teste — não é parte do produto. Mesmo
// padrão de /dev/planner-golden-suite: valida o julgamento SEMÂNTICO
// real do Approval Resolver (Bloco 5) contra gpt-5-mini, algo que os
// testes de engenharia (client simulado, ver scratchpad) não cobrem.
//
// Cada caso é um ResolutionContextV1 sintético em memória
// (APPROVAL_GOLDEN_SUITE_CASES) — resolveApproval() nunca importa
// @supabase/*, nunca toca claim/lease/commit_approval_resolution.
// Isto testa só a camada semântica (model), nunca a orquestração
// física (já validada em Postgres real, ver relatório da
// implementação). Nenhuma aprovação real é gravada por esta rota.

export type ApprovalGoldenSuiteCaseResult = {
  name: string;
  category: string;
  professionalStatementText: string;
  outcome: string;
  operationTypes: string[];
  pass: boolean;
  note?: string;
  error?: string;
};

async function requireProfessional() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dev/approval-golden-suite');
  return { supabase, user };
}

function evaluateCase(goldenCase: ApprovalGoldenSuiteCase, outcome: Awaited<ReturnType<typeof resolveApproval>>['output']): boolean {
  if (outcome.outcome !== goldenCase.expectedOutcome) return false;
  if (outcome.outcome === 'resolved' && goldenCase.expectedOperationType) {
    return outcome.decisions.some((d) => d.operationType === goldenCase.expectedOperationType);
  }
  return true;
}

export async function runApprovalGoldenSuiteAction(): Promise<{ results?: ApprovalGoldenSuiteCaseResult[]; error?: string }> {
  await requireProfessional();

  try {
    getOpenAIClient();
  } catch {
    return { error: 'openai_not_configured' };
  }

  const results: ApprovalGoldenSuiteCaseResult[] = [];

  for (const goldenCase of APPROVAL_GOLDEN_SUITE_CASES) {
    try {
      const { output } = await resolveApproval(goldenCase.context);
      const pass = evaluateCase(goldenCase, output);
      results.push({
        name: goldenCase.name,
        category: goldenCase.category,
        professionalStatementText: goldenCase.professionalStatementText,
        outcome: output.outcome,
        operationTypes: output.outcome === 'resolved' ? output.decisions.map((d) => d.operationType) : [],
        pass,
        note: goldenCase.note,
      });
    } catch (err) {
      results.push({
        name: goldenCase.name,
        category: goldenCase.category,
        professionalStatementText: goldenCase.professionalStatementText,
        outcome: 'erro',
        operationTypes: [],
        pass: false,
        note: goldenCase.note,
        error: err instanceof Error ? err.message : 'erro desconhecido',
      });
    }
  }

  return { results };
}
