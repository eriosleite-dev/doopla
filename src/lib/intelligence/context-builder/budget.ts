// Orçamento de contexto do Bloco 2 — centralizado aqui de propósito,
// nunca espalhado como número mágico pelos builders. Valores
// conservadores por enquanto; ajustáveis depois com dado real de uso,
// sem precisar caçar onde cada limite está aplicado.

// Combinação quantidade + recência (nunca só quantidade) — evita que
// uma conversa reaberta meses depois injete uma thread antiga inteira
// só porque ela tem poucas mensagens desde a reabertura.
//
// ADR 0007/0009 (20/10/2026, seção 2.2) — causa raiz P0 confirmada:
// com o teto em 10, uma correção explícita da profissional ("não
// existe valores avulsos", 09:59) já estava fora da janela quando a
// Doopla repetiu o erro poucos minutos depois (10:05/10:06). Subido
// pra 20 como mitigação RÁPIDA e conservadora — nunca a correção
// completa (essa é um mecanismo de fatos/correções duráveis que
// sobrevivem à rotação da janela, fora de escopo desta mudança).
export const CONTEXT_MAX_MESSAGES = 20;
export const CONTEXT_MESSAGE_WINDOW_DAYS = 30;

export const CONTEXT_MAX_MESSAGE_TEXT_CHARS = 1000;
export const CONTEXT_MAX_PROFILE_FIELD_CHARS = 2000;

// Professional Intelligence Context — retrieval V1 (recency_bounded_v1,
// ver context-builder/types.ts). Bounded pequeno de propósito (custo de
// token + a lista inteira ainda cabe fácil no contexto) — evoluir pra
// relevância no futuro não muda este número sozinho, muda a estratégia
// de seleção inteira.
export const CONTEXT_MAX_COMMERCIAL_HISTORY_ITEMS = 5;
export const CONTEXT_MAX_BUSINESS_CONTEXT_FIELD_CHARS = 2000;

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
