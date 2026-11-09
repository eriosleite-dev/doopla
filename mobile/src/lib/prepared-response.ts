// Espelha src/lib/beta-integration/prepared-response.ts (painel web) —
// mesmo racional: comparação NÃO-autoritativa, só pra UX (mostrar
// "você está editando o rascunho" antes de enviar). A fonte de
// verdade real é sempre o cálculo dentro de persist_inbound_message
// (migration 0066), nunca recomputado aqui.
//
// Normalização MÍNIMA e documentada — só diferenças TÉCNICAS (line
// endings CRLF/CR -> LF, espaço/quebra de linha nas BORDAS). Nunca:
// comparação semântica, lowercase, remoção de pontuação, equivalência
// via IA/modelo.
export function normalizePreparedResponseText(text: string | null | undefined): string {
  const raw = text ?? '';
  const lineEndingsNormalized = raw.replace(/\r\n|\r/g, '\n');
  return lineEndingsNormalized.replace(/^[ \t\n]+|[ \t\n]+$/g, '');
}

export type PreparedResponseOutcome = 'sent' | 'edited';

export function comparePreparedResponseText(draft: string | null | undefined, submitted: string | null | undefined): PreparedResponseOutcome {
  return normalizePreparedResponseText(draft) === normalizePreparedResponseText(submitted) ? 'sent' : 'edited';
}
