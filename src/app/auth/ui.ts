export const eyebrowClass =
  'font-doopla-mono text-[11.5px] uppercase tracking-[.16em] text-[var(--accent-ink)]';

export const fieldLabelClass = 'text-sm font-medium text-[var(--ink)]';

export const fieldInputClass =
  'rounded-lg border border-[var(--line-light)] bg-[var(--paper)] px-3 py-2 text-[var(--ink)] outline-none placeholder:text-[var(--ink)]/40 focus:border-[var(--ink)] focus:outline focus:outline-2 focus:outline-[var(--ink)] focus:outline-offset-1';

export const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-full bg-[var(--ink)] px-6 py-3 text-xs font-medium uppercase tracking-[.08em] text-[var(--paper)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40';

export const ghostButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-full border border-[var(--ink)] px-6 py-3 text-xs font-medium uppercase tracking-[.08em] text-[var(--ink)] transition-colors hover:bg-[var(--ink)] hover:text-[var(--paper)]';

export const textLinkClass =
  'font-medium text-[var(--ink)] underline underline-offset-2 hover:text-[var(--accent-ink)]';

export function chipClass(selected: boolean) {
  return `rounded-full border px-4 py-2 text-sm transition-colors ${
    selected
      ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
      : 'border-[var(--line-light)] bg-[var(--paper-dim)] text-[var(--ink)] hover:border-[var(--ink)]'
  }`;
}
