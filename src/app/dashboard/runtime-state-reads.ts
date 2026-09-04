import { createClient } from '@/lib/supabase/server';
import type { OutboundIntent, RuntimePendingReply } from '@/lib/supabase/types';

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

// Professional Product UI — Foundation: os tipos agora vivem em
// src/lib/supabase/types.ts (RuntimePendingReply/OutboundIntent) —
// nunca mais duplicados aqui, fonte única. Exportados de novo por este
// arquivo só pra não quebrar imports existentes.
export type RuntimePendingReplyRow = RuntimePendingReply;
export type OutboundIntentRow = OutboundIntent;

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
