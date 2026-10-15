import { describe, expect, it } from 'vitest';

import {
  proposeMemory,
  reviewMemory,
  revokeMemory,
  selectContextMemories,
  MAX_CONTEXT_MEMORIES,
  MAX_MEMORY_VALUE_CHARS,
  type ProfessionalMemory,
} from './memory-policy';

// Doopla — Fundação de Memória Profissional (Etapa B, Head of AI +
// Principal AI Engineer, 15/10/2026). Módulo isolado, sem Supabase —
// todos os testes operam em memória, nunca contra um banco real.

const NOW = new Date('2026-10-15T12:00:00Z');

function propose(overrides: Partial<Parameters<typeof proposeMemory>[0]> = {}) {
  return proposeMemory({
    professionalId: 'prof-1',
    kind: 'communication_style',
    value: 'Prefere respostas diretas, sem rodeios',
    evidence: { sourceType: 'professional_message', sourceId: 'msg-1' },
    confidence: 0.8,
    now: NOW,
    ...overrides,
  });
}

describe('proposeMemory', () => {
  it('cria sempre com status "proposed", nunca aprovada de origem', () => {
    const result = propose();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.memory.status).toBe('proposed');
  });

  it('evidência client_message nunca produz uma memória já aprovada, mesmo com confiança máxima', () => {
    const result = propose({ evidence: { sourceType: 'client_message', sourceId: 'msg-cliente-1' }, confidence: 1 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.memory.status).toBe('proposed'); // nunca pula pra approved
  });

  it('rejeita professionalId vazio', () => {
    const result = propose({ professionalId: '' });
    expect(result).toEqual({ ok: false, reason: 'invalid_professional_id' });
  });

  it('rejeita kind fora do vocabulário fechado', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = propose({ kind: 'nao_existe' as any });
    expect(result).toEqual({ ok: false, reason: 'invalid_kind' });
  });

  it('rejeita evidence.sourceType fora do vocabulário fechado', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = propose({ evidence: { sourceType: 'rumor' as any, sourceId: 'x' } });
    expect(result).toEqual({ ok: false, reason: 'invalid_evidence_source_type' });
  });

  it('rejeita evidence.sourceId vazio', () => {
    const result = propose({ evidence: { sourceType: 'professional_message', sourceId: '  ' } });
    expect(result).toEqual({ ok: false, reason: 'invalid_evidence_source_id' });
  });

  it('rejeita valor vazio (só espaço)', () => {
    const result = propose({ value: '   ' });
    expect(result).toEqual({ ok: false, reason: 'empty_value' });
  });

  it(`aceita valor com exatamente ${MAX_MEMORY_VALUE_CHARS} caracteres (limite inclusive)`, () => {
    const result = propose({ value: 'x'.repeat(MAX_MEMORY_VALUE_CHARS) });
    expect(result.ok).toBe(true);
  });

  it(`rejeita valor com ${MAX_MEMORY_VALUE_CHARS + 1} caracteres (nunca trunca silenciosamente)`, () => {
    const result = propose({ value: 'x'.repeat(MAX_MEMORY_VALUE_CHARS + 1) });
    expect(result).toEqual({ ok: false, reason: 'value_too_long' });
  });

  it('rejeita confidence fora de [0,1]', () => {
    expect(propose({ confidence: -0.1 })).toEqual({ ok: false, reason: 'invalid_confidence' });
    expect(propose({ confidence: 1.1 })).toEqual({ ok: false, reason: 'invalid_confidence' });
    expect(propose({ confidence: Number.NaN })).toEqual({ ok: false, reason: 'invalid_confidence' });
  });

  it('rejeita expiresAt com data inválida (requisito explícito: "datas inválidas")', () => {
    const result = propose({ expiresAt: 'não-é-uma-data' });
    expect(result).toEqual({ ok: false, reason: 'invalid_expires_at' });
  });

  it('rejeita expiresAt no passado em relação a "now"', () => {
    const result = propose({ expiresAt: '2026-01-01T00:00:00Z', now: NOW });
    expect(result).toEqual({ ok: false, reason: 'expires_at_in_the_past' });
  });

  it('aceita expiresAt null (nunca expira) e aceita omitido (mesmo resultado)', () => {
    const withNull = propose({ expiresAt: null });
    const omitted = propose({});
    expect(withNull.ok && withNull.memory.expiresAt).toBeNull();
    expect(omitted.ok && omitted.memory.expiresAt).toBeNull();
  });

  it('gera id determinístico quando fornecido (testabilidade), aleatório quando omitido', () => {
    const withId = propose({ id: 'fixed-id-1' });
    expect(withId.ok && withId.memory.id).toBe('fixed-id-1');

    const a = propose({});
    const b = propose({});
    expect(a.ok && b.ok && a.memory.id).not.toBe(b.ok && b.memory.id);
  });
});

describe('reviewMemory', () => {
  function proposedMemory(overrides: Partial<ProfessionalMemory> = {}): ProfessionalMemory {
    const result = propose(overrides as never);
    if (!result.ok) throw new Error('fixture inválida');
    return result.memory;
  }

  it('aprova uma proposta quando o reviewerId é o dono (isolamento de identidade)', () => {
    const memory = proposedMemory();
    const result = reviewMemory({ memory, reviewerId: 'prof-1', decision: 'approved', now: NOW });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.memory.status).toBe('approved');
      expect(result.memory.reviewedBy).toBe('prof-1');
      expect(result.memory.reviewedAt).toBe(NOW.toISOString());
    }
  });

  it('rejeita uma proposta quando o reviewerId é o dono e a decisão é "rejected"', () => {
    const memory = proposedMemory();
    const result = reviewMemory({ memory, reviewerId: 'prof-1', decision: 'rejected', now: NOW });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.memory.status).toBe('rejected');
  });

  it('tentativa de revisão por quem NÃO é o profissional dono -> reviewer_not_authorized (requisito: "tentativas de recuperar memória não autorizada")', () => {
    const memory = proposedMemory({ professionalId: 'prof-1' } as never);
    const result = reviewMemory({ memory, reviewerId: 'prof-2-intruso', decision: 'approved', now: NOW });
    expect(result).toEqual({ ok: false, reason: 'reviewer_not_authorized' });
  });

  it('cliente nunca pode revisar sua própria evidência (reviewerId precisa ser o professionalId, nunca o sourceId da evidência)', () => {
    const memory = proposedMemory({ evidence: { sourceType: 'client_message', sourceId: 'cliente-123' } } as never);
    const result = reviewMemory({ memory, reviewerId: 'cliente-123', decision: 'approved', now: NOW });
    expect(result).toEqual({ ok: false, reason: 'reviewer_not_authorized' });
  });

  it('não pode revisar uma memória que já não está "proposed" (aprovação indevida/dupla)', () => {
    const memory = proposedMemory();
    const first = reviewMemory({ memory, reviewerId: 'prof-1', decision: 'approved', now: NOW });
    if (!first.ok) throw new Error('setup falhou');
    const second = reviewMemory({ memory: first.memory, reviewerId: 'prof-1', decision: 'approved', now: NOW });
    expect(second).toEqual({ ok: false, reason: 'not_proposed' });
  });
});

describe('revokeMemory', () => {
  function approvedMemory(overrides: Partial<ProfessionalMemory> = {}): ProfessionalMemory {
    const proposed = propose(overrides as never);
    if (!proposed.ok) throw new Error('fixture inválida');
    const approved = reviewMemory({ memory: proposed.memory, reviewerId: proposed.memory.professionalId, decision: 'approved', now: NOW });
    if (!approved.ok) throw new Error('fixture inválida');
    return approved.memory;
  }

  it('revoga uma memória aprovada', () => {
    const memory = approvedMemory();
    const result = revokeMemory({ memory, revokedBy: 'prof-1', now: NOW });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.memory.status).toBe('revoked');
  });

  it('uma memória revogada NUNCA volta ao contexto (requisito explícito)', () => {
    const memory = approvedMemory();
    const revoked = revokeMemory({ memory, revokedBy: 'prof-1', now: NOW });
    if (!revoked.ok) throw new Error('setup falhou');
    const selected = selectContextMemories([revoked.memory], { professionalId: 'prof-1', now: NOW });
    expect(selected).toEqual([]);
  });

  it('não pode revogar uma proposta ainda não aprovada', () => {
    const proposed = propose();
    if (!proposed.ok) throw new Error('setup falhou');
    const result = revokeMemory({ memory: proposed.memory, revokedBy: 'prof-1', now: NOW });
    expect(result).toEqual({ ok: false, reason: 'not_approved' });
  });

  it('não pode revogar uma memória já rejeitada', () => {
    const proposed = propose();
    if (!proposed.ok) throw new Error('setup falhou');
    const rejected = reviewMemory({ memory: proposed.memory, reviewerId: 'prof-1', decision: 'rejected', now: NOW });
    if (!rejected.ok) throw new Error('setup falhou');
    const result = revokeMemory({ memory: rejected.memory, revokedBy: 'prof-1', now: NOW });
    expect(result).toEqual({ ok: false, reason: 'not_approved' });
  });

  it('tentativa de revogação por quem não é o dono -> reviewer_not_authorized', () => {
    const memory = approvedMemory();
    const result = revokeMemory({ memory, revokedBy: 'prof-2-intruso', now: NOW });
    expect(result).toEqual({ ok: false, reason: 'reviewer_not_authorized' });
  });
});

describe('selectContextMemories', () => {
  function approved(id: string, overrides: Partial<Parameters<typeof proposeMemory>[0]> = {}): ProfessionalMemory {
    const proposed = proposeMemory({
      id,
      professionalId: 'prof-1',
      kind: 'communication_style',
      value: `valor-${id}`,
      evidence: { sourceType: 'professional_message', sourceId: 'msg-1' },
      confidence: 0.9,
      now: NOW,
      ...overrides,
    });
    if (!proposed.ok) throw new Error('fixture inválida');
    const approvedResult = reviewMemory({ memory: proposed.memory, reviewerId: proposed.memory.professionalId, decision: 'approved', now: NOW });
    if (!approvedResult.ok) throw new Error('fixture inválida');
    return approvedResult.memory;
  }

  it('seleciona só memórias approved (nunca proposed/rejected/revoked)', () => {
    const proposedOnly = proposeMemory({
      id: 'm-proposed',
      professionalId: 'prof-1',
      kind: 'communication_style',
      value: 'nunca deveria aparecer',
      evidence: { sourceType: 'professional_message', sourceId: 'x' },
      confidence: 0.5,
      now: NOW,
    });
    if (!proposedOnly.ok) throw new Error('setup falhou');
    const ok = approved('m-approved');
    const selected = selectContextMemories([proposedOnly.memory, ok], { professionalId: 'prof-1', now: NOW });
    expect(selected.map((m) => m.id)).toEqual(['m-approved']);
  });

  it('isolamento de profissionais: nunca devolve memória de outro professionalId (tentativa de recuperar memória não autorizada)', () => {
    const mine = approved('m-mine', { professionalId: 'prof-1' });
    const other = approved('m-other', { professionalId: 'prof-OUTRO' });
    const selected = selectContextMemories([mine, other], { professionalId: 'prof-1', now: NOW });
    expect(selected.map((m) => m.id)).toEqual(['m-mine']);
  });

  it('exclui memórias expiradas', () => {
    const expiring = approved('m-expiring', { expiresAt: '2026-10-16T00:00:00Z' });
    const afterExpiry = new Date('2026-10-17T00:00:00Z');
    const selected = selectContextMemories([expiring], { professionalId: 'prof-1', now: afterExpiry });
    expect(selected).toEqual([]);
  });

  it('memória sem expiresAt (null) nunca expira', () => {
    const forever = approved('m-forever', { expiresAt: null });
    const muchLater = new Date('2030-01-01T00:00:00Z');
    const selected = selectContextMemories([forever], { professionalId: 'prof-1', now: muchLater });
    expect(selected.map((m) => m.id)).toEqual(['m-forever']);
  });

  it('toda memória retornada tem contextOnly:true (nunca autorização, requisito explícito)', () => {
    const ok = approved('m-1');
    const selected = selectContextMemories([ok], { professionalId: 'prof-1', now: NOW });
    expect(selected[0].contextOnly).toBe(true);
  });

  it('deduplicação determinística: mesmo (kind, valor normalizado) conta só uma vez, mantém a mais recente', () => {
    const older = proposeMemory({
      id: 'm-older',
      professionalId: 'prof-1',
      kind: 'commercial_preference',
      value: 'Prefere pagamento via Pix',
      evidence: { sourceType: 'professional_message', sourceId: 'x' },
      confidence: 0.7,
      now: new Date('2026-10-10T00:00:00Z'),
    });
    const newer = proposeMemory({
      id: 'm-newer',
      professionalId: 'prof-1',
      kind: 'commercial_preference',
      value: '  prefere pagamento via pix  ', // mesmo valor, espaço/maiúscula diferente
      evidence: { sourceType: 'professional_message', sourceId: 'y' },
      confidence: 0.9,
      now: new Date('2026-10-14T00:00:00Z'),
    });
    if (!older.ok || !newer.ok) throw new Error('setup falhou');
    const olderApproved = reviewMemory({ memory: older.memory, reviewerId: 'prof-1', decision: 'approved', now: NOW });
    const newerApproved = reviewMemory({ memory: newer.memory, reviewerId: 'prof-1', decision: 'approved', now: NOW });
    if (!olderApproved.ok || !newerApproved.ok) throw new Error('setup falhou');

    const selected = selectContextMemories([olderApproved.memory, newerApproved.memory], { professionalId: 'prof-1', now: NOW });
    expect(selected).toHaveLength(1);
    expect(selected[0].id).toBe('m-newer');
  });

  it(`respeita o limite de ${MAX_CONTEXT_MEMORIES} por recuperação (default)`, () => {
    const many = Array.from({ length: MAX_CONTEXT_MEMORIES + 5 }, (_, i) =>
      approved(`m-${i}`, { value: `valor único número ${i}`, now: new Date(NOW.getTime() + i * 1000) })
    );
    const selected = selectContextMemories(many, { professionalId: 'prof-1', now: NOW });
    expect(selected).toHaveLength(MAX_CONTEXT_MEMORIES);
  });

  it('limite customizado via params.limit', () => {
    const many = Array.from({ length: 5 }, (_, i) => approved(`m-${i}`, { value: `valor único número ${i}` }));
    const selected = selectContextMemories(many, { professionalId: 'prof-1', now: NOW, limit: 2 });
    expect(selected).toHaveLength(2);
  });

  it('ordenação previsível: mais recente primeiro, desempate por id quando createdAt empata', () => {
    const sameTimestamp = [
      approved('m-b', { value: 'valor único b', now: NOW }),
      approved('m-a', { value: 'valor único a', now: NOW }),
    ];
    const selected = selectContextMemories(sameTimestamp, { professionalId: 'prof-1', now: NOW });
    // Mesmo createdAt -> desempate determinístico por id ascendente.
    expect(selected.map((m) => m.id)).toEqual(['m-a', 'm-b']);
  });

  it('array de memórias vazio -> seleção vazia, nunca lança', () => {
    const selected = selectContextMemories([], { professionalId: 'prof-1', now: NOW });
    expect(selected).toEqual([]);
  });
});
