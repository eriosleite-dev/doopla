'use client';

import Link from 'next/link';
import { useState } from 'react';

// "Precisa de você" expansível (01/10/2026, achado de QA da fundadora)
// — antes a Home tinha 3 fontes de "pendência" renderizadas por conta
// própria (pedidos/bookings/decisions), cada uma com seu próprio link
// "Ver X" apontando pra uma rota (uma delas morta). Unificado aqui: UM
// array só, já ordenado por prioridade/recência em
// professional-home-view.tsx (fonte única também usada pra contar o
// badge "Precisa de você" — nunca mais diverge do que é renderizado).
// Mostra só 3 linhas por padrão, expande/colapsa DENTRO do próprio
// card (nunca navega pra outra página) — mesma linha única clicável já
// aprovada, nenhum card dentro de card.
export type PendencyRight = { kind: 'pill'; label: string; className: string } | { kind: 'time'; label: string };

export type PendencyRow = {
  id: string;
  href: string;
  name: string;
  detail: string;
  right: PendencyRight;
};

const INITIAL_VISIBLE = 3;

export function ProNeedsYouList({ rows }: { rows: PendencyRow[] }) {
  const [expanded, setExpanded] = useState(false);

  if (rows.length === 0) {
    return <p className="font-pro-sub py-2 text-[14px] font-semibold text-[var(--pro-off)]">Tudo certo por aqui.</p>;
  }

  const visible = expanded ? rows : rows.slice(0, INITIAL_VISIBLE);

  return (
    <>
      <div className="mb-3 divide-y divide-[var(--pro-line)] border-b border-[var(--pro-line)]">
        {visible.map((row) => (
          <Link
            key={row.id}
            href={row.href}
            prefetch={false}
            className="flex items-center justify-between gap-3 py-2.5 hover:bg-white/[0.02]"
          >
            <p className="min-w-0 truncate text-[13px] text-[var(--pro-off)]">
              <span className="font-pro-sub font-bold">{row.name}</span> — {row.detail}
            </p>
            {row.right.kind === 'pill' ? (
              <span className={`flex-none ${row.right.className}`}>{row.right.label}</span>
            ) : (
              <span className="font-doopla-mono flex-none text-[10.5px] font-bold text-[var(--pro-tx-30)]">{row.right.label}</span>
            )}
          </Link>
        ))}
      </div>
      {rows.length > INITIAL_VISIBLE && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="font-pro-sub inline-flex items-center gap-1.5 text-[12.5px] font-bold text-[var(--pro-red)] hover:underline"
        >
          {expanded ? 'Mostrar menos' : 'Ver todas as pendências →'}
        </button>
      )}
    </>
  );
}
