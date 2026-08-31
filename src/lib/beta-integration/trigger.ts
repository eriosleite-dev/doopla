import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { processInboundEvent, type InboundEvent, type RuntimeCycleOutcome } from '@/lib/runtime';

// Doopla Beta Runtime Integration — passo 2 do roadmap (credenciais →
// entrypoint → smoke test → painel → reconciler/cron → outbound
// sender/adaptadores de canal). Vive FORA de src/lib/runtime/ e
// src/lib/intelligence/ de propósito: o Intelligence Runtime
// Architecture v1 está congelado (nenhuma alteração funcional sem um
// achado concreto novo) — este arquivo só CONSOME o entrypoint único
// já existente (processInboundEvent, runtime/index.ts), nunca
// modifica nada dentro do módulo congelado.
//
// Único ponto do projeto que constrói um InboundEvent fora de um
// adaptador de canal real (nenhum existe ainda — WhatsApp/Meta/Resend
// continuam fora de escopo). channel='painel' por padrão é honesto:
// a origem de fato é o painel/simulador, nunca finge ser um canal que
// não existe. Quando um adaptador de canal real existir, ele chama
// triggerInboundMessage() (ou processInboundEvent() direto, se
// preferir montar o InboundEvent com mais controle) com channel/
// providerEventId vindos do provider de verdade — nenhuma mudança de
// contrato necessária aqui.
//
// service_role aqui dentro, nunca num Client Component: este módulo só
// deve ser importado por Server Actions/Route Handlers (mesma regra
// já documentada em service-role.ts). SUPABASE_SERVICE_ROLE_KEY e
// OPENAI_API_KEY (lida por getOpenAIClient() dentro do Runtime) são
// pré-requisitos de EXECUÇÃO, não de import — este arquivo carrega sem
// elas; só lança se/quando algo aqui dentro tentar de fato falar com
// Postgres ou a OpenAI sem a credencial configurada.

export type TriggerInboundMessageParams = {
  conversationId: string;
  authorType: 'external_participant' | 'professional';
  // Obrigatório (efetivamente) quando authorType='professional' —
  // pipeline.ts já recusa fail-closed (author_mismatch) se não bater
  // com conversations.represented_professional_id; nunca duplicado
  // aqui.
  authorProfileId?: string | null;
  // Obrigatório (efetivamente) quando authorType='external_participant'
  // — pipeline.ts já recusa fail-closed (missing_external_participant_identifier)
  // sem isso.
  externalParticipantIdentifier?: { channel: string; identifier: string; name: string | null } | null;
  body: string;
  // 'painel' é o valor honesto pro simulador/painel de hoje — só um
  // adaptador de canal real futuro deveria passar outro valor aqui.
  channel?: InboundEvent['channel'];
  // Identidade de idempotência do EVENTO (não da mensagem) — default
  // gera uma nova a cada chamada, já que não existe "evento do
  // provider" nenhum pra um disparo manual/simulado. Um chamador que
  // precise de proteção contra duplo-clique pode gerar e passar seu
  // próprio token estável.
  providerEventId?: string;
  providerMessageId?: string | null;
  workerId?: string;
};

export async function triggerInboundMessage(params: TriggerInboundMessageParams): Promise<RuntimeCycleOutcome> {
  const supabase = createServiceRoleClient();

  const event: InboundEvent = {
    channel: params.channel ?? 'painel',
    providerEventId: params.providerEventId ?? crypto.randomUUID(),
    providerMessageId: params.providerMessageId ?? null,
    conversationId: params.conversationId,
    authorType: params.authorType,
    authorProfileId: params.authorType === 'professional' ? (params.authorProfileId ?? null) : null,
    externalParticipantIdentifier: params.authorType === 'external_participant' ? (params.externalParticipantIdentifier ?? null) : null,
    contentType: 'text',
    body: params.body,
    workerId: params.workerId ?? 'beta-integration:manual-trigger',
  };

  return processInboundEvent(supabase, event);
}
