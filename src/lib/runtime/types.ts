// Doopla Intelligence Core v1 — Orchestrator/Runtime: tipos centrais.
//
// Runtime é a camada que transforma um evento externo normalizado num
// ciclo completo do pipeline (Blocos 1–6): idempotência → identidade/
// mandato → intake → percepção → planejamento → aprovação → política
// pós-model → outbound_intent. Nunca envia de verdade (nenhum canal
// real — WhatsApp/Meta/Resend — existe ainda nesta rodada); o teto do
// pipeline automático é um outbound_intent em delivery_state=
// 'policy_allowed', nunca um envio de fato.
//
// Decisão explícita, derivada de um invariante já existente do Bloco 4
// (PlannerDecision.requiresProfessionalReviewBeforeSend, sempre
// `true`, tipo literal fora do schema que o model preenche): nenhum
// código deste bloco chama claim_outbound_intent_for_send/mark_sent_*
// — essas RPCs (migration 0051) ficam prontas só pra um worker de
// envio real futuro, gatilhado por uma ação explícita (painel do
// profissional ou uma política de auto-send que o usuário autorize
// depois). O Runtime cria o outbound_intent (a prova de que o Post-
// model Gate já validou o draft) e para exatamente aí — criar o
// outbound_intent NÃO é enviar, é só tornar o draft revisável/
// disparável por um passo humano ou futuro, nunca pular esse passo.

// Um evento inbound já normalizado por um adaptador de canal (fora de
// escopo nesta rodada — nenhum adaptador real de WhatsApp/email/painel
// existe ainda). O Runtime recebe SEMPRE professionalId e conversationId
// já resolvidos pelo chamador: mapear "número de telefone X" -> "qual
// profissional" é responsabilidade de um adaptador de canal futuro,
// nunca inventada aqui (reportado como fronteira explícita, não uma
// omissão silenciosa).
export type InboundEvent = {
  channel: 'whatsapp' | 'email' | 'painel' | 'public_link' | 'outro';
  providerEventId: string;
  providerMessageId: string | null;
  conversationId: string;
  authorType: 'external_participant' | 'professional';
  // Preenchido só quando authorType='professional'.
  authorProfileId: string | null;
  // Preenchido só quando authorType='external_participant' — identidade
  // de canal usada por resolve_or_create_external_participant (nunca
  // inferência: merge de identidade é sempre por linked_via explícito).
  externalParticipantIdentifier: { channel: string; identifier: string; name: string | null } | null;
  contentType: 'text';
  body: string;
  workerId: string;
};

export type RuntimeCycleOutcome =
  | { kind: 'duplicate_event'; alreadyProcessed: boolean }
  | { kind: 'conversation_busy' }
  | { kind: 'conversation_not_found' }
  | { kind: 'author_mismatch' }
  | {
      kind: 'completed';
      conversationMessageId: string;
      runId: string | null;
      opportunityId: string | null;
      opportunityCreated: boolean;
      approvalOutcome: string | null;
      policyGateOutcome: 'allowed' | 'blocked' | 'not_applicable';
      policyGateBlockReason: string | null;
      outboundIntentId: string | null;
      // true quando o texto do Planner existe mas o Runtime
      // deliberadamente não persistiu nada outbound (hoje só o caso
      // conversation_type='professional_self' — não existe ainda
      // nenhuma RPC pra gravar a resposta da Doopla direto em
      // conversation_messages fora do caminho de outbound_intents;
      // gap reportado, não resolvido silenciosamente nesta rodada).
      outboundSkippedReason: 'professional_self_not_implemented' | null;
    }
  | { kind: 'failed'; error: string };
