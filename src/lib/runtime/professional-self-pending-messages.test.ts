import { beforeEach, describe, expect, it, vi } from 'vitest';

// Doopla — fila persistida de professional_self (P0 14/10/2026,
// revisão 2). Cobre a ORQUESTRAÇÃO em TS (drainProfessionalSelfPendingMessages:
// ordem, parada em busy, reconciliação de duplicate_event, backoff,
// zeragem de corpo em completed) contra um fake que replica fielmente
// a semântica das RPCs da migration 0108 — não um mock raso de
// resposta única, porque o comportamento sob testar É a sequência de
// chamadas (enqueue -> claim -> finish, várias linhas). A garantia de
// concorrência real (exclusão mútua por profissional sob chamadas
// verdadeiramente paralelas) é validada à parte com PostgreSQL real
// (ver relatório), nunca aqui.

const triggerInboundMessage = vi.fn();
vi.mock('@/lib/beta-integration/trigger', () => ({
  triggerInboundMessage: (...args: unknown[]) => triggerInboundMessage(...args),
}));

type Row = {
  id: string;
  represented_professional_id: string;
  conversation_id: string;
  provider_message_id: string;
  body: string | null;
  provider_timestamp: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: string | null;
  lease_expires_at: string | null;
  conversation_message_id: string | null;
  error: string | null;
  created_at: string;
};

type InboundEventRow = { processing_status: string; conversation_message_id: string | null; lease_expires_at: string };

let seq = 0;

// Fake Supabase que replica a semântica das 7 RPCs/leituras da
// migration 0108 — suficiente pra exercitar a orquestração real do
// módulo (várias linhas, várias chamadas em sequência), nunca a
// atomicidade sob concorrência de verdade (for update skip locked/
// advisory lock), que só PostgreSQL real prova.
class FakeQueueDb {
  rows: Row[] = [];
  drainLease: { token: string; expiresAt: number } | null = null;
  inboundEvents = new Map<string, InboundEventRow>();

  seedInboundEvent(providerMessageId: string, row: InboundEventRow) {
    this.inboundEvents.set(providerMessageId, row);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase(): any {
    return {
      rpc: (fn: string, args: Record<string, unknown>) => {
        const result = this.handleRpc(fn, args);
        return {
          single: async () => ({ data: result, error: null }),
          maybeSingle: async () => ({ data: result, error: null }),
          then: (resolve: (v: unknown) => void) => Promise.resolve({ data: result, error: null }).then(resolve),
        };
      },
      from: (table: string) => {
        if (table === 'inbound_events') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => {
                    const args = (this as { __lastInboundLookup?: string }).__lastInboundLookup;
                    return { data: args ? this.inboundEvents.get(args) ?? null : null };
                  },
                }),
              }),
            }),
          };
        }
        if (table === 'professional_self_pending_messages') {
          return {
            select: () => ({
              eq: (_col: string, id: string) => ({
                maybeSingle: async () => ({ data: this.rows.find((r) => r.id === id) ? { status: this.rows.find((r) => r.id === id)!.status } : null }),
              }),
            }),
          };
        }
        throw new Error(`fake queue db: tabela não configurada: ${table}`);
      },
    };
  }

  private handleRpc(fn: string, args: Record<string, unknown>): unknown {
    switch (fn) {
      case 'enqueue_professional_self_pending_message': {
        const providerMessageId = args.p_provider_message_id as string;
        const existing = this.rows.find((r) => r.provider_message_id === providerMessageId);
        if (existing) return existing;
        const row: Row = {
          id: `row-${++seq}`,
          represented_professional_id: args.p_professional_id as string,
          conversation_id: args.p_conversation_id as string,
          provider_message_id: providerMessageId,
          body: args.p_body as string,
          provider_timestamp: (args.p_provider_timestamp as string | null) ?? null,
          status: 'pending',
          attempt_count: 0,
          max_attempts: 5,
          next_attempt_at: null,
          lease_expires_at: null,
          conversation_message_id: null,
          error: null,
          created_at: new Date(Date.now() + seq).toISOString(), // ordem de inserção estável
        };
        this.rows.push(row);
        return row;
      }
      case 'claim_next_professional_self_pending_message': {
        const professionalId = args.p_professional_id as string;
        const now = Date.now();
        const eligible = this.rows
          .filter(
            (r) =>
              r.represented_professional_id === professionalId &&
              ((r.status === 'pending' && (!r.next_attempt_at || new Date(r.next_attempt_at).getTime() <= now)) ||
                (r.status === 'processing' && r.lease_expires_at !== null && new Date(r.lease_expires_at).getTime() < now))
          )
          .sort((a, b) => new Date(a.provider_timestamp ?? a.created_at).getTime() - new Date(b.provider_timestamp ?? b.created_at).getTime());
        const row = eligible[0];
        if (!row) return null;
        row.status = 'processing';
        row.attempt_count += 1;
        row.lease_expires_at = new Date(now + 180_000).toISOString();
        return row;
      }
      case 'finish_professional_self_pending_message': {
        const row = this.rows.find((r) => r.id === args.p_id);
        if (!row) return null;
        const status = args.p_status as 'completed' | 'pending' | 'failed';
        if (status === 'completed') {
          row.status = 'completed';
          row.conversation_message_id = (args.p_conversation_message_id as string | null) ?? row.conversation_message_id;
          row.body = null;
          row.error = null;
        } else if (status === 'failed') {
          row.status = 'failed';
          row.error = (args.p_error as string | null) ?? null;
        } else {
          row.status = 'pending';
          row.error = (args.p_error as string | null) ?? null;
          const nextSeconds = args.p_next_attempt_seconds as number | null;
          row.next_attempt_at = nextSeconds ? new Date(Date.now() + nextSeconds * 1000).toISOString() : null;
        }
        return row;
      }
      case 'acquire_professional_self_drain_lease': {
        const now = Date.now();
        if (this.drainLease && this.drainLease.expiresAt > now) {
          return { granted: false, lease_token: null };
        }
        const token = `lease-${++seq}`;
        this.drainLease = { token, expiresAt: now + ((args.p_lease_seconds as number) ?? 60) * 1000 };
        return { granted: true, lease_token: token };
      }
      case 'release_professional_self_drain_lease': {
        if (this.drainLease && this.drainLease.token === args.p_lease_token) this.drainLease = null;
        return true;
      }
      default:
        throw new Error(`fake queue db: rpc não configurada: ${fn}`);
    }
  }
}

// A leitura de inbound_events no fake acima é simplificada (não
// encadeia eq/eq de verdade por chave) — substituída por um hook
// direto, já que o que queremos validar é a DECISÃO tomada a partir do
// estado de inbound_events, não a sintaxe do query builder (essa já
// tem cobertura própria nos outros arquivos de teste do projeto).
function supabaseWithInboundEventLookup(db: FakeQueueDb) {
  const base = db.supabase();
  return {
    ...base,
    from: (table: string) => {
      if (table === 'inbound_events') {
        return {
          select: () => ({
            eq: () => ({
              eq: (_col: string, providerMessageId: string) => ({
                maybeSingle: async () => ({ data: db.inboundEvents.get(providerMessageId) ?? null }),
              }),
            }),
          }),
        };
      }
      return base.from(table);
    },
  };
}

describe('drainProfessionalSelfPendingMessages', () => {
  beforeEach(() => {
    triggerInboundMessage.mockReset();
    seq = 0;
  });

  it('processa a linha mais antiga por provider_timestamp primeiro, mesmo inserida depois', async () => {
    const { enqueueProfessionalSelfPendingMessage, drainProfessionalSelfPendingMessages } = await import('./professional-self-pending-messages');
    const db = new FakeQueueDb();
    const supabase = supabaseWithInboundEventLookup(db);

    // B inserida primeiro mas com timestamp MAIS NOVO; A inserida
    // depois mas com timestamp mais antigo — a ordem real de envio (A
    // antes de B) deve vencer, nunca a ordem de inserção na fila.
    await enqueueProfessionalSelfPendingMessage(supabase, {
      professionalId: 'eduarda',
      conversationId: 'conv-1',
      providerMessageId: 'wamid.b',
      body: 'Sim',
      providerTimestamp: new Date('2026-10-14T10:00:05Z'),
    });
    await enqueueProfessionalSelfPendingMessage(supabase, {
      professionalId: 'eduarda',
      conversationId: 'conv-1',
      providerMessageId: 'wamid.a',
      body: 'Preciso que você fale com o Carlos',
      providerTimestamp: new Date('2026-10-14T10:00:00Z'),
    });

    const processedOrder: string[] = [];
    triggerInboundMessage.mockImplementation(async (args: { providerEventId: string }) => {
      processedOrder.push(args.providerEventId);
      return { kind: 'completed', conversationMessageId: `msg-${args.providerEventId}` };
    });

    const result = await drainProfessionalSelfPendingMessages(supabase, { professionalId: 'eduarda', workerId: 'test' });

    expect(processedOrder).toEqual(['wamid.a', 'wamid.b']);
    expect(result.completedRowIds).toHaveLength(2);
    expect(db.rows.every((r) => r.status === 'completed' && r.body === null)).toBe(true);
  });

  it('para o laço em conversation_busy, nunca pula pra uma linha mais nova', async () => {
    const { enqueueProfessionalSelfPendingMessage, drainProfessionalSelfPendingMessages } = await import('./professional-self-pending-messages');
    const db = new FakeQueueDb();
    const supabase = supabaseWithInboundEventLookup(db);

    const rowA = await enqueueProfessionalSelfPendingMessage(supabase, {
      professionalId: 'eduarda',
      conversationId: 'conv-1',
      providerMessageId: 'wamid.a',
      body: 'Primeira',
      providerTimestamp: new Date('2026-10-14T10:00:00Z'),
    });
    await enqueueProfessionalSelfPendingMessage(supabase, {
      professionalId: 'eduarda',
      conversationId: 'conv-1',
      providerMessageId: 'wamid.b',
      body: 'Segunda',
      providerTimestamp: new Date('2026-10-14T10:00:01Z'),
    });

    triggerInboundMessage.mockResolvedValue({ kind: 'conversation_busy' });

    const result = await drainProfessionalSelfPendingMessages(supabase, { professionalId: 'eduarda', workerId: 'test', watchRowId: rowA.id });

    expect(triggerInboundMessage).toHaveBeenCalledTimes(1);
    expect(triggerInboundMessage).toHaveBeenCalledWith(expect.objectContaining({ providerEventId: 'wamid.a' }));
    expect(result.stoppedReason).toBe('busy');
    expect(result.watchedStatus).toBe('pending');
    expect(db.rows.find((r) => r.provider_message_id === 'wamid.b')!.status).toBe('pending'); // nunca tentada
  });

  it('não roda nada quando outro drain já segura a trava do profissional (serialização)', async () => {
    const { enqueueProfessionalSelfPendingMessage, drainProfessionalSelfPendingMessages } = await import('./professional-self-pending-messages');
    const db = new FakeQueueDb();
    const supabase = supabaseWithInboundEventLookup(db);

    await enqueueProfessionalSelfPendingMessage(supabase, {
      professionalId: 'eduarda',
      conversationId: 'conv-1',
      providerMessageId: 'wamid.a',
      body: 'Primeira',
      providerTimestamp: null,
    });
    db.drainLease = { token: 'outro-worker', expiresAt: Date.now() + 60_000 };

    const result = await drainProfessionalSelfPendingMessages(supabase, { professionalId: 'eduarda', workerId: 'test' });

    expect(triggerInboundMessage).not.toHaveBeenCalled();
    expect(result.stoppedReason).toBe('lease_not_granted');
  });

  it('falha real com tentativas restantes: aplica backoff e para o laço (nunca esgota tentativas em poucos segundos)', async () => {
    const { enqueueProfessionalSelfPendingMessage, drainProfessionalSelfPendingMessages } = await import('./professional-self-pending-messages');
    const db = new FakeQueueDb();
    const supabase = supabaseWithInboundEventLookup(db);

    await enqueueProfessionalSelfPendingMessage(supabase, {
      professionalId: 'eduarda',
      conversationId: 'conv-1',
      providerMessageId: 'wamid.a',
      body: 'Oi',
      providerTimestamp: null,
    });
    triggerInboundMessage.mockResolvedValue({ kind: 'conversation_not_found' });

    await drainProfessionalSelfPendingMessages(supabase, { professionalId: 'eduarda', workerId: 'test' });

    const row = db.rows[0];
    expect(row.status).toBe('pending');
    expect(row.attempt_count).toBe(1);
    expect(row.next_attempt_at).not.toBeNull();
    expect(new Date(row.next_attempt_at!).getTime()).toBeGreaterThan(Date.now()); // backoff real, não reelegível na hora

    // Um 2º drain imediato (ex.: profissional manda outra mensagem 1s
    // depois) NÃO retenta — o backoff ainda não passou.
    const secondDrain = await drainProfessionalSelfPendingMessages(supabase, { professionalId: 'eduarda', workerId: 'test' });
    expect(triggerInboundMessage).toHaveBeenCalledTimes(1); // nunca uma 2ª chamada antes do backoff vencer
    expect(secondDrain.stoppedReason).toBe('empty');
  });

  it('falha real esgotando max_attempts: marca failed (terminal) e segue pra próxima linha', async () => {
    const { enqueueProfessionalSelfPendingMessage, drainProfessionalSelfPendingMessages } = await import('./professional-self-pending-messages');
    const db = new FakeQueueDb();
    const supabase = supabaseWithInboundEventLookup(db);

    const row = await enqueueProfessionalSelfPendingMessage(supabase, {
      professionalId: 'eduarda',
      conversationId: 'conv-1',
      providerMessageId: 'wamid.a',
      body: 'Oi',
      providerTimestamp: null,
    });
    db.rows.find((r) => r.id === row.id)!.attempt_count = 4; // já tentou 4x, max_attempts=5 — esta é a última
    await enqueueProfessionalSelfPendingMessage(supabase, {
      professionalId: 'eduarda',
      conversationId: 'conv-1',
      providerMessageId: 'wamid.b',
      body: 'Depois dessa',
      providerTimestamp: new Date('2026-10-14T10:00:01Z'),
    });

    triggerInboundMessage.mockImplementation(async (args: { providerEventId: string }) => {
      if (args.providerEventId === 'wamid.a') return { kind: 'conversation_not_found' };
      return { kind: 'completed', conversationMessageId: 'msg-b' };
    });

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await drainProfessionalSelfPendingMessages(supabase, { professionalId: 'eduarda', workerId: 'test' });

    expect(db.rows.find((r) => r.provider_message_id === 'wamid.a')!.status).toBe('failed');
    // Terminal: segue pra próxima linha em vez de travar a fila inteira.
    expect(db.rows.find((r) => r.provider_message_id === 'wamid.b')!.status).toBe('completed');
    expect(result.completedRowIds).toContain(db.rows.find((r) => r.provider_message_id === 'wamid.b')!.id);
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('tentativas esgotadas'), expect.any(Object));
    consoleError.mockRestore();
  });

  describe('reconciliação de duplicate_event (item C, aprovação 14/10/2026)', () => {
    it('inbound_events processed com conversation_message_id: marca completed de verdade', async () => {
      const { enqueueProfessionalSelfPendingMessage, drainProfessionalSelfPendingMessages } = await import('./professional-self-pending-messages');
      const db = new FakeQueueDb();
      const supabase = supabaseWithInboundEventLookup(db);
      await enqueueProfessionalSelfPendingMessage(supabase, { professionalId: 'eduarda', conversationId: 'conv-1', providerMessageId: 'wamid.a', body: 'Oi', providerTimestamp: null });
      db.seedInboundEvent('wamid.a', { processing_status: 'processed', conversation_message_id: 'msg-real', lease_expires_at: new Date(0).toISOString() });
      triggerInboundMessage.mockResolvedValue({ kind: 'duplicate_event', alreadyProcessed: true });

      await drainProfessionalSelfPendingMessages(supabase, { professionalId: 'eduarda', workerId: 'test' });

      expect(db.rows[0].status).toBe('completed');
      expect(db.rows[0].conversation_message_id).toBe('msg-real');
    });

    it('inbound_events processed SEM conversation_message_id: anomalia, failed imediato (nunca completed sem prova)', async () => {
      const { enqueueProfessionalSelfPendingMessage, drainProfessionalSelfPendingMessages } = await import('./professional-self-pending-messages');
      const db = new FakeQueueDb();
      const supabase = supabaseWithInboundEventLookup(db);
      await enqueueProfessionalSelfPendingMessage(supabase, { professionalId: 'eduarda', conversationId: 'conv-1', providerMessageId: 'wamid.a', body: 'Oi', providerTimestamp: null });
      db.seedInboundEvent('wamid.a', { processing_status: 'processed', conversation_message_id: null, lease_expires_at: new Date(0).toISOString() });
      triggerInboundMessage.mockResolvedValue({ kind: 'duplicate_event', alreadyProcessed: true });

      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      await drainProfessionalSelfPendingMessages(supabase, { professionalId: 'eduarda', workerId: 'test' });
      consoleError.mockRestore();

      expect(db.rows[0].status).toBe('failed');
      expect(db.rows[0].error).toBe('processed_without_message_id');
    });

    it('inbound_events failed: trata como falha real retomável (consome tentativa, aplica backoff)', async () => {
      const { enqueueProfessionalSelfPendingMessage, drainProfessionalSelfPendingMessages } = await import('./professional-self-pending-messages');
      const db = new FakeQueueDb();
      const supabase = supabaseWithInboundEventLookup(db);
      await enqueueProfessionalSelfPendingMessage(supabase, { professionalId: 'eduarda', conversationId: 'conv-1', providerMessageId: 'wamid.a', body: 'Oi', providerTimestamp: null });
      db.seedInboundEvent('wamid.a', { processing_status: 'failed', conversation_message_id: null, lease_expires_at: new Date(0).toISOString() });
      triggerInboundMessage.mockResolvedValue({ kind: 'duplicate_event', alreadyProcessed: false });

      await drainProfessionalSelfPendingMessages(supabase, { professionalId: 'eduarda', workerId: 'test' });

      expect(db.rows[0].status).toBe('pending');
      expect(db.rows[0].next_attempt_at).not.toBeNull();
    });

    it('inbound_events claimed com lease ainda válida: outro worker processando agora — nunca reprocessa em paralelo', async () => {
      const { enqueueProfessionalSelfPendingMessage, drainProfessionalSelfPendingMessages } = await import('./professional-self-pending-messages');
      const db = new FakeQueueDb();
      const supabase = supabaseWithInboundEventLookup(db);
      await enqueueProfessionalSelfPendingMessage(supabase, { professionalId: 'eduarda', conversationId: 'conv-1', providerMessageId: 'wamid.a', body: 'Oi', providerTimestamp: null });
      db.seedInboundEvent('wamid.a', { processing_status: 'claimed', conversation_message_id: null, lease_expires_at: new Date(Date.now() + 60_000).toISOString() });
      triggerInboundMessage.mockResolvedValue({ kind: 'duplicate_event', alreadyProcessed: false });

      const result = await drainProfessionalSelfPendingMessages(supabase, { professionalId: 'eduarda', workerId: 'test' });

      expect(db.rows[0].status).toBe('pending');
      expect(db.rows[0].next_attempt_at).toBeNull(); // sem backoff — não é uma falha, é concorrência normal
      expect(result.stoppedReason).toBe('busy');
    });
  });
});
