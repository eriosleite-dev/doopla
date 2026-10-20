import type { SupabaseClient } from '@supabase/supabase-js';

import type { MemoryEvidence, MemoryKind, MemoryStatus, ProfessionalMemory } from '../intelligence/learning/memory-policy';

// Doopla Intelligence Core v1 — ADR 0004, Rodada 4/5 (15/10/2026):
// wrappers finos sobre professional_memories (migration 0119) —
// persistência pra learning/memory-policy.ts (puro, já testado).
// Mesmo padrão de professional-contact-memories.ts: nenhuma lógica de
// negócio aqui, só tipar/mapear a chamada RPC. Toda decisão (o que é
// válido, quem pode revisar, quando uma memória nasce/transiciona)
// continua vivendo e sendo testada só em memory-policy.ts — estas
// functions nunca reimplementam essa lógica, só persistem o objeto que
// ela já validou/construiu.
//
// Fluxo pretendido de uso (wiring real fora desta fundação): chamar
// proposeMemory/reviewMemory/revokeMemory (memory-policy.ts, puro)
// primeiro para validar e construir o próximo estado, só então chamar
// o wrapper correspondente aqui para persistir esse exato resultado —
// nunca o contrário (nunca construir o objeto a partir do retorno da
// RPC achando que é "a fonte da verdade" da regra de negócio).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any>;

type RawRow = {
  id: string;
  professional_id: string;
  kind: MemoryKind;
  value: string;
  evidence: MemoryEvidence;
  confidence: number;
  status: MemoryStatus;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  expires_at: string | null;
  // Task #76 (migration 0126) — opcional na linha real (coluna
  // nullable); ausente só é possível se alguém ler uma linha
  // persistida ANTES da migration rodar, nunca em uso normal daqui
  // pra frente.
  subject_key: string | null;
};

function mapRow(row: RawRow): ProfessionalMemory {
  return {
    id: row.id,
    professionalId: row.professional_id,
    kind: row.kind,
    value: row.value,
    evidence: row.evidence,
    confidence: row.confidence,
    status: row.status,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
    expiresAt: row.expires_at,
    subjectKey: row.subject_key ?? null,
  };
}

// Persiste o resultado de proposeMemory (memory-policy.ts) — nunca
// chamado direto com input bruto não validado. Sempre nasce
// status='proposed' (forçado na migration, nunca aceita como
// parâmetro).
export async function persistProposedMemory(supabase: AnySupabaseClient, memory: ProfessionalMemory): Promise<ProfessionalMemory> {
  const { data, error } = await supabase
    .rpc('propose_professional_memory', {
      p_id: memory.id,
      p_professional_id: memory.professionalId,
      p_kind: memory.kind,
      p_value: memory.value,
      p_evidence: memory.evidence,
      p_confidence: memory.confidence,
      p_created_at: memory.createdAt,
      p_expires_at: memory.expiresAt,
      p_subject_key: memory.subjectKey,
    })
    .single();
  if (error || !data) throw new Error(`propose_professional_memory falhou: ${error?.message ?? 'sem dado'}`);
  return mapRow(data as RawRow);
}

// Persiste o resultado de reviewMemory (memory-policy.ts) — guarda
// atômica de estado vive na migration (WHERE status='proposed'), nunca
// aqui. Lança se a linha não existir, não pertencer a quem revisou, ou
// já ter saído de 'proposed' (perdeu a corrida pra outra revisão
// concorrente) — nunca falha silenciosamente.
export async function persistMemoryReview(
  supabase: AnySupabaseClient,
  params: { id: string; reviewerId: string; decision: 'approved' | 'rejected'; reviewedAt: string }
): Promise<ProfessionalMemory> {
  const { data, error } = await supabase
    .rpc('review_professional_memory', {
      p_id: params.id,
      p_reviewer_id: params.reviewerId,
      p_decision: params.decision,
      p_reviewed_at: params.reviewedAt,
    })
    .single();
  if (error || !data) throw new Error(`review_professional_memory falhou: ${error?.message ?? 'sem dado'}`);
  return mapRow(data as RawRow);
}

// Persiste o resultado de revokeMemory (memory-policy.ts) — nunca
// apaga fisicamente (dado da própria profissional, trilha de auditoria
// aceitável, mesmo princípio de revokeMemory).
export async function persistMemoryRevocation(supabase: AnySupabaseClient, params: { id: string; revokedBy: string; revokedAt: string }): Promise<ProfessionalMemory> {
  const { data, error } = await supabase
    .rpc('revoke_professional_memory', {
      p_id: params.id,
      p_revoked_by: params.revokedBy,
      p_revoked_at: params.revokedAt,
    })
    .single();
  if (error || !data) throw new Error(`revoke_professional_memory falhou: ${error?.message ?? 'sem dado'}`);
  return mapRow(data as RawRow);
}

// Único ponto de leitura pro futuro Context Builder (wiring fora desta
// fundação). Devolve só memórias 'approved' — dedup/expiração/limite
// continuam só em selectContextMemories (memory-policy.ts, já
// testado), nunca duplicados aqui: quem chamar isto deve sempre passar
// o resultado por selectContextMemories antes de usar no prompt.
export async function listApprovedProfessionalMemories(supabase: AnySupabaseClient, professionalId: string): Promise<ProfessionalMemory[]> {
  const { data, error } = await supabase.rpc('list_approved_professional_memories', { p_professional_id: professionalId });
  if (error) throw new Error(`list_approved_professional_memories falhou: ${error.message}`);
  return ((data as RawRow[] | null) ?? []).map(mapRow);
}

// Task #72 (migration 0125) — leitura pro fluxo de confirmação em
// pipeline.ts. Devolve null quando não há nenhuma proposta pendente
// (estado normal, nunca erro). Quem chama NUNCA deve tratar o
// resultado como "confirmação pendente relevante" sem primeiro
// verificar que a última mensagem de IA da conversa é literalmente
// buildMemoryConfirmationQuestion(resultado.value) — ver comentário da
// function SQL.
export async function getMostRecentProposedMemory(supabase: AnySupabaseClient, professionalId: string): Promise<ProfessionalMemory | null> {
  const { data, error } = await supabase.rpc('get_most_recent_proposed_memory', { p_professional_id: professionalId }).maybeSingle();
  if (error) throw new Error(`get_most_recent_proposed_memory falhou: ${error.message}`);
  if (!data) return null;
  return mapRow(data as RawRow);
}
