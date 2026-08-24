import type { ConversationMessageAuthorType, ConversationMessageContentType, ConversationMessageDirection } from '@/lib/supabase/types';

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
  | 'external_participant';

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
// booking/participante externo) é uma destas 4 situações, sempre.
// Nenhuma delas é tratada como erro: são estados normais, prontos
// pra alimentar um futuro "missing_information".
//
// not_found é DELIBERADAMENTE opaco: cobre tanto "não existe" quanto
// "existe mas é de outro representado" — o Context Builder nunca vira
// canal lateral pra descobrir se um registro de outro tenant existe.
// ============================================================

export type ContextSection<TFact> =
  | { status: 'loaded'; facts: TFact[] }
  | { status: 'not_allowed' | 'no_link' | 'not_found' };

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
  | { status: 'not_allowed' }
  | { status: 'loaded'; items: MessageContextItem[]; windowMessageCount: number; windowSince: string };

// ============================================================
// Pacote completo
// ============================================================

export type ContextPackage = {
  conversationId: string;
  representedProfessionalId: string;
  builtAt: string;
  professional: ContextSection<ContextFact>;
  messages: MessagesSection;
  opportunity: ContextSection<ContextFact>;
  booking: ContextSection<ContextFact>;
  externalParticipant: ContextSection<ContextFact>;
};

export type ContextBuildResult = {
  contextPackage: ContextPackage;
  // Tools do Tool Registry de fato chamadas ao montar o pacote —
  // sempre um subconjunto de eligibleTools, nunca inventado.
  calledTools: string[];
};
