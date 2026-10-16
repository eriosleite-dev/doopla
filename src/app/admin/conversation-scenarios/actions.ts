'use server';

import { getAdminSession } from '../session';
import { claimAiHarnessRunLease } from '@/lib/admin/ai-harness-lease';
import { getOpenAIClient } from '@/lib/intelligence/openai-client';
import { CONVERSATION_SCENARIOS } from '@/lib/intelligence/conversation-scenarios/scenarios';
import { CONVERSATION_SCENARIOS_MAX_TOTAL_TURNS, runConversationScenarios } from '@/lib/intelligence/conversation-scenarios/runner';
import type { HarnessRunResult } from '@/lib/intelligence/conversation-scenarios/types';
import type { ActorContext, ToolContext } from '@/lib/intelligence/types';

// Doopla Intelligence Core v1 — AI Evaluation Harness, Server Action
// (ADR 0005, 16/10/2026).
//
// Autorização administrativa de verdade (requisito 4 da fundadora,
// nunca só sessão autenticada): getAdminSession() checa
// profiles.is_admin, redireciona quem não for admin — chamada aqui
// DENTRO da action (não só na page), porque uma Server Action pode em
// tese ser invocada fora do fluxo normal da página.
//
// Zero gravação em banco de dados de PRODUTO: toolCtx.supabase existe
// só pra satisfazer o tipo ToolContext (classifyIntent/planResponse
// nunca o chamam de fato, ver runner.ts). Nenhuma linha de
// conversations/conversation_messages/pending_delegated_contacts/
// outbound_intents é lida ou escrita por esta action. A ÚNICA escrita
// real desta action é no lease de cooldown abaixo (app_settings,
// migration 0118) — propositalmente separado de qualquer dado de
// profissional/cliente.
//
// Limite de frequência real no SERVIDOR (achado da revisão da
// fundadora, 16/10/2026): claim_ai_harness_run_lease é um UPDATE
// atômico — só UMA chamada, entre todas as concorrentes/repetidas
// dentro da janela de cooldown, consegue de fato "ganhar" e seguir
// adiante. Nunca depende da confirmação de 2 passos da UI (essa
// continua existindo só como UX, nunca como controle de verdade).
const AI_HARNESS_RUN_COOLDOWN_SECONDS = 120;

export async function runConversationScenariosAction(): Promise<{ result?: HarnessRunResult; error?: string }> {
  const { supabase } = await getAdminSession();

  try {
    getOpenAIClient();
  } catch {
    return { error: 'openai_not_configured' };
  }

  const totalTurns = CONVERSATION_SCENARIOS.reduce((sum, s) => sum + s.turns.length, 0);
  if (totalTurns > CONVERSATION_SCENARIOS_MAX_TOTAL_TURNS) {
    return { error: `turn_limit_exceeded:${totalTurns}/${CONVERSATION_SCENARIOS_MAX_TOTAL_TURNS}` };
  }

  let leaseGranted: boolean;
  try {
    leaseGranted = await claimAiHarnessRunLease(supabase, AI_HARNESS_RUN_COOLDOWN_SECONDS);
  } catch (err) {
    return { error: `lease_check_failed:${err instanceof Error ? err.message : 'erro desconhecido'}` };
  }
  if (!leaseGranted) {
    return { error: `rate_limited:aguarde ${AI_HARNESS_RUN_COOLDOWN_SECONDS}s entre execuções (proteção no servidor, não só na interface)` };
  }

  const actorContext: ActorContext = {
    representedProfessionalId: 'conversation-scenarios-synthetic-professional',
    actorType: 'professional',
    actorProfileId: 'conversation-scenarios-synthetic-professional',
    capabilities: ['read_professional_profile', 'read_opportunity', 'read_booking', 'read_external_participant'],
    triggerSource: 'dev_test_panel',
  };

  const toolCtx: ToolContext = {
    representedProfessionalId: actorContext.representedProfessionalId,
    actorContext,
    // Placeholder — sobrescrito por cenário/turno dentro do runner.
    // Precisa só satisfazer o tipo nesta chamada inicial.
    conversation: {
      id: 'conversation-scenarios-synthetic',
      represented_professional_id: actorContext.representedProfessionalId,
      mandate: 'active',
      status: 'open',
      current_state: 'ongoing',
      conversation_type: 'professional_self',
      external_participant_id: null,
      related_opportunity_id: null,
      related_booking_id: null,
    },
    supabase,
  };

  try {
    const result = await runConversationScenarios(CONVERSATION_SCENARIOS, { toolCtx });
    return { result };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'harness_execution_failed' };
  }
}

// Estimativa de custo SEM rodar nada contra o modelo — conta turnos e
// chamadas previstas (2 por turno + 1 extra pros turnos de delegação),
// nunca um número mágico. Usado pela UI pro passo de confirmação antes
// de gastar de verdade (requisito 4 — proteção contra execução
// descuidada).
export async function estimateConversationScenariosAction(): Promise<{ totalTurns: number; totalModelCalls: number; scenarioCount: number }> {
  await getAdminSession();
  const totalTurns = CONVERSATION_SCENARIOS.reduce((sum, s) => sum + s.turns.length, 0);
  const delegationTurns = CONVERSATION_SCENARIOS.reduce((sum, s) => sum + s.turns.filter((t) => t.delegation).length, 0);
  return { totalTurns, totalModelCalls: totalTurns * 2 + delegationTurns, scenarioCount: CONVERSATION_SCENARIOS.length };
}
