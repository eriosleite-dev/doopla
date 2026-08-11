export const eyebrowClass =
  'font-doopla-mono text-[11.5px] uppercase tracking-[.16em] text-[var(--accent-ink)]';

export const statCardClass = 'rounded-[18px] bg-white p-6';
export const statCardLeadClass =
  'rounded-[18px] bg-[var(--ink)] p-6 text-[var(--paper)]';
export const statLabelClass =
  'font-doopla-mono text-[11px] uppercase tracking-[.08em] text-[var(--ink)]/55';
export const statLabelLeadClass =
  'font-doopla-mono text-[11px] uppercase tracking-[.08em] text-[var(--accent)]/85';
export const statValueClass = 'font-doopla-display mt-2.5 text-[28px] font-semibold';
export const statValueLeadClass = 'font-doopla-display mt-2.5 text-[40px] font-semibold';
export const statSubClass = 'mt-2 text-[12.5px] text-[var(--ink)]/55';
export const statSubUpClass = 'mt-2 text-[12.5px] text-[var(--accent-ink)]';

export const cardClass = 'rounded-[18px] bg-white p-6';

export const fieldLabelClass = 'text-sm font-medium text-[var(--ink)]';
export const fieldInputClass =
  'rounded-lg border border-[var(--line-light)] bg-[var(--paper)] px-3 py-2 text-[var(--ink)] outline-none placeholder:text-[var(--ink)]/40 focus:border-[var(--ink)] focus:outline focus:outline-2 focus:outline-[var(--ink)] focus:outline-offset-1';
export const fieldTextareaClass = `${fieldInputClass} min-h-24 resize-y`;

export const textLinkClass =
  'font-medium text-[var(--ink)] underline underline-offset-2 hover:text-[var(--accent-ink)]';

export const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-full bg-[var(--ink)] px-6 py-3 text-xs font-medium uppercase tracking-[.06em] text-[var(--paper)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40';
export const accentButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-6 py-3 text-xs font-medium uppercase tracking-[.06em] text-[var(--ink)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40';
export const ghostButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-full border border-[var(--ink)] px-6 py-3 text-xs font-medium uppercase tracking-[.06em] text-[var(--ink)] transition-colors hover:bg-[var(--ink)] hover:text-[var(--paper)] disabled:cursor-not-allowed disabled:opacity-40';
export const rustGhostButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-full border border-[var(--ink)]/35 px-6 py-3 text-xs font-medium uppercase tracking-[.06em] text-[var(--ink)]/60 transition-colors hover:border-[var(--ink)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-40';

export const filterChipClass = (active: boolean) =>
  `font-doopla-mono rounded-full border px-4 py-2 text-[11px] uppercase tracking-[.06em] transition-colors ${
    active
      ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
      : 'border-[var(--line-light)] text-[var(--ink)]/60 hover:border-[var(--ink)]/40'
  }`;

const STATUS_PILL_BASE =
  'font-doopla-mono inline-block rounded-full px-3 py-1.5 text-[10px] uppercase tracking-[.06em]';

export const statusPillClasses: Record<string, string> = {
  proposta_enviada: `${STATUS_PILL_BASE} bg-[var(--accent-ink)]/15 text-[var(--accent-ink)]`,
  aceita: `${STATUS_PILL_BASE} bg-[var(--ink)] text-[var(--accent)]`,
  recusada: `${STATUS_PILL_BASE} border border-[var(--line-light)] text-[var(--ink)]/40`,
  aguardando_pagamento: `${STATUS_PILL_BASE} bg-[var(--accent-ink)]/15 text-[var(--accent-ink)]`,
  concluida: `${STATUS_PILL_BASE} bg-[var(--ink)] text-[var(--paper)]`,
};

export const STATUS_LABELS: Record<string, string> = {
  proposta_enviada: 'Aguardando resposta',
  aceita: 'Aceita',
  recusada: 'Recusada',
  aguardando_pagamento: 'Aguardando pagamento',
  concluida: 'Concluída',
};

export const EVENT_LABELS: Record<string, string> = {
  proposta_enviada: 'Proposta enviada',
  contraproposta: 'Contraproposta',
  aceita: 'Aceita',
  recusada: 'Recusada',
  pagamento_confirmado: 'Trabalho realizado, aguardando pagamento',
  concluida: 'Pagamento confirmado',
};

export const avatarClass =
  'flex h-11 w-11 flex-none items-center justify-center rounded-full bg-[var(--ink)] font-doopla-display text-sm font-semibold text-[var(--accent)]';

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
