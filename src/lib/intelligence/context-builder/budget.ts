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
  let sliced = value.slice(0, maxChars);
  // Nunca corta no meio de um par substituto UTF-16 (emoji e outros
  // caracteres fora do BMP são 2 code units) — um surrogate alto
  // sozinho no fim vira texto malformado antes de chegar no model.
  const lastCode = sliced.charCodeAt(sliced.length - 1);
  if (lastCode >= 0xd800 && lastCode <= 0xdbff) {
    sliced = sliced.slice(0, -1);
  }
  return { value: sliced, truncated: true };
}
