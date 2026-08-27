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
    }
  | { kind: 'failed'; error: string };
