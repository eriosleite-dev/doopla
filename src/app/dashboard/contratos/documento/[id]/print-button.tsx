'use client';

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="font-doopla-mono rounded-full border border-[var(--ink)]/20 px-4 py-2 text-[11px] uppercase tracking-[.06em] hover:border-[var(--ink)]"
    >
      Imprimir / salvar PDF
    </button>
  );
}
