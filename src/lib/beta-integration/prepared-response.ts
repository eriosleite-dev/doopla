// Doopla Beta Runtime Integration — Conversas Bloco 2: espelho TS
// NÃO-autoritativo de normalize_prepared_response_text/da comparação
// draft x resposta enviada (migration 0066, persist_inbound_message).
//
// Existe só pra UX no cliente (ex.: aviso "idêntico ao rascunho" antes
// de enviar) — a fonte de verdade real é sempre o cálculo dentro de
// persist_inbound_message, no mesmo INSERT que persiste a mensagem,
// nunca recomputado depois por este módulo nem por nenhum outro job.
//
// Normalização MÍNIMA e documentada — decisão explícita do usuário:
// só diferenças TÉCNICAS (line endings CRLF/CR -> LF, espaço/quebra de
// linha nas BORDAS). Nunca: comparação semântica, lowercase, remoção
// de pontuação, equivalência via IA/modelo. Uma mudança de palavra,
// preço ou número — mesmo pequena — é sempre 'edited'.

export function normalizePreparedResponseText(text: string | null | undefined): string {
  const raw = text ?? '';
  const lineEndingsNormalized = raw.replace(/\r\n|\r/g, '\n');
  return lineEndingsNormalized.replace(/^[ \t\n]+|[ \t\n]+$/g, '');
}

export type PreparedResponseOutcome = 'sent' | 'edited';

export function comparePreparedResponseText(
  draft: string | null | undefined,
  submitted: string | null | undefined
): PreparedResponseOutcome {
  return normalizePreparedResponseText(draft) === normalizePreparedResponseText(submitted) ? 'sent' : 'edited';
}
