import { supabase } from '@/lib/supabase';

// Espelha src/lib/professional-booker/data.ts (painel web) — mesmo
// schema real (representations/representation_requests, migrations
// 0005/0018/0033), mesma RLS. NÃO ativa authorized_collaborator
// capabilities, NÃO constrói Booker App — só o boundary de leitura pro
// futuro "Minha equipe" do profissional (mais/equipe.tsx continua
// placeholder).

export type ActiveBookerRelationship = {
  representationId: string;
  bookerProfileId: string;
  createdAt: string;
};

export type PendingBookerRequestDirection = 'incoming' | 'outgoing';

export type PendingBookerRequest = {
  requestId: string;
  bookerProfileId: string;
  direction: PendingBookerRequestDirection;
  message: string | null;
  expiresAt: string;
  createdAt: string;
};

export type ProfessionalBookerFacts = {
  active: ActiveBookerRelationship[];
  pending: PendingBookerRequest[];
};

type RawRepresentationRow = { id: string; booker_profile_id: string; created_at: string };
type RawRequestRow = {
  id: string;
  booker_profile_id: string;
  requested_by_profile_id: string;
  message: string | null;
  expires_at: string;
  created_at: string;
};

// Mesmo padrão puro de classifyBookingForChip/wasProposedByViewer —
// nunca heurística, só comparação direta de quem iniciou.
export function deriveBookerRequestDirection(request: Pick<RawRequestRow, 'requested_by_profile_id'>, professionalId: string): PendingBookerRequestDirection {
  return request.requested_by_profile_id === professionalId ? 'outgoing' : 'incoming';
}

export async function fetchMyBookerFacts(professionalId: string): Promise<ProfessionalBookerFacts> {
  const [activeResult, pendingResult] = await Promise.all([
    supabase.from('representations').select('id, booker_profile_id, created_at').eq('artist_profile_id', professionalId).returns<RawRepresentationRow[]>(),
    supabase
      .from('representation_requests')
      .select('id, booker_profile_id, requested_by_profile_id, message, expires_at, created_at')
      .eq('artist_profile_id', professionalId)
      .eq('status', 'pendente')
      .returns<RawRequestRow[]>(),
  ]);
  if (activeResult.error) throw activeResult.error;
  if (pendingResult.error) throw pendingResult.error;

  const active = (activeResult.data ?? []).map((row) => ({
    representationId: row.id,
    bookerProfileId: row.booker_profile_id,
    createdAt: row.created_at,
  }));

  const pending = (pendingResult.data ?? []).map((row) => ({
    requestId: row.id,
    bookerProfileId: row.booker_profile_id,
    direction: deriveBookerRequestDirection(row, professionalId),
    message: row.message,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }));

  return { active, pending };
}
