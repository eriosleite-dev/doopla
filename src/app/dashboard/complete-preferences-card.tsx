import Link from 'next/link';

import { cardClass, eyebrowClass, ghostButtonClass } from './ui';

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
    <section className={cardClass}>
      <p className={eyebrowClass}>Complete suas preferências</p>
      <p className="mt-2 text-sm text-[var(--ink)]/70">
        {filled} de {total} informações preenchidas — quanto mais completo, melhor o matching
        com oportunidades e pessoas compatíveis.
      </p>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--paper-dim)]">
        <div
          className="h-full rounded-full bg-[var(--accent)]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <Link
        href="/dashboard/perfil#preferencias-matching"
        className={`${ghostButtonClass} mt-4 w-fit`}
      >
        Completar →
      </Link>
    </section>
  );
}
