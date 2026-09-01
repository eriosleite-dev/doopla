import { createClient } from '@/lib/supabase/server';

// Doopla Intelligence Core v1 — Passo 4a (Beta Runtime Integration:
// painel). Leitura PURAMENTE read-only do estado que o Runtime já
// persistiu — nunca reexecuta lógica do Runtime, nunca reinterpreta
// policy_gate_decisions/approval_records, nunca infere "precisa de
// você" a partir de status/delivery_state. Cada função devolve
// exatamente as linhas que o client `authenticated` consegue ver — a
// filtragem por dono é 100% da RLS (migration 0056 pra
// runtime_pending_replies; "outbound_intents: select own", migration
// 0051, já existia), nunca um filtro adicional aqui: nenhum .eq() de
// professional/conversation nestas queries, de propósito — se
// aparecesse dado de outro profissional, a ausência de filtro no
// código deixaria isso óbvio em vez de mascarar uma RLS quebrada.
//
// Sem UI ainda — só prova que a leitura real funciona sob RLS. Semântica
// de apresentação (o que "pending" significa pro profissional) é uma
// decisão de produto pra depois, fora do escopo deste passo.

export type RuntimePendingReplyRow = {
  id: string;
  conversation_id: string;
  commercial_root_id: string;
  trigger_message_id: string;
  policy_gate_decision_id: string;
  run_id: string | null;
  status: string;
  superseded_by_id: string | null;
  created_at: string;
  resolved_at: string | null;
};

export type OutboundIntentRow = {
  id: string;
  conversation_id: string;
  professional_id: string;
  trigger_message_id: string | null;
  run_id: string | null;
  policy_decision_id: string | null;
  channel: string;
  recipient_external_participant_id: string | null;
  content: string;
  delivery_state: string;
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

export async function getRuntimePendingReplies(): Promise<RuntimePendingReplyRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('runtime_pending_replies').select('*').returns<RuntimePendingReplyRow[]>();
  return data ?? [];
}

export async function getOutboundIntents(): Promise<OutboundIntentRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('outbound_intents').select('*').returns<OutboundIntentRow[]>();
  return data ?? [];
}
