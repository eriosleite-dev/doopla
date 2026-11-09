// Doopla Intelligence Core v1 — Beta Instrumentation: registry canônico
// de category/event_type.
//
// category tem CHECK constraint no banco (taxonomia arquitetural
// pequena e estável — 'lifecycle' reservada pro futuro bloco de
// Lifecycle Messaging, sem uso aqui). event_type NÃO tem CHECK no banco
// de propósito (a lista cresce em blocos futuros) — mas nunca é "livre"
// de verdade: este arquivo é a ÚNICA fonte de verdade em código, mesmo
// idioma de classification/intents.ts — ajustar a taxonomia é mudar
// este arquivo, nunca uma string solta espalhada pelo código.

export const PRODUCT_EVENT_CATEGORIES = ['product', 'value', 'lifecycle'] as const;
export type ProductEventCategory = (typeof PRODUCT_EVENT_CATEGORIES)[number];

// product.* — fatos operacionais, nunca interpretados neste bloco.
// Deliberadamente pequeno: eventos já cobertos por tabelas existentes
// (proposed_value/discount/negotiation -> communicated_proposal_candidates;
// acceptance -> approval_records) NÃO são duplicados aqui — só o que
// não tinha nenhuma fonte estruturada até este bloco.
const PRODUCT_EVENTS = [
  'product.demand_received',
  'product.booking_closed',
  'product.booking_cancelled',
] as const;

// value.* — resultado operacional VERIFICÁVEL, nunca "mensagem
// enviada" tratado como valor por si só. Cada um tem critério
// determinístico próprio (ver value-events.ts). Compõem o funil de TTV
// junto com account_created/whatsapp_verified/first_real_demand (esses
// três não são product_events — vêm de profiles.created_at/
// professional_whatsapp_identities.verified_at/product.demand_received).
const VALUE_EVENTS = [
  'value.decision_prepared',
  'value.meaningful_client_action',
  'value.operational_task_resolved',
  'value.booking_closed',
] as const;

export const PRODUCT_EVENT_TYPES = [...PRODUCT_EVENTS, ...VALUE_EVENTS] as const;
export type ProductEventType = (typeof PRODUCT_EVENT_TYPES)[number];

export function isValidProductEventType(value: string): value is ProductEventType {
  return (PRODUCT_EVENT_TYPES as readonly string[]).includes(value);
}

export const SUBJECT_TYPES = ['booking', 'opportunity', 'conversation', 'professional'] as const;
export type SubjectType = (typeof SUBJECT_TYPES)[number];
