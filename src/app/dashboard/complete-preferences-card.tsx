import Link from 'next/link';

export function CompletePreferencesCard({
  filled,
  total,
}: {
  filled: number;
  total: number;
}) {
  if (total === 0 || filled >= total) return null;

  const pct = Math.round((filled / total) * 100);

  return (
    <section className="flex flex-wrap items-center gap-4 rounded-[14px] bg-[var(--paper-dim)] px-4 py-3.5">
      <div className="min-w-[220px] flex-1">
        <p className="text-[13px] text-[var(--ink)]/70">
          Complete seu perfil para melhorar seu matching · {filled}/{total}
        </p>
        <div className="mt-1.5 h-1 w-full max-w-[260px] overflow-hidden rounded-full bg-white">
          <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <Link
        href="/dashboard/perfil#preferencias-matching"
        className="font-doopla-mono flex-none text-[11px] uppercase tracking-[.05em] text-[var(--accent-ink)] hover:underline"
      >
        Completar perfil →
      </Link>
    </section>
  );
}
