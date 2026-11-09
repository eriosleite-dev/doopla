// ADR 0009 (20/10/2026) — Mecanismo B do incidente P0 (ADR 0008):
// tipos do reconhecedor de pausa real ("pare de me escrever"/
// equivalente) em professional_self.
//
// Deliberadamente DOIS signals só, nunca um terceiro "resume_requested":
// o mecanismo de retomada é "qualquer mensagem nova reabre
// automaticamente" (ver recognizer.ts e pipeline.ts) — uma mensagem
// que não é pedido de pausa já significa retomada por definição,
// nunca precisa de um signal próprio pra isso.
export const PROFESSIONAL_SELF_PAUSE_SIGNALS = ['pause_requested', 'no_signal'] as const;
export type ProfessionalSelfPauseSignal = (typeof PROFESSIONAL_SELF_PAUSE_SIGNALS)[number];
