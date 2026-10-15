import { describe, expect, it, vi } from 'vitest';

import { logAiUsageEvent } from './observability';

// Doopla — Head of AI (15/10/2026): logAiUsageEvent é chamada no
// caminho crítico (com await síncrono) de TODO ponto de IA do
// Runtime. "Best-effort" só valia quando a RPC respondia normalmente
// com {error} preenchido — uma Promise REJEITADA de verdade (exceção
// de rede/driver) ou uma chamada travada indefinidamente nunca tinham
// proteção nenhuma, e qualquer uma das duas derrubaria o ciclo
// principal (resposta comercial/WhatsApp) só por causa de telemetria.
// Estes testes provam que, em todos os casos, logAiUsageEvent nunca
// lança e sempre resolve dentro de um tempo limitado.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fakeSupabase(rpcImpl: (...args: any[]) => any): any {
  return { rpc: rpcImpl };
}

const BASE_PARAMS = { feature: 'test_feature', model: 'gpt-5-mini', status: 'success' as const };

describe('logAiUsageEvent — best-effort real', () => {
  it('RPC resolve normalmente com sucesso -> ok:true', async () => {
    const supabase = fakeSupabase(async () => ({ data: { id: 'evt-1' }, error: null }));
    const result = await logAiUsageEvent(supabase, BASE_PARAMS);
    expect(result).toEqual({ ok: true });
  });

  it('RPC resolve com {error} de negócio (ex.: professional_id_required_for_system_caller) -> ok:false, nunca lança', async () => {
    const supabase = fakeSupabase(async () => ({ data: null, error: { message: 'professional_id_required_for_system_caller' } }));
    const result = await logAiUsageEvent(supabase, BASE_PARAMS);
    expect(result).toEqual({ ok: false, error: 'professional_id_required_for_system_caller' });
  });

  it('RPC REJEITA a Promise (exceção de rede/driver real, não só um {error} de negócio) -> ok:false, nunca propaga a exceção', async () => {
    const supabase = fakeSupabase(async () => {
      throw new Error('ECONNRESET');
    });
    await expect(logAiUsageEvent(supabase, BASE_PARAMS)).resolves.toEqual({ ok: false, error: 'ECONNRESET' });
  });

  it('supabase.rpc() lança SÍNCRONO (antes de devolver qualquer Promise) -> ok:false, nunca propaga', async () => {
    const supabase = fakeSupabase(() => {
      throw new Error('erro síncrono inesperado');
    });
    await expect(logAiUsageEvent(supabase, BASE_PARAMS)).resolves.toEqual({ ok: false, error: 'erro síncrono inesperado' });
  });

  it('RPC nunca resolve (trava indefinidamente) -> resolve dentro do timeout, nunca fica pendurado pra sempre', async () => {
    vi.useFakeTimers();
    try {
      const supabase = fakeSupabase(() => new Promise(() => {})); // nunca resolve, nunca rejeita
      const promise = logAiUsageEvent(supabase, BASE_PARAMS);
      await vi.advanceTimersByTimeAsync(5000);
      const result = await promise;
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/timeout/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejeição que não é instância de Error (ex.: string/objeto lançado) ainda vira um {ok:false, error:string}, nunca quebra', async () => {
    const supabase = fakeSupabase(async () => {
      // Teste deliberado de rejeição não-Error (sem disable necessário — nenhuma regra ativa neste projeto proíbe throw de literal).
      throw 'string literal lançada, não um Error';
    });
    const result = await logAiUsageEvent(supabase, BASE_PARAMS);
    expect(result.ok).toBe(false);
  });
});
