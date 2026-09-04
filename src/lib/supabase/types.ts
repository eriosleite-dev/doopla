// Tipos manuais para as tabelas criadas em supabase/migrations/*.sql.
// Quando o projeto Supabase estiver criado, troque por tipos gerados:
//   npx supabase gen types typescript --project-id <id> > src/lib/supabase/types.ts

export type UserRole = 'artista' | 'booker' | 'agencia';

export type Profile = {
  id: string;
  role: UserRole;
  full_name: string;
  display_name: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  avatar_url: string | null;
  slug: string | null;
  is_admin: boolean;
  referral_code: string;
  created_at: string;
  updated_at: string;
};

export type ArtistProfile = {
  profile_id: string;
  stage_name: string | null;
  bio: string | null;
  category: string | null;
  genres: string[];
  base_fee_cents: number | null;
  public_enabled: boolean;
  instagram_url: string | null;
  portfolio_url: string | null;
  // campos de onboarding (migrados do fluxo original do site)
  intencao: string | null;
  pontual_detalhe: string | null;
  funcao: string | null;
  local: string | null;
  mercados: string | null;
  tem_booker: string | null;
  // Perfil completo (Bloco C, migration 0023)
  subcategory: string | null;
  website_url: string | null;
  other_links: string | null;
  travels: boolean;
  serves_other_locations: boolean;
  accepts_out_of_city_work: boolean;
  other_preferences: string | null;
  // Cadastro/matching estruturado (migration 0026)
  work_types: string[];
  client_types: string[];
  regions: string[];
  languages: string[];
  career_stage: string | null;
  help_areas: string[];
  fee_range: string | null;
  // Onboarding reconstruído (migration 0037) — etapas Cachê / Como você
  // trabalha / Canal de atenção. negotiation_notes é regra de
  // representação/negociação, semanticamente diferente de bio (que é
  // intenção/preferência comercial) — nunca concatenar os dois.
  fee_varies_by_job_type: boolean | null;
  issues_invoice: boolean | null;
  typical_job_duration: string | null;
  negotiation_notes: string | null;
  attention_channel: 'whatsapp' | 'painel' | 'ambos' | null;
  // Onboarding reescrito (migration 0038) — "como você costuma definir
  // seus valores?", só quando a etapa Valores escolhe "Depende do
  // trabalho" em vez de um valor fixo. Diferente de bio e de
  // negotiation_notes — nunca concatenar.
  pricing_notes: string | null;
  created_at: string;
  updated_at: string;
};

// Profissão → tipos de trabalho, como dado no banco (migration 0037) —
// não lista fixa no componente de onboarding. Adicionar profissão nova
// é inserir linhas nessas tabelas, nunca mexer no React.
export type Profession = {
  id: string;
  label: string;
  sort_order: number;
};

export type ProfessionJobType = {
  id: string;
  profession_id: string;
  label: string;
  sort_order: number;
};

export type BookerProfile = {
  profile_id: string;
  company_name: string | null;
  venue_name: string | null;
  position: string | null;
  // campos de onboarding
  modo_trabalho: string | null;
  perfil: string | null;
  foco: string | null;
  mercados: string | null;
  quem: string | null;
  cidades: string | null;
  ja_representa: string | null;
  roster: string | null;
  opportunities_seen_at: string;
  representation_request_limit: number;
  // Perfil completo (Bloco C, migration 0023)
  professional_name: string | null;
  bio: string | null;
  experience: string | null;
  instagram_url: string | null;
  // Cadastro/matching estruturado (migration 0026) — specialty_areas
  // substitui `specialties` (texto livre) como fonte usada pelo cadastro
  // e pelo Perfil; a coluna antiga `specialties` continua no banco por
  // compatibilidade, mas não é mais lida nem escrita pelo app.
  artist_categories: string[];
  client_types: string[];
  regions: string[];
  languages: string[];
  specialty_areas: string[];
  capacity: string | null;
  fee_range: string[];
  website_url: string | null;
  // Migration 0028 — indicativa, informada pelo booker, nunca trava a
  // comissão de nenhum booking específico.
  commission_range: string | null;
  created_at: string;
  updated_at: string;
};

export type AgencyProfile = {
  profile_id: string;
  agency_name: string;
  cnpj: string | null;
  website: string | null;
  // campos de onboarding
  roster: string | null;
  agentes: string | null;
  mercado: string | null;
  created_at: string;
  updated_at: string;
};

export type BookingStatus =
  | 'proposta_enviada'
  | 'aceita'
  | 'recusada'
  | 'aguardando_pagamento'
  | 'concluida'
  | 'cancelada';

export type PaymentMode = 'integral_apos_trabalho' | 'sinal_saldo';
export type CancellationInitiator = 'cliente' | 'artista';
export type DisputeStatus = 'nenhuma' | 'em_disputa' | 'chargeback';
export type RequiresInvoice = 'sim' | 'nao' | 'nao_sei';

export type Booking = {
  id: string;
  artist_profile_id: string;
  booker_profile_id: string;
  status: BookingStatus;
  proposed_by: UserRole;
  commission_percent: number;
  cache_amount_cents: number | null;
  description: string | null;
  event_date: string | null;
  validated_at: string | null;
  contract_url: string | null;
  client_name: string | null;
  client_document: string | null;
  event_location: string | null;
  created_at: string;
  updated_at: string;
  // Cancelamento/reembolso estrutural (Bloco C prioridade 2, migration 0024)
  payment_mode: PaymentMode;
  deposit_percentage: number | null;
  deposit_due_at: string | null;
  remaining_percentage: number | null;
  remaining_due_rule: string | null;
  client_cancellation_deposit_refundable: boolean;
  artist_cancellation_deposit_refundable: boolean;
  cancellation_policy_version: string;
  cancellation_terms_accepted_at: string | null;
  cancellation_terms_accepted_by: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_initiator: CancellationInitiator | null;
  cancellation_reason: string | null;
  original_event_date: string | null;
  rescheduled_event_date: string | null;
  rescheduled_at: string | null;
  reschedule_accepted_by: string | null;
  reschedule_proposed_date: string | null;
  reschedule_proposed_by: string | null;
  payment_due_at: string | null;
  payment_collection_started_at: string | null;
  dispute_status: DisputeStatus;
  dispute_opened_at: string | null;
  // Trabalhos com Nota Fiscal / pagamento direto artista↔cliente (LOTE 2
  // Parte 2, migration 0035) — Doopla acompanha, não processa.
  requires_invoice: RequiresInvoice;
  invoice_payment_term: string | null;
  invoice_terms_accepted_at: string | null;
  invoice_terms_accepted_by: string | null;
  invoice_issued_at: string | null;
  invoice_sent_to_client_at: string | null;
  invoice_client_paid_at: string | null;
  invoice_commission_paid_at: string | null;
};

export type BookingEvent = {
  id: string;
  booking_id: string;
  actor_profile_id: string;
  event_type: string;
  commission_percent: number | null;
  note: string | null;
  created_at: string;
};

export type InviteStatus = 'pendente' | 'confirmado';

export type Invite = {
  id: string;
  inviter_profile_id: string;
  invitee_name: string;
  invitee_contact: string | null;
  invitee_profile_id: string | null;
  status: InviteStatus;
  token: string;
  created_at: string;
  confirmed_at: string | null;
};

// Retorno de get_invite_by_token — lookup público e mínimo pra
// /convite/[token], nunca o convite inteiro.
export type InviteByToken = {
  inviter_name: string;
  inviter_role: UserRole;
  invitee_name: string;
};

export type Favorite = {
  user_id: string;
  favorited_user_id: string;
  created_at: string;
};

export type Representation = {
  id: string;
  artist_profile_id: string;
  booker_profile_id: string;
  created_via_invite_id: string | null;
  created_via_representation_request_id: string | null;
  created_at: string;
};

// Bloco 4.5 — jornada de publicação da oportunidade (nunca o andamento do
// trabalho, isso é BookingStatus). 'rascunho' reservado, nada usa ainda.
export type OpportunityStatus =
  | 'rascunho'
  | 'aberta'
  | 'em_distribuicao'
  | 'interesse_recebido'
  | 'booker_selecionado'
  | 'cancelada';

export type OpportunityDistributionMode = 'meus_bookers' | 'novos_bookers' | 'ambos';

export type OpportunitySource = 'mural' | 'artist_link';
export type OpportunityAssignedTo = 'artist' | 'booker' | 'shared';

export type Opportunity = {
  id: string;
  artist_profile_id: string;
  description: string;
  cache_amount_cents: number | null;
  commission_percent: number | null;
  status: OpportunityStatus;
  distribution_mode: OpportunityDistributionMode;
  work_type: string | null;
  category: string | null;
  location: string | null;
  event_date: string | null;
  cache_min_cents: number | null;
  cache_max_cents: number | null;
  selected_booker_id: string | null;
  selected_at: string | null;
  ai_tags_status: 'pendente' | 'concluido' | 'falhou';
  ai_tags_content_hash: string | null;
  ai_tags_processed_at: string | null;
  // Bloco C — /orçamento (migration 0023)
  source: OpportunitySource;
  assigned_to: OpportunityAssignedTo | null;
  client_name: string | null;
  client_contact: string | null;
  client_offered_cents: number | null;
  created_at: string;
  updated_at: string;
  // LOTE 2 Parte 2 (migration 0035) — carregado pro booking quando o
  // artista escolhe um booker (ver selectBookerForOpportunityAction).
  requires_invoice: RequiresInvoice;
};

export type OpportunityDismissal = {
  opportunity_id: string;
  booker_profile_id: string;
  created_at: string;
};

// Bloco 4.5 — booker pede pra representar um artista novo (distinto de
// Invite, que é pra relação que já existe fora da doopla).
export type RepresentationRequestStatus = 'pendente' | 'aceita' | 'recusada' | 'expirada';

export type RepresentationRequest = {
  id: string;
  booker_profile_id: string;
  artist_profile_id: string;
  requested_by_profile_id: string;
  message: string | null;
  status: RepresentationRequestStatus;
  expires_at: string;
  responded_at: string | null;
  booker_seen_at: string | null;
  created_at: string;
};

// Retorno de find_representation_target_by_contact — usado pra decidir
// entre "enviar solicitação" (conta existe) e "enviar convite" (não existe)
// no fluxo unificado "Adicionar um Booker/Artista".
export type ContactMatch = {
  profile_id: string;
  role: UserRole;
  full_name: string;
  display_name: string | null;
  avatar_url: string | null;
};

export type OpportunityInvitationStatus = 'pendente' | 'aceita' | 'recusada' | 'encerrada';

export type OpportunityInvitation = {
  id: string;
  opportunity_id: string;
  booker_profile_id: string;
  status: OpportunityInvitationStatus;
  created_at: string;
  responded_at: string | null;
};

export type OpportunityInterestStatus = 'pendente' | 'selecionado' | 'encerrado';

export type OpportunityInterest = {
  id: string;
  opportunity_id: string;
  booker_profile_id: string;
  status: OpportunityInterestStatus;
  created_at: string;
};

export type OpportunityEvent = {
  id: string;
  opportunity_id: string;
  booker_profile_id: string | null;
  event_type: string;
  source: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type OpportunityTagSource = 'explicit' | 'ai';

export type OpportunityTag = {
  id: string;
  opportunity_id: string;
  tag: string;
  source: OpportunityTagSource;
  created_at: string;
};

// success | error — se a chamada ao provider terminou com resposta ou
// com falha (migration 0041).
export type AiUsageEventStatus = 'success' | 'error';

export type AiUsageEvent = {
  id: string;
  profile_id: string | null;
  opportunity_id: string | null;
  // Doopla Intelligence OS v1 (migration 0039) — liga o evento à
  // conversa que o originou, quando aplicável. Nullable: nem todo uso
  // de IA nasce de uma conversa.
  conversation_id: string | null;
  feature: string;
  // migration 0041 — nome do modelo usado, sempre vindo de
  // src/lib/intelligence/config.ts, nunca hardcoded no chamador.
  model: string | null;
  status: AiUsageEventStatus | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_cents_estimate: number | null;
  // migration 0042 — liga o evento ao orchestrator_run que o originou,
  // quando aplicável. Nullable: nem todo evento de uso nasce de um run
  // do Core.
  run_id: string | null;
  created_at: string;
};

// ============================================================
// Doopla Intelligence OS v1 — camada de conversação (migration 0039).
// Nenhuma integração de IA ainda; só a fundação de dados sobre a qual
// o Context Builder/Orchestrator vão rodar depois, como funcionalidade
// própria. represented_professional_id é IMUTÁVEL — mudança legítima
// de representado sempre nasce como conversa nova
// (transferred_from_conversation_id), nunca um UPDATE na existente.
// ============================================================

export type ConversationChannel = 'public_link' | 'whatsapp' | 'email' | 'painel' | 'outro';
export type ConversationType = 'external_inquiry' | 'professional_self';
export type ConversationStatus = 'open' | 'closed' | 'archived';
// Quem/o que disparou uma mudança de mandato ou de estado.
export type ConversationEventActor = 'system' | 'professional' | 'admin' | 'ai';

export type Conversation = {
  id: string;
  // IMUTÁVEL — definido uma única vez em create_conversation(), sem
  // GRANT UPDATE pra nenhuma role. Mudar de representado é sempre uma
  // conversa nova.
  represented_professional_id: string;
  external_participant_id: string | null;
  origin: ConversationChannel;
  origin_reference: string | null;
  channel: ConversationChannel;
  conversation_type: ConversationType;
  // Escopo/status do mandato DENTRO da representação fixa acima —
  // pode evoluir (ex.: 'active' -> 'suspended'), nunca troca quem é
  // representado. Histórico completo em ConversationMandateEvent.
  mandate: string;
  mandate_created_at: string;
  mandate_changed_at: string | null;
  mandate_change_reason: string | null;
  current_intent: string | null;
  related_opportunity_id: string | null;
  related_booking_id: string | null;
  // Placeholder pra state machine futura — histórico completo em
  // ConversationStateEvent.
  current_state: string;
  previous_state: string | null;
  status: ConversationStatus;
  state_updated_at: string;
  expected_next_step: string | null;
  last_activity_at: string;
  // Só linhagem/auditoria — nenhuma RLS policy usa este vínculo pra
  // conceder acesso à conversa anterior.
  transferred_from_conversation_id: string | null;
  created_at: string;
  updated_at: string;
};

// Contato externo (cliente) de UM profissional específico — nunca
// identidade global entre profissionais.
export type ExternalParticipant = {
  id: string;
  professional_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
};

// Como uma identidade de canal foi associada a um external_participant
// — nunca 'inferido pela IA'. A primeira identidade de um participante
// novo nasce 'first_contact'; uma segunda identidade só entra por
// mecanismo determinístico.
export type ExternalParticipantLinkedVia =
  | 'first_contact'
  | 'professional_confirmed'
  | 'authenticated_session';

export type ExternalParticipantChannelIdentity = {
  id: string;
  external_participant_id: string;
  professional_id: string;
  channel: ConversationChannel;
  identifier: string;
  linked_via: ExternalParticipantLinkedVia;
  created_at: string;
};

export type ConversationMessageDirection = 'inbound' | 'outbound';
// Quem de fato autorou o conteúdo — nunca um "role" de LLM.
// direction/author_type/channel são eixos independentes.
export type ConversationMessageAuthorType = 'external_participant' | 'professional' | 'ai' | 'system';
export type ConversationMessageContentType = 'text' | 'audio' | 'attachment';
export type ConversationMessageTranscriptionStatus = 'pending' | 'done' | 'failed';
export type ConversationMessageGeneratedBy = 'human' | 'ai';

export type ConversationMessage = {
  id: string;
  conversation_id: string;
  direction: ConversationMessageDirection;
  author_type: ConversationMessageAuthorType;
  author_profile_id: string | null;
  author_external_participant_id: string | null;
  channel: ConversationChannel;
  content_type: ConversationMessageContentType;
  // Conteúdo textual ORIGINAL — nunca a transcrição de um áudio (ver
  // transcript).
  body: string | null;
  audio_url: string | null;
  // Conteúdo DERIVADO de audio_url por transcrição — nunca confundir
  // com body.
  transcript: string | null;
  transcription_status: ConversationMessageTranscriptionStatus | null;
  attachment_url: string | null;
  attachment_metadata: Record<string, unknown> | null;
  generated_by: ConversationMessageGeneratedBy;
  created_at: string;
  // Conversas Bloco 2 (migration 0066) — proveniência factual draft x
  // resposta enviada, nunca interpretação. Ver comentário em
  // src/lib/runtime/types.ts (InboundEvent.repliedToOutboundIntentId).
  replied_to_outbound_intent_id: string | null;
  prepared_response_outcome: 'sent' | 'edited' | null;
};

// Append-only. previous_mandate null = linha de nascimento da
// conversa (create_conversation grava o primeiro evento, não só
// mudanças posteriores).
export type ConversationMandateEvent = {
  id: string;
  conversation_id: string;
  previous_mandate: string | null;
  new_mandate: string;
  reason: string | null;
  changed_by: ConversationEventActor;
  changed_by_profile_id: string | null;
  created_at: string;
};

// Append-only. previous_state null = linha de nascimento da conversa.
export type ConversationStateEvent = {
  id: string;
  conversation_id: string;
  previous_state: string | null;
  new_state: string;
  reason: string | null;
  changed_by: ConversationEventActor;
  changed_by_profile_id: string | null;
  created_at: string;
};

// Doopla Intelligence Core v1 — um registro por execução do Core
// (migration 0042). Só metadados de execução — nunca chain of
// thought, nunca conteúdo de conversation_messages duplicado aqui.
export type OrchestratorRunActorType = 'professional' | 'authorized_collaborator' | 'system';
export type OrchestratorRunStatus = 'running' | 'completed' | 'failed';

// Doopla Intelligence Core v1 — Bloco 3 (migration 0043). Vocabulário
// estável, com check constraint no banco.
export type OrchestratorRunModelConfidence = 'high' | 'medium' | 'low';
export type OrchestratorRunEffectiveConfidence = 'high' | 'medium' | 'low';
export type OrchestratorRunContextCompleteness = 'complete' | 'partial_missing' | 'partial_unavailable';
export type OrchestratorRunClassificationStatus = 'classified' | 'ambiguous' | 'invalid';

export type OrchestratorRun = {
  id: string;
  conversation_id: string;
  represented_professional_id: string;
  actor_type: OrchestratorRunActorType;
  actor_profile_id: string | null;
  external_participant_id: string | null;
  trigger_source: string;
  status: OrchestratorRunStatus;
  eligible_tools: string[];
  called_tools: string[];
  error: string | null;
  fallback_used: boolean;
  started_at: string;
  finished_at: string | null;
  latency_ms: number | null;
  // Bloco 3 (migration 0043) — metadados de classificação
  // (Intent Classifier + Competence Router). primary_intent/
  // secondary_intents são texto livre de propósito (taxonomia
  // extensível, validada em código — ver
  // src/lib/intelligence/classification/intents.ts), nunca travados
  // no banco.
  primary_intent: string | null;
  secondary_intents: string[];
  competencies: string[];
  model_confidence: OrchestratorRunModelConfidence | null;
  effective_confidence: OrchestratorRunEffectiveConfidence | null;
  context_completeness: OrchestratorRunContextCompleteness | null;
  classification_status: OrchestratorRunClassificationStatus | null;
};

export type ArtistAvailability = {
  id: string;
  artist_profile_id: string;
  available_date: string;
  created_at: string;
};

export type AgendaEntryType = 'disponivel' | 'indisponivel' | 'viagem' | 'outro';

export type AgendaEntry = {
  id: string;
  artist_profile_id: string;
  created_by_profile_id: string;
  entry_type: AgendaEntryType;
  start_date: string;
  end_date: string;
  note: string | null;
  created_at: string;
};

export type SubscriptionStatus = 'trialing' | 'active' | 'canceled';
export type SubscriptionPriceRule = 'standard_launch' | 'founder_locked';
export type BookerPlan = 'basic' | 'pro';
// Plano do artista (Doopla / Doopla Pro) — coluna separada de
// booker_plan, que é exclusivo do booker (migration 0036).
export type ArtistPlan = 'doopla' | 'pro';

export type Subscription = {
  id: string;
  profile_id: string;
  role: UserRole;
  status: SubscriptionStatus;
  price_rule: SubscriptionPriceRule | null;
  locked_price_cents: number | null;
  founder_voucher_id: string | null;
  trial_ends_at: string | null;
  booker_plan: BookerPlan;
  artist_plan: ArtistPlan | null;
  active_artist_profile_id: string | null;
  active_artist_pending_choice: boolean;
  pro_period_ends_at: string | null;
  started_at: string;
  canceled_at: string | null;
  updated_at: string;
};

export type FounderVoucher = {
  id: string;
  code: string;
  locked_price_cents: number;
  note: string | null;
  redeemed_by_profile_id: string | null;
  redeemed_at: string | null;
  created_at: string;
};

// Dados de recebimento (adendo WhatsApp/concierge, migration 0046).
// Append-only versionado — status='active' é sempre a única linha
// vigente por profile_id, o resto é histórico/auditoria.
export type PaymentMethod = 'pix';
export type PixKeyType = 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria';
export type PaymentDetailsStatus = 'active' | 'superseded';

export type PaymentDetails = {
  id: string;
  profile_id: string;
  method: PaymentMethod;
  pix_key_type: PixKeyType | null;
  pix_key: string | null;
  holder_name: string | null;
  status: PaymentDetailsStatus;
  created_at: string;
  created_by: string;
  superseded_at: string | null;
};

export type PayoutRequestStatus = 'solicitado';

export type PayoutRequest = {
  id: string;
  profile_id: string;
  amount_cents: number;
  status: PayoutRequestStatus;
  created_at: string;
};

export type LinkRoutingMode = 'eu' | 'meu_booker' | 'eu_e_meu_booker';

export type ArtistLinkRouting = {
  id: string;
  artist_id: string;
  mode: LinkRoutingMode;
  booker_id: string | null;
  updated_at: string;
};

// "Indique. Ganhe R$5." — status fica em 'pendente' até existir sistema de
// assinatura real pra checar 45-60 dias de assinatura ativa do indicado.
// Nenhum caminho automático pra 'qualificada' existe ainda (ver migration
// 0020). 'invalida' reservado pra moderação futura (fraude/abuso).
export type ReferralStatus = 'pendente' | 'qualificada' | 'invalida';

export type Referral = {
  id: string;
  referrer_profile_id: string;
  referred_profile_id: string;
  code: string;
  status: ReferralStatus;
  bonus_cents: number;
  qualified_at: string | null;
  created_at: string;
};

// Gerador de contrato — snapshot imutável. `content` é o texto final das
// cláusulas liberadas (escopo/partes/evento) no momento da geração;
// `pendente` lista os módulos ainda não cobertos (pagamento, cancelamento),
// travados até a validação Pagar.me/jurídica.
export type ContractContent = {
  escopo: string;
  partes: string;
  evento: string;
  pendente: string[];
};

export type BookingContract = {
  id: string;
  booking_id: string;
  template_version: string;
  generated_by_profile_id: string;
  content: ContractContent;
  created_at: string;
};

export type ReviewStatus = 'pendente' | 'ativa' | 'removida' | 'invalidada';

export type Review = {
  id: string;
  booking_id: string;
  reviewer_profile_id: string;
  reviewee_profile_id: string;
  rating: number | null;
  attributes: string[];
  comment: string | null;
  status: ReviewStatus;
  contested: boolean;
  requested_at: string | null;
  submitted_at: string | null;
  edited_at: string | null;
  created_at: string;
};

// ============================================================
// Professional Product UI — Foundation. Tipos que faltavam pra estas
// tabelas/RPCs (migrations 0045/0047/0049-0051/0053/0059/0064/0065),
// já em uso real via casts manuais em vários pontos do código
// (ex.: src/app/dashboard/runtime-state-reads.ts). Nullability/enums
// copiados exatamente das CREATE TABLE/CHECK das migrations — nenhum
// campo inventado.
// ============================================================

// --- outbound_intents (migration 0051) ---------------------------
export type OutboundIntentDeliveryState =
  | 'policy_allowed'
  | 'queued'
  | 'sending'
  | 'sent_unknown'
  | 'sent_confirmed'
  | 'delivered'
  | 'read'
  | 'failed_transient'
  | 'failed_permanent'
  | 'cancelled';

export type OutboundIntent = {
  id: string;
  conversation_id: string;
  professional_id: string;
  trigger_message_id: string | null;
  run_id: string | null;
  policy_decision_id: string | null;
  channel: ConversationChannel;
  recipient_external_participant_id: string | null;
  // Rascunho ainda não entregue — nunca exposto por
  // get_conversation_operational_facts (0060), só por leitura direta
  // sob "outbound_intents: select own".
  content: string;
  delivery_state: OutboundIntentDeliveryState;
  send_attempt_id: string | null;
  send_lease_expires_at: string | null;
  provider_message_id: string | null;
  failure_reason: string | null;
  conversation_message_id: string | null;
  created_at: string;
  queued_at: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  failed_at: string | null;
  updated_at: string;
};

// --- runtime_pending_replies (migration 0053) ---------------------
// Sem policy pra authenticated nesta tabela (0053) até a leitura ser
// autorizada explicitamente em 0056 — "select own" via
// conversations.represented_professional_id, nunca coluna própria.
export type RuntimePendingReplyStatus = 'pending' | 'completed' | 'superseded';

export type RuntimePendingReply = {
  id: string;
  conversation_id: string;
  commercial_root_id: string;
  trigger_message_id: string;
  policy_gate_decision_id: string;
  run_id: string | null;
  status: RuntimePendingReplyStatus;
  superseded_by_id: string | null;
  created_at: string;
  resolved_at: string | null;
};

// --- approval_records (migration 0045) ----------------------------
export type ApprovalOperationType =
  | 'contextual_decision'
  | 'explicit_decision'
  | 'counterproposal'
  | 'revocation'
  | 'professional_initiated';

export type ApprovalRecord = {
  id: string;
  professional_id: string;
  // Sempre resolve_commercial_root_id() — id de booking OU de
  // opportunity, sem FK direta a uma tabela só.
  commercial_root_id: string;
  decision_category: string;
  subject_key: string;
  version: number;
  operation_type: ApprovalOperationType;
  // null se e somente se operation_type='revocation'.
  approved_value: Record<string, unknown> | null;
  professional_statement_message_id: string;
  communicated_proposal_message_ids: string[];
  referred_value: Record<string, unknown> | null;
  created_at: string;
};

// --- policy_gate_decisions (migration 0049, enum estendido em 0051) ---
export type PolicyGateOutcome = 'allowed' | 'blocked';
export type PolicyGateBlockReason =
  | 'no_matching_approval'
  | 'value_mismatch'
  | 'subject_key_unresolved'
  | 'commercial_root_terminal'
  | 'invalid_extracted_value'
  | 'extraction_unavailable'
  | 'stale_dependency'
  | 'professional_not_operationally_ready';

export type PolicyGateDecision = {
  id: string;
  professional_id: string;
  conversation_id: string;
  commercial_root_id: string;
  message_id: string | null;
  run_id: string | null;
  outcome: PolicyGateOutcome;
  policy_version: string;
  // Preenchido só quando outcome='blocked' (CHECK simétrico no banco).
  primary_block_reason: PolicyGateBlockReason | null;
  checks: unknown[];
  created_at: string;
};

// --- product_events (migration 0065) ------------------------------
export type ProductEventCategory = 'product' | 'value' | 'lifecycle';
export type ProductEventActorType = 'professional' | 'external_participant' | 'ai' | 'system';
// Reservado pro futuro Lifecycle Messaging — nenhum event_type atual usa.
export type ProductEventSignalType = 'decision' | 'risk' | 'resolved' | 'opportunity';
export type ProductEventSource = 'runtime' | 'dashboard' | 'webhook' | 'cron';

export type ProductEvent = {
  id: string;
  professional_id: string;
  category: ProductEventCategory;
  // Livre no banco, validado pelo registry em código
  // (src/lib/beta-instrumentation/event-types.ts) — nunca um union
  // fechado aqui, isso duplicaria a fonte de verdade.
  event_type: string;
  occurred_at: string;
  recorded_at: string;
  idempotency_key: string;
  subject_type: string;
  subject_id: string;
  commercial_root_id: string | null;
  conversation_id: string | null;
  run_id: string | null;
  source_message_id: string | null;
  actor_type: ProductEventActorType | null;
  payload: Record<string, unknown>;
  // Reservados pro futuro Lifecycle Messaging — sempre null hoje.
  why_now: string | null;
  signal_type: ProductEventSignalType | null;
  source: ProductEventSource;
  created_at: string;
};

// --- professional_whatsapp_identities (migration 0064) ------------
export type ProfessionalWhatsappIdentityStatus =
  | 'unverified'
  | 'pending_verification'
  | 'verified'
  | 'pending_replacement'
  | 'revoked';

export type ProfessionalWhatsappIdentity = {
  professional_id: string;
  status: ProfessionalWhatsappIdentityStatus;
  // Só populado em 'verified'/'pending_replacement'.
  verified_number: string | null;
  verified_at: string | null;
  // Número em processo de verificação (primeira vez OU troca).
  candidate_number: string | null;
  candidate_requested_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProfessionalWhatsappIdentityEventType = 'candidate_submitted' | 'verified' | 'replaced' | 'revoked';

export type ProfessionalWhatsappIdentityEvent = {
  id: string;
  professional_id: string;
  event_type: ProfessionalWhatsappIdentityEventType;
  number: string | null;
  previous_status: string | null;
  new_status: string | null;
  created_at: string;
};

// --- Comunidade (migration 0059) -----------------------------------
// V1 é artista-only (community_profiles/RPCs recusam role != 'artista'
// — nunca reforçado só no client). Escrita sempre via RPC security
// definer, exceto community_saved_topics (única exceção, RLS direta).
export type CommunityCategory = {
  id: string;
  slug: string;
  label: string;
  sort_order: number;
  active: boolean;
};

export type CommunityTag = {
  id: string;
  slug: string;
  label: string;
  active: boolean;
};

// Domínio exclusivo de moderação (bloco futuro) — nunca setado pelo
// próprio profissional (trigger prevent_self_community_moderation_change
// bloqueia isso no banco, não só por convenção de RPC).
export type CommunityVisibilityStatus = 'active' | 'restricted' | 'blocked';

export type CommunityProfile = {
  profile_id: string;
  visibility_status: CommunityVisibilityStatus;
  available_for_referrals: boolean;
  show_city: boolean;
  show_avatar: boolean;
  show_bio: boolean;
  show_specialties: boolean;
  show_work_types: boolean;
  show_instagram: boolean;
  show_portfolio: boolean;
  activated_at: string;
  updated_at: string;
};

// Leitura seletiva de OUTRO profissional na Comunidade — única fonte
// seura pra isso (aplica as preferências show_*, nunca o client
// escondendo depois). visibility_status nunca é exposto aqui de
// propósito (moderação é assunto interno).
export type CommunityProfilePublic = {
  profile_id: string;
  display_name: string;
  profession_label: string | null;
  profession_id: string | null;
  is_pro: boolean;
  available_for_referrals: boolean;
  is_incomplete: boolean;
  city: string | null;
  state: string | null;
  avatar_url: string | null;
  bio: string | null;
  specialties: string[] | null;
  work_types: string[] | null;
  instagram_url: string | null;
  portfolio_url: string | null;
};

export type CommunityTopicAudience = 'niche' | 'all';
// Soft delete sempre — a linha nunca é apagada, pra nunca quebrar
// reply_to_post_id de terceiros nem o contexto de outras respostas.
export type CommunityContentStatus = 'published' | 'removed_by_author' | 'removed_by_moderator';

export type CommunityTopic = {
  id: string;
  author_profile_id: string;
  title: string;
  body: string;
  category_id: string;
  audience: CommunityTopicAudience;
  status: CommunityContentStatus;
  // Conta TODAS as respostas já criadas, inclusive removidas depois —
  // sinal de atividade, não de conteúdo visível agora.
  reply_count: number;
  participant_count: number;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
};

export type CommunityTopicTag = {
  topic_id: string;
  tag_id: string;
};

export type CommunityPost = {
  id: string;
  topic_id: string;
  author_profile_id: string;
  body: string;
  reply_to_post_id: string | null;
  status: CommunityContentStatus;
  created_at: string;
  updated_at: string;
};

export type CommunityMention = {
  id: string;
  post_id: string;
  mentioned_profile_id: string;
  created_at: string;
};

export type CommunitySavedTopic = {
  profile_id: string;
  topic_id: string;
  created_at: string;
};

export type CommunityNotificationType = 'reply_to_topic' | 'reply_to_post' | 'mention';

export type CommunityNotification = {
  id: string;
  recipient_profile_id: string;
  actor_profile_id: string;
  type: CommunityNotificationType;
  topic_id: string;
  post_id: string | null;
  read_at: string | null;
  created_at: string;
};

// A lib do Supabase exige `Relationships` em cada tabela (usado só pra
// joins embutidos via .select('foo(*)')). Não usamos essa sintaxe — as
// junções são feitas com queries separadas — então fica sempre [].
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & Pick<Profile, 'id' | 'role' | 'full_name'>;
        Update: Partial<Profile>;
        Relationships: [];
      };
      artist_profiles: {
        Row: ArtistProfile;
        Insert: Partial<ArtistProfile> & Pick<ArtistProfile, 'profile_id'>;
        Update: Partial<ArtistProfile>;
        Relationships: [];
      };
      professions: {
        Row: Profession;
        Insert: Profession;
        Update: Partial<Profession>;
        Relationships: [];
      };
      profession_job_types: {
        Row: ProfessionJobType;
        Insert: Partial<ProfessionJobType> & Pick<ProfessionJobType, 'profession_id' | 'label'>;
        Update: Partial<ProfessionJobType>;
        Relationships: [];
      };
      booker_profiles: {
        Row: BookerProfile;
        Insert: Partial<BookerProfile> & Pick<BookerProfile, 'profile_id'>;
        Update: Partial<BookerProfile>;
        Relationships: [];
      };
      agency_profiles: {
        Row: AgencyProfile;
        Insert: Partial<AgencyProfile> &
          Pick<AgencyProfile, 'profile_id' | 'agency_name'>;
        Update: Partial<AgencyProfile>;
        Relationships: [];
      };
      bookings: {
        Row: Booking;
        Insert: Partial<Booking> &
          Pick<
            Booking,
            'artist_profile_id' | 'booker_profile_id' | 'proposed_by' | 'commission_percent'
          >;
        Update: Partial<Booking>;
        Relationships: [];
      };
      booking_events: {
        Row: BookingEvent;
        Insert: Partial<BookingEvent> &
          Pick<BookingEvent, 'booking_id' | 'actor_profile_id' | 'event_type'>;
        Update: Partial<BookingEvent>;
        Relationships: [];
      };
      invites: {
        Row: Invite;
        Insert: Partial<Invite> & Pick<Invite, 'inviter_profile_id' | 'invitee_name'>;
        Update: Partial<Invite>;
        Relationships: [];
      };
      representations: {
        Row: Representation;
        Insert: Partial<Representation> &
          Pick<Representation, 'artist_profile_id' | 'booker_profile_id'>;
        Update: Partial<Representation>;
        Relationships: [];
      };
      favorites: {
        Row: Favorite;
        Insert: Pick<Favorite, 'user_id' | 'favorited_user_id'>;
        Update: Partial<Favorite>;
        Relationships: [];
      };
      opportunities: {
        Row: Opportunity;
        Insert: Partial<Opportunity> &
          Pick<Opportunity, 'artist_profile_id' | 'description' | 'commission_percent'>;
        Update: Partial<Opportunity>;
        Relationships: [];
      };
      opportunity_dismissals: {
        Row: OpportunityDismissal;
        Insert: Partial<OpportunityDismissal> &
          Pick<OpportunityDismissal, 'opportunity_id' | 'booker_profile_id'>;
        Update: Partial<OpportunityDismissal>;
        Relationships: [];
      };
      representation_requests: {
        Row: RepresentationRequest;
        Insert: Partial<RepresentationRequest> &
          Pick<
            RepresentationRequest,
            'booker_profile_id' | 'artist_profile_id' | 'requested_by_profile_id'
          >;
        Update: Partial<RepresentationRequest>;
        Relationships: [];
      };
      opportunity_invitations: {
        Row: OpportunityInvitation;
        Insert: Partial<OpportunityInvitation> &
          Pick<OpportunityInvitation, 'opportunity_id' | 'booker_profile_id'>;
        Update: Partial<OpportunityInvitation>;
        Relationships: [];
      };
      opportunity_interests: {
        Row: OpportunityInterest;
        Insert: Partial<OpportunityInterest> &
          Pick<OpportunityInterest, 'opportunity_id' | 'booker_profile_id'>;
        Update: Partial<OpportunityInterest>;
        Relationships: [];
      };
      opportunity_events: {
        Row: OpportunityEvent;
        Insert: Partial<OpportunityEvent> & Pick<OpportunityEvent, 'opportunity_id'>;
        Update: Partial<OpportunityEvent>;
        Relationships: [];
      };
      opportunity_tags: {
        Row: OpportunityTag;
        Insert: Partial<OpportunityTag> & Pick<OpportunityTag, 'opportunity_id' | 'tag' | 'source'>;
        Update: Partial<OpportunityTag>;
        Relationships: [];
      };
      ai_usage_events: {
        Row: AiUsageEvent;
        Insert: Partial<AiUsageEvent> & Pick<AiUsageEvent, 'feature'>;
        Update: Partial<AiUsageEvent>;
        Relationships: [];
      };
      // Doopla Intelligence OS v1 (migration 0039). Insert/Update
      // `never` nas tabelas onde o banco de fato não concede escrita
      // direta pra authenticated — reflete a garantia real (privilégio
      // de coluna/tabela + RLS), não só uma preferência de código:
      // conversations/conversation_mandate_events/conversation_state_events
      // só são escritas pelas RPCs create_conversation/
      // set_conversation_mandate/advance_conversation_state.
      external_participants: {
        Row: ExternalParticipant;
        Insert: Partial<ExternalParticipant> & Pick<ExternalParticipant, 'professional_id'>;
        Update: Partial<ExternalParticipant>;
        Relationships: [];
      };
      external_participant_channel_identities: {
        Row: ExternalParticipantChannelIdentity;
        Insert: Partial<ExternalParticipantChannelIdentity> &
          Pick<ExternalParticipantChannelIdentity, 'external_participant_id' | 'professional_id' | 'channel' | 'identifier'>;
        Update: never;
        Relationships: [];
      };
      conversations: {
        Row: Conversation;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      conversation_messages: {
        Row: ConversationMessage;
        Insert: Partial<ConversationMessage> &
          Pick<ConversationMessage, 'conversation_id' | 'direction' | 'author_type' | 'channel' | 'content_type'>;
        Update: never;
        Relationships: [];
      };
      conversation_mandate_events: {
        Row: ConversationMandateEvent;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      conversation_state_events: {
        Row: ConversationStateEvent;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      // Doopla Intelligence Core v1 (migration 0042). Mesmo padrão:
      // só escrita via start_orchestrator_run/finish_orchestrator_run.
      orchestrator_runs: {
        Row: OrchestratorRun;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      artist_availability: {
        Row: ArtistAvailability;
        Insert: Partial<ArtistAvailability> &
          Pick<ArtistAvailability, 'artist_profile_id' | 'available_date'>;
        Update: Partial<ArtistAvailability>;
        Relationships: [];
      };
      agenda_entries: {
        Row: AgendaEntry;
        Insert: Partial<AgendaEntry> &
          Pick<
            AgendaEntry,
            'artist_profile_id' | 'created_by_profile_id' | 'entry_type' | 'start_date' | 'end_date'
          >;
        Update: Partial<AgendaEntry>;
        Relationships: [];
      };
      subscriptions: {
        Row: Subscription;
        Insert: Partial<Subscription> & Pick<Subscription, 'profile_id' | 'role'>;
        Update: Partial<Subscription>;
        Relationships: [];
      };
      founder_vouchers: {
        Row: FounderVoucher;
        Insert: Partial<FounderVoucher> & Pick<FounderVoucher, 'code'>;
        Update: Partial<FounderVoucher>;
        Relationships: [];
      };
      payout_requests: {
        Row: PayoutRequest;
        Insert: Partial<PayoutRequest> & Pick<PayoutRequest, 'profile_id' | 'amount_cents'>;
        Update: Partial<PayoutRequest>;
        Relationships: [];
      };
      payment_details: {
        Row: PaymentDetails;
        // Sem Insert/Update reais — RLS não permite escrita direta,
        // único caminho é a RPC set_payment_details (migration 0046).
        Insert: never;
        Update: never;
        Relationships: [];
      };
      reviews: {
        Row: Review;
        Insert: Partial<Review> &
          Pick<Review, 'booking_id' | 'reviewer_profile_id' | 'reviewee_profile_id'>;
        Update: Partial<Review>;
        Relationships: [];
      };
      referrals: {
        Row: Referral;
        Insert: Partial<Referral> &
          Pick<Referral, 'referrer_profile_id' | 'referred_profile_id' | 'code'>;
        Update: Partial<Referral>;
        Relationships: [];
      };
      booking_contracts: {
        Row: BookingContract;
        Insert: Partial<BookingContract> &
          Pick<BookingContract, 'booking_id' | 'template_version' | 'generated_by_profile_id' | 'content'>;
        Update: Partial<BookingContract>;
        Relationships: [];
      };
      artist_link_routing: {
        Row: ArtistLinkRouting;
        Insert: Partial<ArtistLinkRouting> & Pick<ArtistLinkRouting, 'artist_id'>;
        Update: Partial<ArtistLinkRouting>;
        Relationships: [];
      };
      // Professional Product UI — Foundation. Escrita exclusiva via RPC
      // security definer em todas as tabelas abaixo (Insert/Update
      // `never` reflete a garantia real de RLS/grant, não preferência
      // de código) — exceto community_saved_topics, único caso com
      // policy de insert/delete direta pra authenticated (0059).
      outbound_intents: {
        Row: OutboundIntent;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      runtime_pending_replies: {
        Row: RuntimePendingReply;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      approval_records: {
        Row: ApprovalRecord;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      policy_gate_decisions: {
        Row: PolicyGateDecision;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      product_events: {
        Row: ProductEvent;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      professional_whatsapp_identities: {
        Row: ProfessionalWhatsappIdentity;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      professional_whatsapp_identity_events: {
        Row: ProfessionalWhatsappIdentityEvent;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      community_categories: {
        Row: CommunityCategory;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      community_tags: {
        Row: CommunityTag;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      community_profiles: {
        Row: CommunityProfile;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      community_topics: {
        Row: CommunityTopic;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      community_topic_tags: {
        Row: CommunityTopicTag;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      community_posts: {
        Row: CommunityPost;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      community_mentions: {
        Row: CommunityMention;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      community_saved_topics: {
        Row: CommunitySavedTopic;
        Insert: Pick<CommunitySavedTopic, 'profile_id' | 'topic_id'>;
        Update: never;
        Relationships: [];
      };
      community_notifications: {
        Row: CommunityNotification;
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: {
      community_profiles_public: {
        Row: CommunityProfilePublic;
        Relationships: [];
      };
    };
    Functions: {
      // Doopla Intelligence OS v1 (migration 0039) — únicos caminhos
      // de escrita pra conversations/conversation_mandate_events/
      // conversation_state_events. Cada uma valida o chamador
      // internamente (auth.uid()), nunca confia nos parâmetros como
      // prova de identidade.
      create_conversation: {
        Args: {
          p_represented_professional_id: string;
          p_conversation_type?: ConversationType;
          p_external_participant_id?: string | null;
          p_origin?: ConversationChannel;
          p_origin_reference?: string | null;
          p_channel?: ConversationChannel | null;
          p_initial_mandate?: string;
          p_initial_state?: string;
          p_transferred_from_conversation_id?: string | null;
        };
        Returns: Conversation;
      };
      set_conversation_mandate: {
        Args: {
          p_conversation_id: string;
          p_new_mandate: string;
          p_reason?: string | null;
          p_changed_by?: ConversationEventActor;
          p_changed_by_profile_id?: string | null;
        };
        Returns: Conversation;
      };
      advance_conversation_state: {
        Args: {
          p_conversation_id: string;
          p_new_state: string;
          p_reason?: string | null;
          p_changed_by?: ConversationEventActor;
          p_changed_by_profile_id?: string | null;
        };
        Returns: Conversation;
      };
      // Doopla Intelligence OS v1 (migration 0041, Args estendido na
      // 0042 com p_run_id) — único caminho de INSERT em ai_usage_events
      // pra authenticated. profile_id é sempre auth.uid() dentro da
      // function, nunca um parâmetro.
      log_ai_usage_event: {
        Args: {
          p_feature: string;
          p_model: string;
          p_status: AiUsageEventStatus;
          p_conversation_id?: string | null;
          p_input_tokens?: number | null;
          p_output_tokens?: number | null;
          p_run_id?: string | null;
          // Migration 0055 — obrigatório no caminho is_system_caller()
          // (service_role/Runtime); ignorado no caminho authenticated
          // (profile_id continua sempre auth.uid()).
          p_professional_id?: string | null;
        };
        Returns: AiUsageEvent;
      };
      // Doopla Intelligence Core v1 (migration 0042) — únicos caminhos
      // de escrita em orchestrator_runs. actor_type só aceita
      // 'professional' em v1 (validado dentro da function, nunca
      // confiado do parâmetro sozinho).
      start_orchestrator_run: {
        Args: {
          p_conversation_id: string;
          p_represented_professional_id: string;
          p_actor_type: OrchestratorRunActorType;
          p_actor_profile_id: string | null;
          p_external_participant_id: string | null;
          p_trigger_source: string;
          p_eligible_tools?: string[];
        };
        Returns: OrchestratorRun;
      };
      // Bloco 3 (migration 0043) — Args estendido com metadados de
      // classificação, todos opcionais (nulos pra runs que não
      // classificam nada).
      finish_orchestrator_run: {
        Args: {
          p_run_id: string;
          p_status: OrchestratorRunStatus;
          p_called_tools?: string[];
          p_error?: string | null;
          p_fallback_used?: boolean;
          p_primary_intent?: string | null;
          p_secondary_intents?: string[];
          p_competencies?: string[];
          p_model_confidence?: OrchestratorRunModelConfidence | null;
          p_effective_confidence?: OrchestratorRunEffectiveConfidence | null;
          p_context_completeness?: OrchestratorRunContextCompleteness | null;
          p_classification_status?: OrchestratorRunClassificationStatus | null;
        };
        Returns: OrchestratorRun;
      };
      select_booker_for_opportunity: {
        Args: { p_opportunity_id: string; p_booker_profile_id: string };
        Returns: Opportunity;
      };
      expire_stale_representation_requests: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      expire_booker_pro_subscriptions: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      submit_orcamento_request: {
        Args: {
          p_artist_slug: string;
          p_description: string;
          p_client_name: string;
          p_client_contact: string;
          p_event_date: string | null;
          p_location: string | null;
          p_offered_cents: number | null;
        };
        Returns: string;
      };
      set_payment_details: {
        Args: {
          p_method: PaymentMethod;
          p_pix_key_type: PixKeyType | null;
          p_pix_key: string | null;
          p_holder_name: string | null;
        };
        Returns: PaymentDetails;
      };
      is_operationally_ready: {
        Args: { p_profile_id: string };
        Returns: boolean;
      };
      request_representation_link: {
        Args: { p_target_profile_id: string; p_message: string | null };
        Returns: 'requested' | 'accepted';
      };
      find_representation_target_by_contact: {
        Args: { p_contact: string };
        Returns: ContactMatch[];
      };
      terminate_representation: {
        Args: { p_representation_id: string };
        Returns: undefined;
      };
      get_invite_by_token: {
        Args: { p_token: string };
        Returns: InviteByToken[];
      };
      // Professional Product UI — Foundation. RPCs de WhatsApp Identity
      // (migration 0064) — auth.uid() sempre revalidado contra
      // p_professional_id por dentro da function, nunca confiado do
      // parâmetro sozinho.
      request_whatsapp_verification: {
        Args: { p_professional_id: string; p_candidate_number: string };
        Returns: { challenge_id: string; code: string; expires_at: string }[];
      };
      confirm_whatsapp_verification: {
        Args: { p_professional_id: string; p_code: string };
        Returns: { confirmed: boolean; reason: string | null }[];
      };
      revoke_whatsapp_verification: {
        Args: { p_professional_id: string };
        Returns: boolean;
      };
      // Professional Product UI — Foundation. RPCs de Comunidade
      // (migration 0059) — auth.uid() é sempre a fonte de identidade
      // dentro da function, nunca um parâmetro vindo do client.
      activate_community_profile: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      update_community_profile: {
        Args: {
          p_available_for_referrals: boolean;
          p_show_city: boolean;
          p_show_avatar: boolean;
          p_show_bio: boolean;
          p_show_specialties: boolean;
          p_show_work_types: boolean;
          p_show_instagram: boolean;
          p_show_portfolio: boolean;
        };
        Returns: undefined;
      };
      create_community_topic: {
        Args: {
          p_title: string;
          p_body: string;
          p_category_id: string;
          p_audience?: CommunityTopicAudience;
          p_tag_ids?: string[];
        };
        Returns: string;
      };
      remove_community_topic: {
        Args: { p_topic_id: string };
        Returns: undefined;
      };
      create_community_post: {
        Args: {
          p_topic_id: string;
          p_body: string;
          p_reply_to_post_id?: string | null;
          p_mentioned_profile_ids?: string[];
        };
        Returns: string;
      };
      remove_community_post: {
        Args: { p_post_id: string };
        Returns: undefined;
      };
      mark_community_notification_read: {
        Args: { p_notification_id: string };
        Returns: undefined;
      };
    };
  };
};
