import type { SupabaseClient } from '@supabase/supabase-js';
import type { z } from 'zod';

import type { Database } from '@/lib/supabase/types';

// Doopla Intelligence Core v1 — Bloco 1 (fundações técnicas).
//
// Tipos compartilhados por todos os módulos do Core. Nada aqui decide
// autorização sozinho — represented_professional_id/actor_type/
// capabilities só têm valor porque resolveActorContext() (actor-
// context.ts) os resolve internamente, nunca porque um chamador os
// declarou. Ver esse arquivo pra a implementação da regra.

// ============================================================
// ActorContext — separa quem é REPRESENTADO (represented_
// professional_id, imutável, sempre vem da conversa) de quem é o
// ATOR (quem/o que está operando agora). Em v1 só 'professional'
// tem caminho autorizado; 'authorized_collaborator' fica no tipo
// pronto pro Booker Pro futuro, mas nenhum código autoriza esse
// caminho ainda — nenhuma autorização depende de um valor vindo do
// model ou do chamador.
// ============================================================

export type ActorType = 'professional' | 'authorized_collaborator' | 'system';

// Origem do disparo desta execução do Core — auditoria/observabilidade,
// nunca usado pra decidir autorização (isso é papel do ActorTrigger).
export type TriggerSource = 'dev_test_panel' | 'dashboard' | 'system_job';

// Capacidades que um ActorContext carrega — hoje só leitura. Cada READ
// tool exige uma capability específica; o pre-model gate filtra a
// lista de tools elegíveis por isso.
export type Capability =
  | 'read_professional_profile'
  | 'read_opportunity'
  | 'read_booking'
  | 'read_external_participant';

export type ActorContext = {
  representedProfessionalId: string;
  actorType: ActorType;
  actorProfileId: string | null;
  capabilities: Capability[];
  triggerSource: TriggerSource;
};

// O que o Orchestrator recebe de fora — informação mínima de disparo,
// nunca um ActorContext pronto. resolveActorContext() é o único lugar
// que transforma isto em ActorContext.
export type ActorTrigger =
  | { kind: 'authenticated_user'; triggerSource: TriggerSource }
  | { kind: 'system'; triggerSource: TriggerSource };

export type ActorContextError =
  | 'not_authenticated'
  | 'conversation_not_found'
  | 'actor_not_authorized_for_conversation'
  | 'system_trigger_not_supported';

export type ActorContextResult =
  | { ok: true; actorContext: ActorContext; conversation: MinimalConversation }
  | { ok: false; error: ActorContextError };

// Colunas mínimas da conversa que o resto do Core precisa — nunca a
// linha inteira repassada adiante sem necessidade.
export type MinimalConversation = {
  id: string;
  represented_professional_id: string;
  mandate: string;
  status: string;
  current_state: string;
  conversation_type: string;
  external_participant_id: string | null;
  related_opportunity_id: string | null;
  related_booking_id: string | null;
};

// ============================================================
// Tool Registry
// ============================================================

// Risco final nunca pode ser mais baixo que o baseRiskLevel estático
// da tool (resolveRisk só pode escalar, nunca reduzir).
export type RiskLevel = 'low' | 'medium' | 'high';

// Fontes de contexto que o pre-model gate pode liberar — a lista
// elegível depende de a conversa ter (ou não) oportunidade/booking
// relacionados.
export type ContextSource =
  | 'professional_profile'
  | 'conversation_messages'
  | 'opportunity'
  | 'booking'
  | 'external_participant';

export type ToolContext = {
  representedProfessionalId: string;
  actorContext: ActorContext;
  conversation: MinimalConversation;
  // Injetado por quem monta o ToolContext (test-call.ts hoje, o
  // Orchestrator amanhã) — nunca criado dentro da própria tool. Um
  // único client por run, nunca um por tool, e o que torna as tools
  // testáveis com um client simulado sem depender de cookies/rede.
  supabase: SupabaseClient<Database>;
};

export type ToolExecutionOutcome<TOutput> =
  | { ok: true; output: TOutput }
  | { ok: false; error: 'invalid_input'; detail: string }
  | { ok: false; error: 'execution_failed'; detail: string };

export type ToolDefinition<TInput = unknown, TOutput = unknown> = {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  // Toda tool deste bloco é read-only (sideEffects: false, idempotent:
  // true) — nenhuma tool de escrita/ação existe ainda.
  sideEffects: boolean;
  idempotent: boolean;
  baseRiskLevel: RiskLevel;
  // Só pode escalar o risco acima de baseRiskLevel, nunca abaixo — o
  // model nunca é a autoridade final sobre risco, só um sinal
  // consultivo (não usado nem recebido por esta função).
  resolveRisk: (input: TInput, ctx: ToolContext) => RiskLevel;
  requiredCapability: Capability;
  retryPolicy: { maxAttempts: number };
  timeoutMs: number;
  auditFields: string[];
  execute: (input: TInput, ctx: ToolContext) => Promise<ToolExecutionOutcome<TOutput>>;
};

export type ToolExecutionError =
  | 'tool_not_registered'
  | 'tool_not_eligible'
  | 'invalid_input'
  | 'execution_failed'
  | 'context_inconsistent';

export type ToolExecutionResult<TOutput = unknown> =
  | { ok: true; output: TOutput; riskLevel: RiskLevel }
  | { ok: false; error: ToolExecutionError; detail?: string };

// ============================================================
// Policy Gate (pre-model)
// ============================================================

// Checks de ética de representação — já aprovados na arquitetura,
// hoje triviais (mono-profissional), mas mantidos como função real e
// nomeada (nunca "resolvido só porque a v1 não tem múltiplos
// representados ainda") pra quando o Discovery multi-profissional
// existir.
export type RepresentationEthicsFlag =
  | 'private_info_crossing_represented'
  | 'secretly_favoring_represented'
  | 'fabricated_competition'
  | 'unintroduced_price_comparison'
  | 'silent_discovery_from_specific_representation';

export type PolicyGateContext = {
  actorContext: ActorContext;
  conversation: MinimalConversation;
};

export type PolicyGateError =
  | 'conversation_not_found'
  | 'mandate_not_active'
  | 'actor_conversation_mismatch';

export type PolicyGateResult =
  | {
      ok: true;
      allowedContextSources: ContextSource[];
      eligibleTools: string[];
      ethicsFlags: RepresentationEthicsFlag[];
    }
  | { ok: false; error: PolicyGateError };

// ============================================================
// Observabilidade — um run_id por execução do Core.
// ============================================================

export type OrchestratorRunStatus = 'running' | 'completed' | 'failed';

export type OrchestratorRunStart = {
  conversationId: string;
  representedProfessionalId: string;
  actorType: ActorType;
  actorProfileId: string | null;
  externalParticipantId: string | null;
  triggerSource: TriggerSource;
  eligibleTools: string[];
};

export type OrchestratorRunFinish = {
  runId: string;
  status: OrchestratorRunStatus;
  calledTools: string[];
  error: string | null;
  fallbackUsed: boolean;
};
