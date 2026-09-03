import type { ConversationMessageAuthorType, ConversationMessageContentType, ConversationMessageDirection } from '@/lib/supabase/types';
import type { ToolExecutionError } from '../types';

// Doopla Intelligence Core v1 — Context Builder v1 (Bloco 2).
//
// ContextPackage é a fonte de verdade estruturada do contexto — nunca
// uma string. A transformação em texto pro model é uma etapa separada
// e posterior (render.ts), que só LÊ este pacote e nunca decide
// autorização/tenant/elegibilidade/provenance/risco.

// ============================================================
// Fatos — cada um já carrega a própria proveniência (source type +
// source id + campo), porque "de onde veio" é parte do próprio fato,
// não uma estrutura paralela que poderia dessincronizar dele.
// ============================================================

export type ContextFactSourceType =
  | 'professional_profile'
  | 'opportunity'
  | 'booking'
  | 'external_participant'
  // Professional Intelligence Context — CONHECIMENTO sobre o
  // profissional além desta conversa, nunca AUTORIZAÇÃO. Fatos destas
  // duas fontes são evidência de contexto/raciocínio válida (camada A),
  // mas deliberadamente NUNCA entram no whitelist de evidência que
  // autoriza compromisso (camada B, ver planner/invariants.ts,
  // COMMITMENT_AUTHORIZING_SOURCE_TYPES) — preferência declarada não
  // autoriza nada, precedente histórico não autoriza repeti-lo.
  | 'professional_business_context'
  | 'professional_commercial_history';

// structured: veio direto de uma READ tool/banco, sem cálculo.
// derived: calculado/resumido a partir de fatos estruturados — o
// contrato já existe pronto, mas o Bloco 2 não produz nenhum valor
// 'derived' (ver context-builder/sections.ts).
export type ContextFactType = 'structured' | 'derived';

export type ContextFact = {
  sourceType: ContextFactSourceType;
  sourceId: string;
  field: string;
  value: string | number | boolean;
  factType: ContextFactType;
  loadedAt: string;
  // Só true quando o valor foi cortado pelo budget (ex.: bio muito
  // longa) — nunca omitido silenciosamente.
  truncated?: boolean;
};

// ============================================================
// Seções — cada fonte de contexto (profissional/oportunidade/
// booking/participante externo) é uma destas situações.
//
// not_allowed/no_link/not_found são condições NORMAIS do produto —
// nunca tratadas como erro, prontas pra alimentar um futuro
// "missing_information". not_found é DELIBERADAMENTE opaco: cobre
// tanto "não existe" quanto "existe mas é de outro representado" — o
// Context Builder nunca vira canal lateral pra descobrir se um
// registro de outro tenant existe.
//
// unavailable é DIFERENTE dos outros três: significa que a fonte
// estava autorizada e deveria ter sido consultada, mas a consulta em
// si falhou (erro de banco/rede/timeout/parsing) — "não consegui
// verificar", nunca "verifiquei e não existe". Achado da auditoria
// adversarial do Bloco 2: sem este estado, uma falha operacional real
// virava silenciosamente not_found, e a Doopla podia concluir "não
// existe booking" quando na verdade só não deu pra checar.
// ============================================================

export type ContextSection<TFact> =
  | { status: 'loaded'; facts: TFact[] }
  | { status: 'not_allowed' | 'no_link' | 'not_found' | 'unavailable' };

// ============================================================
// Mensagens — unidade própria (não vira ContextFact por frase), mas
// com proveniência explícita por mensagem.
// ============================================================

export type MessageProvenance = {
  sourceType: 'conversation_message';
  sourceId: string;
};

export type MessageContextItem = {
  messageId: string;
  createdAt: string;
  authorType: ConversationMessageAuthorType;
  direction: ConversationMessageDirection;
  contentType: ConversationMessageContentType;
  // Resolvido conforme o tipo: body pra texto, transcript pra áudio
  // SÓ quando a transcrição estiver concluída, sempre null pra
  // attachment. Ausência de texto é normal, nunca inventada.
  text: string | null;
  truncated: boolean;
  provenance: MessageProvenance;
};

export type MessagesSection =
  | { status: 'not_allowed' | 'unavailable' }
  | { status: 'loaded'; items: MessageContextItem[]; windowMessageCount: number; windowSince: string };

// ============================================================
// Commercial history — mesmo formato loaded/not_allowed/unavailable de
// MessagesSection (zero itens é um estado normal, "loaded" com
// facts: [], nunca not_found), com um campo a mais: retrievalStrategy.
//
// 'recency_bounded_v1' é a ÚNICA estratégia implementada — seleção
// determinística pelos N bookings mais recentes do profissional, sem
// nenhum julgamento de relevância. O nome do tipo/campo já assume que
// vai existir uma v2 por relevância (mesmo cliente/tipo de
// trabalho/faixa de valor/local) — quando ela existir, troca só a
// função de seleção e adiciona um novo valor a este union; nenhum
// consumidor (ContextFact, EvidenceUsed, Planner) muda.
// ============================================================

export type CommercialHistoryRetrievalStrategy = 'recency_bounded_v1';

export type CommercialHistorySection =
  | { status: 'not_allowed' | 'unavailable' }
  | { status: 'loaded'; facts: ContextFact[]; retrievalStrategy: CommercialHistoryRetrievalStrategy; limit: number };

// ============================================================
// Pacote completo
// ============================================================

export type ContextPackage = {
  conversationId: string;
  representedProfessionalId: string;
  builtAt: string;
  professional: ContextSection<ContextFact>;
  // Preferências/dados de negócio DECLARADOS pelo profissional (mesmos
  // campos editáveis em /dashboard/perfil) — conhecimento estruturado,
  // nunca autorização (ver comentário em ContextFactSourceType).
  professionalBusinessContext: ContextSection<ContextFact>;
  // Histórico comercial real do próprio profissional (bookings
  // passados), retrieval V1 por recência — ver CommercialHistorySection.
  professionalCommercialHistory: CommercialHistorySection;
  messages: MessagesSection;
  opportunity: ContextSection<ContextFact>;
  booking: ContextSection<ContextFact>;
  externalParticipant: ContextSection<ContextFact>;
};

// Nome curto de cada seção — usado só pra reportar indisponibilidade
// pra observability, nunca pra decidir nada dentro do Builder.
export type ContextPackageSectionName =
  | 'professional'
  | 'professionalBusinessContext'
  | 'professionalCommercialHistory'
  | 'opportunity'
  | 'booking'
  | 'externalParticipant'
  | 'messages';

// Reason code sanitizado — nunca a mensagem crua de erro do
// Supabase/SDK. São sempre os códigos já tipados de ToolExecutionError
// (ver tool-registry.ts) mais 'query_error' pra falha na consulta
// direta de mensagens (que não passa pelo Tool Registry). Serve só
// pra observability distinguir "não consegui consultar" de
// "consultei e não achei", sem carregar detalhe técnico dentro do
// ContextPackage nem em nenhum campo que chegue ao model.
export type UnavailableSource = {
  source: ContextPackageSectionName;
  reasonCode: ToolExecutionError | 'query_error';
};

export type ContextBuildResult = {
  contextPackage: ContextPackage;
  // Tools do Tool Registry de fato chamadas ao montar o pacote —
  // sempre um subconjunto de eligibleTools, nunca inventado.
  calledTools: string[];
  // Toda seção que ficou 'unavailable' nesta execução — pra quem
  // chama o Builder decidir se registra fallback_used/observability.
  // Nunca carrega a mensagem técnica original.
  unavailableSources: UnavailableSource[];
};
