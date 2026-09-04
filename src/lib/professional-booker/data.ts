import type { SupabaseClient } from '@supabase/supabase-js';

import type { Representation, RepresentationRequest, RepresentationRequestStatus } from '@/lib/supabase/types';

// Professional Product UI — Foundation. Boundary de leitura da relação
// Booker vista PELO PROFISSIONAL — reaproveita 100% o schema/RPCs já
// existentes e testados (representations/representation_requests/invites,
// migrations 0005/0018/0033), NUNCA um schema novo. NÃO constrói
// Booker Web Dashboard/App, NÃO ativa authorized_collaborator
// capabilities (seguem vazias de propósito, decisão de produto em
// aberto — ver DECISOES.md "Booker: não classificado como
// definitivamente pós-beta"). Só o contrato de leitura pro futuro
// "Minha equipe" do profissional.
//
// Arquitetura vigente, preservada: um Booker pode representar
// múltiplos professional_id (carteira) — e o inverso também é
// permitido pelo schema (representations só impede duplicar o MESMO
// par artista+booker, `unique (artist_profile_id, booker_profile_id)`,
// nunca limita a 1 booker por artista). Por isso esta function nunca
// devolve "o" booker como singular — devolve LISTAS (ativos +
// pendentes, cada um com direção clara).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any>;

export type ActiveBookerRelationship = {
  representationId: string;
  bookerProfileId: string;
  createdAt: string;
};

export type PendingBookerRequestDirection = 'incoming' | 'outgoing';

export type PendingBookerRequest = {
  requestId: string;
  bookerProfileId: string;
  // 'incoming': o booker convidou o profissional (profissional decide
  // aceitar/recusar). 'outgoing': o profissional convidou o booker
  // (profissional pode cancelar, esperando a resposta do booker).
  direction: PendingBookerRequestDirection;
  message: string | null;
  expiresAt: string;
  createdAt: string;
};

export type ProfessionalBookerFacts = {
  active: ActiveBookerRelationship[];
  pending: PendingBookerRequest[];
};

// Direção derivada por comparação pura (mesmo padrão de
// classifyBookingForChip/wasProposedByViewer no Mobile) — nunca
// inferida por heurística, só quem de fato iniciou o pedido.
export function deriveBookerRequestDirection(request: Pick<RepresentationRequest, 'requested_by_profile_id'>, professionalId: string): PendingBookerRequestDirection {
  return request.requested_by_profile_id === professionalId ? 'outgoing' : 'incoming';
}

const PENDING_STATUS: RepresentationRequestStatus = 'pendente';

export async function getMyBookerFacts(supabase: AnySupabaseClient, professionalId: string): Promise<ProfessionalBookerFacts> {
  const [activeResult, pendingResult] = await Promise.all([
    supabase.from('representations').select('id, booker_profile_id, created_at').eq('artist_profile_id', professionalId),
    supabase
      .from('representation_requests')
      .select('id, booker_profile_id, requested_by_profile_id, message, expires_at, created_at')
      .eq('artist_profile_id', professionalId)
      .eq('status', PENDING_STATUS),
  ]);

  const active = ((activeResult.data ?? []) as Pick<Representation, 'id' | 'booker_profile_id' | 'created_at'>[]).map((row) => ({
    representationId: row.id,
    bookerProfileId: row.booker_profile_id,
    createdAt: row.created_at,
  }));

  const pending = (
    (pendingResult.data ?? []) as Pick<RepresentationRequest, 'id' | 'booker_profile_id' | 'requested_by_profile_id' | 'message' | 'expires_at' | 'created_at'>[]
  ).map((row) => ({
    requestId: row.id,
    bookerProfileId: row.booker_profile_id,
    direction: deriveBookerRequestDirection(row, professionalId),
    message: row.message,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }));

  return { active, pending };
}

// Ações — nenhuma lógica nova aqui, só re-exporta os nomes das Server
// Actions/RPCs já reais e testadas, pra deixar claro quais ações a
// futura UI "Minha equipe" vai chamar:
//   - convidar: requestRepresentationAction (src/app/dashboard/actions.ts)
//     -> RPC request_representation_link.
//   - reenviar: NÃO existe hoje um "reenviar" — expira em 7 dias
//     (expire_stale_representation_requests) e um novo convite é uma
//     nova chamada de requestRepresentationAction. Gap registrado, não
//     inventado aqui.
//   - cancelar convite enviado por mim: NÃO existe uma action dedicada
//     hoje — só terminateRepresentationAction (relação já ATIVA) e
//     respondRepresentationRequestAction (só quem NÃO iniciou pode
//     aceitar/recusar, confirmado no código: bloqueia explicitamente
//     quando user.id === request.requested_by_profile_id). Cancelar um
//     pedido pendente que EU mandei é um gap real, registrado, não
//     resolvido silenciosamente.
//   - aceitar/recusar: respondRepresentationRequestAction.
//   - remover vínculo ativo: terminateRepresentationAction.