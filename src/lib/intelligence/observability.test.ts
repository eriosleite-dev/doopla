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

  it('DIAGNÓSTICO (Etapa 2, 15/10/2026): o timeout nunca CANCELA a RPC, só para de ESPERAR por ela — a chamada real continua rodando em segundo plano até terminar sozinha', async () => {
    vi.useFakeTimers();
    try {
      let backgroundCompletedAt: number | null = null;
      const start = Date.now();
      const supabase = fakeSupabase(
        () =>
          new Promise((resolve) => {
            // RPC real que demora 8s pra responder — mais lenta que o
            // timeout de 5s, mas NÃO travada pra sempre (diferente do
            // teste acima). Simula uma RPC "só lenta", não "morta".
            setTimeout(() => {
              backgroundCompletedAt = Date.now() - start;
              resolve({ data: { id: 'evt-tarde-demais' }, error: null });
            }, 8000);
          })
      );

      const promise = logAiUsageEvent(supabase, BASE_PARAMS);
      await vi.advanceTimersByTimeAsync(5000);
      const result = await promise;

      // logAiUsageEvent já devolveu (via timeout) — e a chamada real
      // ainda não terminou, continua pendurada em segundo plano.
      expect(result).toEqual({ ok: false, error: 'timeout após 5000ms' });
      expect(backgroundCompletedAt).toBeNull();

      // Avança mais 3s (total 8s) — prova que a RPC original SEMPRE
      // ia terminar sozinha, consumindo conexão/recurso até lá, sem
      // que nenhum código nosso jamais a interrompesse.
      await vi.advanceTimersByTimeAsync(3000);
      expect(backgroundCompletedAt).toBe(8000);
    } finally {
      vi.useRealTimers();
    }
  });

  it('DIAGNÓSTICO (Etapa 2, 15/10/2026): chamadas sequenciais SOMAM atraso, nunca se sobrepõem — um ciclo real com N pontos de IA trava até N × 5s no pior caso', async () => {
    vi.useFakeTimers();
    try {
      const supabase = fakeSupabase(() => new Promise(() => {})); // sempre trava, como as outras RPCs do mesmo ciclo travariam juntas
      const start = Date.now();

      // Reproduz o padrão REAL do Runtime: await síncrono, uma chamada
      // depois da outra (classify -> inbound-proposal -> plan ->
      // approval -> policy-gate, e cada reply pendente destravado por
      // uma aprovação repete classify+plan de novo) — nunca em
      // paralelo.
      const callCount = 3; // ex.: classify + inbound-proposal + plan, sem nem contar approval/gate/resumption
      for (let i = 0; i < callCount; i++) {
        const promise = logAiUsageEvent(supabase, BASE_PARAMS);
        await vi.advanceTimersByTimeAsync(5000);
        await promise;
      }

      expect(Date.now() - start).toBe(callCount * 5000);
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
