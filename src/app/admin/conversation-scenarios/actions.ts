'use server';

import { getAdminSession } from '../session';
import { claimAiHarnessRunLease, releaseAiHarnessRunLease } from '@/lib/admin/ai-harness-lease';
import { getOpenAIClient } from '@/lib/intelligence/openai-client';
import { CONVERSATION_SCENARIOS } from '@/lib/intelligence/conversation-scenarios/scenarios';
import { CONVERSATION_SCENARIOS_MAX_TOTAL_TURNS, buildHarnessRunMetadata, runConversationScenarioChunk, runConversationScenarios } from '@/lib/intelligence/conversation-scenarios/runner';
import type { HarnessRunMetadata, HarnessRunResult, TurnResult } from '@/lib/intelligence/conversation-scenarios/types';
import type { MessageContextItem } from '@/lib/intelligence/context-builder';
import type { ConversationStateSnapshot } from '@/lib/intelligence/conversation-state';
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
// real desta action é no lease abaixo (ai_harness_run_leases,
// migration 0118) — propositalmente separado de qualquer dado de
// profissional/cliente.
//
// Controle de concorrência real no SERVIDOR (achado da revisão da
// fundadora, 16/10/2026, segunda rodada): LOCK DE VERDADE (claim +
// release explícito, sempre em try/finally), nunca um cooldown por
// timestamp — um cooldown fixo desbloquearia uma segunda execução
// antes da primeira de fato terminar, sempre que ela demorasse mais
// que o cooldown (comportamento comprovado contra Postgres real nesta
// sessão, ver migration 0118). 600s é só o prazo de SEGURANÇA contra
// o processo crashar sem liberar — o caminho normal libera na hora,
// sucesso ou erro. Nunca depende da confirmação de 2 passos da UI
// (essa continua existindo só como UX, nunca como controle de
// verdade).
const AI_HARNESS_RUN_LEASE_SECONDS = 600;

// Execução em lotes (19/10/2026) — achado real em produção (Vercel
// Preview): rodar as CONVERSATION_SCENARIOS inteiras numa Server Action
// só estourou o limite de execução da plataforma ("Task timed out
// after 300" segundos, confirmado no log da Vercel), matando a
// chamada no meio e deixando a UI "pendurada" sem nunca receber
// resposta. A causa é estrutural (soma de várias chamadas sequenciais
// reais à OpenAI, não um bug pontual) e só cresce conforme o número de
// cenários aumenta (14 hoje, 144 no horizonte) — por isso a correção é
// dividir em lotes pequenos (o cliente orquestra várias chamadas
// curtas) em vez de perseguir um maxDuration maior, que estouraria de
// novo mais cedo ou mais tarde.
//
// Cada lote nunca quebra um cenário ao meio (runConversationScenario
// precisa do histórico crescente de TODOS os turnos de um mesmo
// cenário na mesma chamada) — o agrupamento em lotes é feito pelo
// cliente por cenário inteiro, nunca por turno avulso.
export async function listHarnessScenariosAction(): Promise<{
  scenarios: { id: string; name: string; category: string; source: string; turnCount: number }[];
}> {
  await getAdminSession();
  // name/category/source incluídos (21/10/2026) — o caminho de
  // cenário longo/retomável (runConversationScenarioChunkAction) monta
  // o ScenarioResult final no CLIENTE (buildScenarioResultFromTurns),
  // que precisa desses 3 campos sem uma segunda ida e volta.
  return { scenarios: CONVERSATION_SCENARIOS.map((s) => ({ id: s.id, name: s.name, category: s.category, source: s.source, turnCount: s.turns.length })) };
}

// Extraído (21/10/2026) — mesmo toolCtx sintético usado pelas duas
// Server Actions reais (lote entre cenários curtos, pedaço retomável
// de um cenário longo), nunca duplicado.
function buildHarnessToolCtx(supabase: ToolContext['supabase']): ToolContext {
  const actorContext: ActorContext = {
    representedProfessionalId: 'conversation-scenarios-synthetic-professional',
    actorType: 'professional',
    actorProfileId: 'conversation-scenarios-synthetic-professional',
    capabilities: ['read_professional_profile', 'read_opportunity', 'read_booking', 'read_external_participant'],
    triggerSource: 'dev_test_panel',
  };
  return {
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
}

export async function runConversationScenariosBatchAction(scenarioIds: string[]): Promise<{ result?: HarnessRunResult; error?: string }> {
  const { supabase } = await getAdminSession();

  try {
    getOpenAIClient();
  } catch {
    return { error: 'openai_not_configured' };
  }

  const batch = scenarioIds.map((id) => CONVERSATION_SCENARIOS.find((s) => s.id === id)).filter((s): s is (typeof CONVERSATION_SCENARIOS)[number] => s !== undefined);
  if (batch.length !== scenarioIds.length) {
    return { error: 'unknown_scenario_id' };
  }

  const totalTurns = batch.reduce((sum, s) => sum + s.turns.length, 0);
  if (totalTurns > CONVERSATION_SCENARIOS_MAX_TOTAL_TURNS) {
    return { error: `turn_limit_exceeded:${totalTurns}/${CONVERSATION_SCENARIOS_MAX_TOTAL_TURNS}` };
  }

  let leaseToken: string | null;
  try {
    const claim = await claimAiHarnessRunLease(supabase, AI_HARNESS_RUN_LEASE_SECONDS);
    leaseToken = claim.granted ? claim.leaseToken : null;
  } catch (err) {
    return { error: `lease_check_failed:${err instanceof Error ? err.message : 'erro desconhecido'}` };
  }
  if (!leaseToken) {
    return { error: 'rate_limited:já existe uma execução em andamento (lock real no servidor, não só na interface) — aguarde ela terminar' };
  }

  try {
    const result = await runConversationScenarios(batch, { toolCtx: buildHarnessToolCtx(supabase) });
    return { result };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'harness_execution_failed' };
  } finally {
    // Sempre libera, sucesso ou erro — nunca deixa o lock preso até o
    // prazo de segurança de 600s só porque este caminho terminou mal.
    // Falha ao liberar nunca derruba a resposta já calculada (o erro
    // de release, se houver, só atrasa a PRÓXIMA execução até o
    // lease_expires_at se autocurar — nunca perde o resultado desta).
    try {
      await releaseAiHarnessRunLease(supabase, leaseToken);
    } catch {
      // Engolido de propósito, mesmo padrão do resto do projeto.
    }
  }
}

// Task "Próxima fase: inteligência conversacional multiturno"
// (21/10/2026) — achado real: um cenário sozinho de 10-20 turnos
// ignora o lote de 6 turnos acima (chunkScenarioIds nunca quebra um
// cenário ao meio) e rodaria 30-45+ chamadas reais sequenciais numa
// Server Action só — o mesmo padrão de "Task timed out" já documentado
// neste arquivo. Esta action roda só uma FATIA de turnos de UM
// cenário; o cliente (Panel.tsx) chama repetidamente, passando de
// volta `items`/`nextTurnIndex` da chamada anterior, até
// `scenarioComplete`.
//
// Lease: reclamado/liberado POR CHAMADA (igual ao lote acima), nunca
// mantido preso durante as várias chamadas de um mesmo cenário longo —
// trade-off deliberado (simplicidade > exclusão mútua perfeita durante
// um run de vários minutos): o pior caso é duas execuções concorrentes
// entrelaçarem pedaços de cenários DIFERENTES, nunca uma corrompendo
// dados reais (esta ferramenta não grava nada de produto, só o lease
// em si). Aceitável pra uma ferramenta interna de uso tipicamente
// solo; documentado aqui pra nunca ser lido como garantia mais forte
// do que é.
export async function runConversationScenarioChunkAction(
  scenarioId: string,
  priorItems: MessageContextItem[] | null,
  fromTurnIndex: number,
  maxTurnsThisCall: number,
  priorConversationState: ConversationStateSnapshot | null = null
): Promise<{
  items?: MessageContextItem[];
  turnResults?: TurnResult[];
  nextTurnIndex?: number;
  scenarioComplete?: boolean;
  conversationState?: ConversationStateSnapshot;
  error?: string;
}> {
  const { supabase } = await getAdminSession();

  try {
    getOpenAIClient();
  } catch {
    return { error: 'openai_not_configured' };
  }

  const scenario = CONVERSATION_SCENARIOS.find((s) => s.id === scenarioId);
  if (!scenario) return { error: 'unknown_scenario_id' };

  let leaseToken: string | null;
  try {
    const claim = await claimAiHarnessRunLease(supabase, AI_HARNESS_RUN_LEASE_SECONDS);
    leaseToken = claim.granted ? claim.leaseToken : null;
  } catch (err) {
    return { error: `lease_check_failed:${err instanceof Error ? err.message : 'erro desconhecido'}` };
  }
  if (!leaseToken) {
    return { error: 'rate_limited:já existe uma execução em andamento (lock real no servidor, não só na interface) — aguarde ela terminar' };
  }

  try {
    const chunk = await runConversationScenarioChunk(scenario, { toolCtx: buildHarnessToolCtx(supabase) }, priorItems, fromTurnIndex, maxTurnsThisCall, priorConversationState);
    return chunk;
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'harness_execution_failed' };
  } finally {
    try {
      await releaseAiHarnessRunLease(supabase, leaseToken);
    } catch {
      // Engolido de propósito, mesmo padrão do resto do projeto.
    }
  }
}

// Leve, sem rodar nada contra o modelo — o caminho de cenário longo/
// retomável monta o HarnessRunResult final no cliente a partir de
// vários ScenarioResult (um por cenário), e metadata (commit/model/
// hash de prompt) nunca muda durante uma rodada — busca uma vez só.
export async function getHarnessRunMetadataAction(): Promise<{ metadata: HarnessRunMetadata }> {
  await getAdminSession();
  return { metadata: buildHarnessRunMetadata() };
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
