import type { SupabaseClient } from '@supabase/supabase-js';

import type { ProfessionalWhatsappIdentityStatus } from '@/lib/supabase/types';

// Professional Product UI — Foundation. Boundary de LEITURA do estado
// atual da WhatsApp Identity (migration 0064) — as 3 RPCs de escrita
// já existem em src/app/dashboard/whatsapp-identity-actions.ts, mas
// nada lia o estado atual pra decidir o que mostrar antes desta
// função. NÃO constrói a UI aqui.
//
// Regra canônica preservada, nunca contornada: telefone informado ≠
// identidade confiável. "não informado" = nenhuma linha na tabela
// (nunca fabricada aqui) — status volta null nesse caso, e o CALLER
// decide como tratar 'unverified' (equivalente a nunca ter começado o
// fluxo).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any>;

export type WhatsappIdentitySnapshot = {
  status: ProfessionalWhatsappIdentityStatus;
  verifiedNumber: string | null;
  verifiedAt: string | null;
  candidateNumber: string | null;
  candidateRequestedAt: string | null;
};

type RawIdentityRow = {
  status: ProfessionalWhatsappIdentityStatus;
  verified_number: string | null;
  verified_at: string | null;
  candidate_number: string | null;
  candidate_requested_at: string | null;
};

// Retorna null quando nenhuma linha existe ainda — equivalente
// semântico a status='unverified' (nunca fabricamos uma linha pra
// "completar" o contrato: zero trust nunca gera registro, mesma regra
// do banco).
export async function getWhatsappIdentitySnapshot(supabase: AnySupabaseClient, professionalId: string): Promise<WhatsappIdentitySnapshot | null> {
  const { data } = await supabase
    .from('professional_whatsapp_identities')
    .select('status, verified_number, verified_at, candidate_number, candidate_requested_at')
    .eq('professional_id', professionalId)
    .maybeSingle();
  if (!data) return null;
  const row = data as RawIdentityRow;
  return {
    status: row.status,
    verifiedNumber: row.verified_number,
    verifiedAt: row.verified_at,
    candidateNumber: row.candidate_number,
    candidateRequestedAt: row.candidate_requested_at,
  };
}
