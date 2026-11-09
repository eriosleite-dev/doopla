// Doopla Intelligence Core v1 — Bloco 5: espelho puro (sem I/O) da
// matemática do token bucket implementada de verdade em SQL
// (reserve_approval_dispatch_token, migration 0045). A execução real
// SEMPRE acontece no banco (linha travada via `for update`, atômica
// com a revalidação de lease) — este módulo existe só pra permitir
// testar/documentar a fórmula sem depender de Postgres, e pro
// orquestrador (TS) poder prever elegibilidade antes de gastar uma
// viagem ao banco. Nunca é usado como fonte de verdade de estado.
//
// Propriedade formal (V3.7): pra qualquer intervalo de duração T,
// N(T) <= C + r*T (burst instantâneo de C, mais taxa sustentada r).
// Tempo máximo até haver >=1 token quando o bucket está vazio: 1/r —
// propriedade distinta, não confundir com a anterior.

export type TokenBucketState = {
  tokens: number;
  lastRefillAt: Date;
};

export function refillTokenBucket(state: TokenBucketState, now: Date, capacity: number, refillPeriodSeconds: number): TokenBucketState {
  const elapsedSeconds = Math.max(0, (now.getTime() - state.lastRefillAt.getTime()) / 1000);
  const refillRate = capacity / refillPeriodSeconds;
  const tokens = Math.min(capacity, state.tokens + elapsedSeconds * refillRate);
  return { tokens, lastRefillAt: now };
}

export function tryConsumeToken(state: TokenBucketState, now: Date, capacity: number, refillPeriodSeconds: number): { consumed: boolean; nextState: TokenBucketState } {
  const refilled = refillTokenBucket(state, now, capacity, refillPeriodSeconds);
  if (refilled.tokens < 1) {
    return { consumed: false, nextState: refilled };
  }
  return { consumed: true, nextState: { tokens: refilled.tokens - 1, lastRefillAt: refilled.lastRefillAt } };
}

// Bound formal: máximo de consumos permitidos em qualquer janela de
// duração T segundos, partindo do pior caso (bucket cheio no início).
export function maxConsumptionsInWindow(capacity: number, refillPeriodSeconds: number, windowSeconds: number): number {
  const refillRate = capacity / refillPeriodSeconds;
  return capacity + refillRate * windowSeconds;
}

// Tempo máximo (segundos) até haver >=1 token disponível quando o
// bucket está vazio — propriedade de latência, distinta do bound de
// throughput acima.
export function maxWaitForNextTokenSeconds(capacity: number, refillPeriodSeconds: number): number {
  const refillRate = capacity / refillPeriodSeconds;
  return 1 / refillRate;
}

// Backoff exponencial por context_identity (V3.6/V3.10) — só se aplica
// quando o contexto atual repete o último tentado; contexto novo
// bypassa este cálculo inteiramente (ver try_acquire_approval_resolution_claim).
export function computeNextEligibleDelaySeconds(attemptCount: number, baseSeconds: number, maxSeconds: number): number {
  return Math.min(maxSeconds, baseSeconds * Math.pow(2, Math.max(0, attemptCount - 1)));
}
