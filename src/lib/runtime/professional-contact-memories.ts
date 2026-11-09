import type { SupabaseClient } from '@supabase/supabase-js';

// Doopla Intelligence Core v1 — ADR 0004, Rodada 2 (15/10/2026):
// wrappers finos sobre professional_contact_memories (migration 0115)
// — núcleo de memória de contatos, aprovado pela fundadora/Head of AI
// (Decisões 1/2, Condições 3/4/5). Mesmo padrão de
// pending-delegated-contacts.ts: nenhuma lógica aqui além de
// tipar/mapear a chamada RPC — toda regra (dedup por telefone, alias,
// tenant, hard delete) vive só na migration.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any>;

export type ProfessionalContactMemorySourceType = 'contact_card' | 'manual_text';
export type ProfessionalContactMemoryStatus = 'active' | 'merged';

export type ProfessionalContactMemory = {
  id: string;
  professionalId: string;
  canonicalName: string;
  aliases: string[];
  phoneNumber: string;
  company: string | null;
  relationshipNote: string | null;
  externalParticipantId: string | null;
  sourceType: ProfessionalContactMemorySourceType;
  sourcePendingDelegatedContactId: string | null;
  sourceTriggerMessageId: string | null;
  status: ProfessionalContactMemoryStatus;
  mergedIntoId: string | null;
  createdAt: string;
  updatedAt: string;
};

type RawRow = {
  id: string;
  professional_id: string;
  canonical_name: string;
  aliases: string[];
  phone_number: string;
  company: string | null;
  relationship_note: string | null;
  external_participant_id: string | null;
  source_type: ProfessionalContactMemorySourceType;
  source_pending_delegated_contact_id: string | null;
  source_trigger_message_id: string | null;
  status: ProfessionalContactMemoryStatus;
  merged_into_id: string | null;
  created_at: string;
  updated_at: string;
};

function mapRow(row: RawRow): ProfessionalContactMemory {
  return {
    id: row.id,
    professionalId: row.professional_id,
    canonicalName: row.canonical_name,
    aliases: row.aliases,
    phoneNumber: row.phone_number,
    company: row.company,
    relationshipNote: row.relationship_note,
    externalParticipantId: row.external_participant_id,
    sourceType: row.source_type,
    sourcePendingDelegatedContactId: row.source_pending_delegated_contact_id,
    sourceTriggerMessageId: row.source_trigger_message_id,
    status: row.status,
    mergedIntoId: row.merged_into_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Único jeito de uma memória nascer ou ganhar um alias novo — sempre
// 'active' de origem (Decisão 1, ADR 0004: autoria inequívoca da
// própria profissional fornecendo o contato pedido). Idempotente:
// reexecutar com o mesmo (professionalId, phoneNumber) nunca duplica.
export async function createOrUpdateProfessionalContactMemory(
  supabase: AnySupabaseClient,
  params: {
    professionalId: string;
    canonicalName: string;
    phoneNumber: string;
    sourceType: ProfessionalContactMemorySourceType;
    sourcePendingDelegatedContactId?: string | null;
    sourceTriggerMessageId?: string | null;
    company?: string | null;
    relationshipNote?: string | null;
  }
): Promise<ProfessionalContactMemory> {
  const { data, error } = await supabase
    .rpc('create_or_update_professional_contact_memory', {
      p_professional_id: params.professionalId,
      p_canonical_name: params.canonicalName,
      p_phone_number: params.phoneNumber,
      p_source_type: params.sourceType,
      p_source_pending_delegated_contact_id: params.sourcePendingDelegatedContactId ?? null,
      p_source_trigger_message_id: params.sourceTriggerMessageId ?? null,
      p_company: params.company ?? null,
      p_relationship_note: params.relationshipNote ?? null,
    })
    .single();
  if (error || !data) throw new Error(`create_or_update_professional_contact_memory falhou: ${error?.message ?? 'sem dado'}`);
  return mapRow(data as RawRow);
}

// Único ponto de leitura pro lookup (delegated-contact-flow.ts). Nunca
// escolhe sozinho entre 2+ resultados — quem chama decide (resolve
// direto com 1, pergunta com 2+, comportamento de hoje com 0).
export async function findProfessionalContactMemoriesByName(
  supabase: AnySupabaseClient,
  params: { professionalId: string; name: string }
): Promise<ProfessionalContactMemory[]> {
  const { data, error } = await supabase.rpc('find_professional_contact_memories_by_name', {
    p_professional_id: params.professionalId,
    p_name: params.name,
  });
  if (error) throw new Error(`find_professional_contact_memories_by_name falhou: ${error.message}`);
  return ((data as RawRow[] | null) ?? []).map(mapRow);
}

// Correção explícita — sempre exige professionalId dono (nunca
// atravessa tenant, mesmo com o id exato da linha).
export async function correctProfessionalContactMemory(
  supabase: AnySupabaseClient,
  params: {
    id: string;
    professionalId: string;
    canonicalName?: string | null;
    phoneNumber?: string | null;
    company?: string | null;
    relationshipNote?: string | null;
  }
): Promise<ProfessionalContactMemory> {
  const { data, error } = await supabase
    .rpc('correct_professional_contact_memory', {
      p_id: params.id,
      p_professional_id: params.professionalId,
      p_canonical_name: params.canonicalName ?? null,
      p_phone_number: params.phoneNumber ?? null,
      p_company: params.company ?? null,
      p_relationship_note: params.relationshipNote ?? null,
    })
    .single();
  if (error || !data) throw new Error(`correct_professional_contact_memory falhou: ${error?.message ?? 'sem dado'}`);
  return mapRow(data as RawRow);
}

// Exclusão FÍSICA real (Decisão 2, ADR 0004) — nunca soft-revoke.
// Devolve false (nunca lança) quando o id não existe ou pertence a
// outro profissional — nunca revela a diferença entre os dois casos.
export async function deleteProfessionalContactMemory(supabase: AnySupabaseClient, params: { id: string; professionalId: string }): Promise<boolean> {
  const { data, error } = await supabase.rpc('delete_professional_contact_memory', {
    p_id: params.id,
    p_professional_id: params.professionalId,
  });
  if (error) throw new Error(`delete_professional_contact_memory falhou: ${error.message}`);
  return Boolean(data);
}
