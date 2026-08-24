// Orçamento de contexto do Bloco 2 — centralizado aqui de propósito,
// nunca espalhado como número mágico pelos builders. Valores
// conservadores por enquanto; ajustáveis depois com dado real de uso,
// sem precisar caçar onde cada limite está aplicado.

// Combinação quantidade + recência (nunca só quantidade) — evita que
// uma conversa reaberta meses depois injete uma thread antiga inteira
// só porque ela tem poucas mensagens desde a reabertura.
export const CONTEXT_MAX_MESSAGES = 10;
export const CONTEXT_MESSAGE_WINDOW_DAYS = 30;

export const CONTEXT_MAX_MESSAGE_TEXT_CHARS = 1000;
export const CONTEXT_MAX_PROFILE_FIELD_CHARS = 2000;

export function truncateText(value: string, maxChars: number): { value: string; truncated: boolean } {
  if (value.length <= maxChars) {
    return { value, truncated: false };
  }
  return { value: value.slice(0, maxChars), truncated: true };
}
