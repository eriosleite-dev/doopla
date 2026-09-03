import type { ResumptionOutcome } from './resumption';

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
// Decisão explícita (fechamento do Runtime, autorizado após auditoria):
// requiresProfessionalReviewBeforeSend deixou de ser um literal `true`
// incondicional — é derivado do responsePlan final (Bloco 4,
// resolveRequiresProfessionalReviewBeforeSend). Ainda assim, nenhum
// código deste bloco chama claim_outbound_intent_for_send/mark_sent_*
// — essas RPCs (migration 0051) ficam prontas só pra um worker de
// envio real futuro, gatilhado por uma ação explícita (painel do
// profissional ou uma política de auto-send que o usuário autorize
// depois; nenhum canal real existe ainda). O Runtime cria o
// outbound_intent (a prova de que o Post-model Gate já validou o
// draft) e para exatamente aí, sempre em delivery_state='policy_allowed'
// — criar o outbound_intent NÃO é enviar. disposition (abaixo) marca
// se esse draft já dispensaria revisão humana quando o send-worker
// existir, mas não muda nada sobre o que este bloco de fato faz agora.

// Três resultados compostos a partir de dois sinais já autoritativos —
// nunca uma segunda política: PostModelGateResult.outcome (Bloco 6,
// conteúdo) × requiresProfessionalReviewBeforeSend (Bloco 4, plano).
// 'not_applicable' quando não havia proposedResponse nenhum pra
// avaliar (nada a decidir sobre enviar).
export type RuntimeDisposition = 'auto_send_eligible' | 'professional_action_required' | 'blocked' | 'not_applicable';

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
  // Conversas Bloco 2 — preenchido só quando authorType='professional' e
  // esta mensagem responde a um draft específico já autorizado pelo
  // Post-model Gate (outbound_intents). persist_inbound_message
  // (migration 0066) valida que pertence à MESMA conversation e grava,
  // no mesmo INSERT, o fato observado (prepared_response_outcome:
  // 'sent'/'edited') — nunca recomputado depois, nunca um Intervention
  // Moment, nunca aprovação/satisfação/takeover.
  repliedToOutboundIntentId?: string | null;
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
      disposition: RuntimeDisposition;
      // Destinatário efetivo do proposedResponse deste ciclo (quando
      // houve um) — nunca só conversation_type: responsePlan=
      // 'consult_professional' vira 'professional' mesmo dentro de
      // uma conversa external_inquiry (prompt.ts já documenta que o
      // draft pode ser endereçado ao profissional nesse plano; bug
      // corrigido nesta rodada — antes o Runtime só olhava
      // conversation_type).
      recipientType: 'external_participant' | 'professional' | null;
      // Preenchido só quando recipientType='external_participant' e
      // outcome='allowed' — outbound_intents é exclusivamente pro
      // canal externo real (com provider), nunca pro profissional.
      outboundIntentId: string | null;
      // Preenchido só quando recipientType='professional' e
      // outcome='allowed' e havia texto — persist_ai_message
      // (migration 0052), nunca outbound_intents (profissional lê
      // dentro do próprio app, nunca via canal/provider).
      aiMessageId: string | null;
      // Preenchido só quando o Gate bloqueou por um motivo elegível
      // (no_matching_approval/stale_dependency/subject_key_unresolved)
      // E havia commercial root — a obrigação de retomada criada
      // nesta rodada (runtime_pending_replies, migration 0053).
      pendingReplyId: string | null;
      // Tentativas de retomada disparadas por UMA aprovação resolvida
      // nesta rodada (nunca pela própria mensagem deste ciclo) —
      // sempre vazio quando este ciclo não rodou o Approval Engine ou
      // a aprovação não resolveu nada novo. Cada item é uma pendência
      // de OUTRA conversation (a do cliente), reprocessada do zero.
      resumptions: ResumptionOutcome[];
    }
  // Passo 6A+6B Fase 2 — ramo determinístico do primeiro outreach frio
  // ("profissional manda contato -> Doopla inicia", sem CSW aberta).
  // Distinto de 'completed' de propósito: nenhuma chamada a
  // classifyIntent/planResponse/runApprovalEngine aconteceu neste
  // ciclo (cold-outreach.ts decide isso puro, sem model), então os
  // campos de classificação/plano de 'completed' não fazem sentido
  // aqui — nunca forçados como null dentro do mesmo shape, um outcome
  // próprio deixa a ausência explícita no tipo, não implícita.
  | {
      kind: 'cold_outreach_template';
      conversationMessageId: string;
      runId: string | null;
      outboundIntentId: string;
    }
  | { kind: 'failed'; error: string };
