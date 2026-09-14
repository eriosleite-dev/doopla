import { supabase } from '@/lib/supabase';
import type { ApprovalRecord } from '@/types/approval';

// get_active_approvals: última versão de cada chain (decision_category
// + subject_key) da raiz comercial do booking — HISTÓRICO do que já
// foi efetivamente decidido (via commit_approval_resolution, chamado
// pelo pipeline do Runtime a partir da conversa real). Não é fila de
// pendência — nunca renderizar como "aguardando ação".
export async function fetchActiveApprovalsForBooking(professionalId: string, bookingId: string): Promise<ApprovalRecord[]> {
  const { data, error } = await supabase.rpc('get_active_approvals', {
    p_professional_id: professionalId,
    p_booking_id: bookingId,
    p_opportunity_id: null,
  });
  if (error) throw error;
  return (data ?? []) as ApprovalRecord[];
}
