// Doopla Intelligence Core v1 — Runtime: backoff limitado pra
// retomada durável de runtime_pending_replies (migration 0054). 100%
// puro. Reaproveita o ESPÍRITO do backoff exponencial já usado em
// approval/rate-limiter.ts (base pequena, teto físico) — nunca a
// mesma function (domínios diferentes: aquele é sobre chamadas ao
// model, este é sobre tentativas de retomada de conversation).

// Teto físico de tentativas de retomada — depois disso a linha vira
// 'needs_attention' (observável, nunca reprocessada automaticamente de
// novo). Escolhido generoso o bastante pra sobreviver a uma janela
// razoável de indisponibilidade (com o backoff abaixo, ~8 tentativas
// cobrem bem mais de 1h de tentativas espaçadas).
export const RUNTIME_PENDING_REPLY_MAX_ATTEMPTS = 8;

// Heartbeat de segurança setado ANTES de cada tentativa (begin_runtime_pending_reply_attempt)
// — cobre um crash a meio da tentativa (não só conversation_busy
// explícito): se nada mais acontecer, o reconciler recupera esta
// linha sozinho depois deste intervalo.
export const RUNTIME_PENDING_REPLY_SAFETY_NET_SECONDS = 900; // 15 min

const BACKOFF_BASE_SECONDS = 30;
const BACKOFF_MAX_SECONDS = 1800; // 30 min

// Exponencial simples, capado — attemptCount já reflete a tentativa
// QUE ACABOU DE ACONTECER (1-indexed): 1→30s, 2→60s, 3→120s, ...,
// capado em BACKOFF_MAX_SECONDS.
export function computeRuntimeRetryBackoffSeconds(attemptCount: number): number {
  const exponent = Math.max(0, Math.min(attemptCount, 10) - 1);
  const seconds = BACKOFF_BASE_SECONDS * 2 ** exponent;
  return Math.min(seconds, BACKOFF_MAX_SECONDS);
}
