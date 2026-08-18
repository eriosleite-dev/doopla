import Link from 'next/link';

type StatusRow = { key: string; name: string; status: string; href?: string };

export function PendingStatusList({ rows }: { rows: StatusRow[] }) {
  if (rows.length === 0) return null;

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li
          key={r.key}
          className="flex items-center justify-between gap-3 rounded-[14px] bg-white px-4 py-3 text-sm"
        >
          {r.href ? (
            <Link href={r.href} className="font-medium hover:underline">
              {r.name}
            </Link>
          ) : (
            <span className="font-medium">{r.name}</span>
          )}
          <span className="font-doopla-mono text-[11px] uppercase tracking-[.05em] text-[var(--ink)]/50">
            {r.status}
          </span>
        </li>
      ))}
    </ul>
  );
}
