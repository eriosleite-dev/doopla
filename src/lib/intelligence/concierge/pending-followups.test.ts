import { describe, expect, it } from 'vitest';

import {
  cancelPendingFollowup,
  closePendingFollowupAsNoResponse,
  createPendingFollowup,
  rescheduleOpenFollowup,
  resolvePendingFollowup,
  selectDuePendingFollowups,
  selectFollowupsToCloseAsNoResponse,
  type PendingFollowup,
} from './pending-followups';

// Doopla — concierge de pendências (16/10/2026, ADR 0006). Mesma
// disciplina de learning/memory-policy.test.ts: módulo 100% puro,
// nenhuma rede/banco, todo teste síncrono e determinístico.

const NOW = new Date('2026-10-20T12:00:00Z');
const FUTURE = '2026-10-21T12:00:00Z';
const PAST = '2026-10-19T12:00:00Z';

function validInput(overrides: Partial<Parameters<typeof createPendingFollowup>[0]> = {}) {
  return {
    professionalId: 'prof-1',
    bookingId: 'booking-1',
    kind: 'proposal_no_response' as const,
    responsibleParty: 'doopla' as const,
    evidence: { sourceType: 'conversation_message' as const, sourceId: 'msg-1' },
    dueAt: FUTURE,
    now: NOW,
    ...overrides,
  };
}

describe('createPendingFollowup', () => {
  it('cria uma pendência válida com status open e attemptCount zero', () => {
    const result = createPendingFollowup(validInput());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.followup.status).toBe('open');
      expect(result.followup.attemptCount).toBe(0);
      expect(result.followup.resolvedAt).toBeNull();
    }
  });

  it('rejeita sem booking nem opportunity — nunca uma pendência solta no ar', () => {
    const result = createPendingFollowup(validInput({ bookingId: null, opportunityId: null }));
    expect(result).toEqual({ ok: false, reason: 'missing_booking_and_opportunity' });
  });

  it('rejeita dueAt no passado', () => {
    const result = createPendingFollowup(validInput({ dueAt: PAST }));
    expect(result).toEqual({ ok: false, reason: 'due_at_in_the_past' });
  });

  it('rejeita kind fora do vocabulário controlado', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = createPendingFollowup(validInput({ kind: 'lembrete_generico' as any }));
    expect(result).toEqual({ ok: false, reason: 'invalid_kind' });
  });

  it('rejeita evidência sem sourceId', () => {
    const result = createPendingFollowup(validInput({ evidence: { sourceType: 'conversation_message', sourceId: '' } }));
    expect(result).toEqual({ ok: false, reason: 'invalid_evidence_source_id' });
  });
});

describe('transições de estado', () => {
  function openFollowup(): PendingFollowup {
    const result = createPendingFollowup(validInput());
    if (!result.ok) throw new Error('fixture inválida');
    return result.followup;
  }

  it('resolvePendingFollowup move open -> resolved com resolvedAt', () => {
    const result = resolvePendingFollowup(openFollowup(), NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.followup.status).toBe('resolved');
      expect(result.followup.resolvedAt).toBe(NOW.toISOString());
    }
  });

  it('closePendingFollowupAsNoResponse move open -> closed_no_response, nunca apaga o registro', () => {
    const result = closePendingFollowupAsNoResponse(openFollowup(), NOW);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.followup.status).toBe('closed_no_response');
  });

  it('cancelPendingFollowup move open -> cancelled', () => {
    const result = cancelPendingFollowup(openFollowup(), NOW);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.followup.status).toBe('cancelled');
  });

  it('nenhuma transição funciona a partir de um status que não é open — nunca reabre nem reprocessa terminal', () => {
    const resolved = resolvePendingFollowup(openFollowup(), NOW);
    if (!resolved.ok) throw new Error('fixture inválida');
    expect(resolvePendingFollowup(resolved.followup)).toEqual({ ok: false, reason: 'not_open' });
    expect(cancelPendingFollowup(resolved.followup)).toEqual({ ok: false, reason: 'not_open' });
    expect(rescheduleOpenFollowup(resolved.followup, FUTURE)).toEqual({ ok: false, reason: 'not_open' });
  });

  it('rescheduleOpenFollowup atualiza dueAt e incrementa attemptCount sempre, nunca silenciosamente', () => {
    const followup = openFollowup();
    const result = rescheduleOpenFollowup(followup, '2026-10-25T12:00:00Z');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.followup.dueAt).toBe('2026-10-25T12:00:00Z');
      expect(result.followup.attemptCount).toBe(1);
    }
  });
});

describe('selectDuePendingFollowups — nunca insiste além do teto, isolamento por profissional sempre primeiro', () => {
  function makeOpen(overrides: Partial<PendingFollowup>): PendingFollowup {
    const base = createPendingFollowup(validInput());
    if (!base.ok) throw new Error('fixture inválida');
    return { ...base.followup, ...overrides };
  }

  it('só devolve pendências vencidas, do profissional certo, dentro do teto de tentativas', () => {
    const due = makeOpen({ id: 'due', professionalId: 'prof-1', dueAt: PAST, attemptCount: 1 });
    const notDueYet = makeOpen({ id: 'not-due', professionalId: 'prof-1', dueAt: FUTURE, attemptCount: 0 });
    const otherProfessional = makeOpen({ id: 'other-prof', professionalId: 'prof-2', dueAt: PAST, attemptCount: 0 });
    const overAttemptCap = makeOpen({ id: 'over-cap', professionalId: 'prof-1', dueAt: PAST, attemptCount: 3 });
    const resolved = { ...due, id: 'resolved', status: 'resolved' as const };

    const result = selectDuePendingFollowups([due, notDueYet, otherProfessional, overAttemptCap, resolved], {
      professionalId: 'prof-1',
      now: NOW,
      maxAttempts: 3,
    });

    expect(result.map((f) => f.id)).toEqual(['due']);
  });

  it('selectFollowupsToCloseAsNoResponse devolve exatamente o complemento (vencidas, teto estourado)', () => {
    const created = createPendingFollowup(validInput());
    if (!created.ok) throw new Error('fixture inválida');
    // dueAt no passado só é alcançado depois de criada (createPendingFollowup
    // sempre rejeita dueAt passado na origem) — simula o relógio andando.
    const overCap = { ...created.followup, id: 'over-cap', dueAt: PAST, attemptCount: 5 };

    const result = selectFollowupsToCloseAsNoResponse([overCap], { professionalId: 'prof-1', now: NOW, maxAttempts: 3 });
    expect(result.map((f) => f.id)).toEqual(['over-cap']);

    const stillWithinCap = selectDuePendingFollowups([overCap], { professionalId: 'prof-1', now: NOW, maxAttempts: 3 });
    expect(stillWithinCap).toEqual([]);
  });
});
