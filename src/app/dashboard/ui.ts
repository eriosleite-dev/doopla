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

export const cpDotClass = (done: boolean) =>
  `mx-auto flex h-[22px] w-[22px] items-center justify-center rounded-full font-doopla-mono text-[11px] ${
    done ? 'bg-[var(--musgo)] text-white' : 'bg-[var(--alert)] text-white'
  }`;
export const cpLabelClass = (done: boolean) =>
  `font-doopla-mono mt-1.5 text-[9.5px] uppercase tracking-[.02em] ${
    done ? 'text-[var(--ink)]/45' : 'font-semibold text-[var(--alert)]'
  }`;

export const verifyBadgeClass = (verified: boolean) =>
  `font-doopla-mono inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[10.5px] uppercase tracking-[.03em] ${
    verified ? 'bg-[var(--musgo)]/10 text-[var(--musgo)]' : 'bg-[var(--alert)]/10 text-[var(--alert)]'
  }`;

export const EVENT_LABELS: Record<string, string> = {
  proposta_enviada: 'Proposta enviada',
  contraproposta: 'Contraproposta',
  aceita: 'Proposta aceita',
  recusada: 'Proposta recusada',
  aguardando_pagamento: 'Marcado como realizado',
  pagamento_confirmado: 'Pagamento confirmado',
  concluida: 'Booking concluído',
};

export const avatarClass =
  'flex h-11 w-11 flex-none items-center justify-center rounded-full bg-[var(--ink)] font-doopla-display text-sm font-semibold text-[var(--accent)]';

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
