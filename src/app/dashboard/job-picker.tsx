'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

const OPTIONS = [
  { label: 'Já represento o artista', href: '/dashboard/propor' },
  { label: 'Buscar um artista na doopla', href: '/dashboard/artistas#descubra' },
  { label: 'Convidar quem ainda não está na doopla', href: '/dashboard/artistas' },
];

export function JobPicker({ align = 'up' }: { align?: 'up' | 'down' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      {open && (
        <div
          className={`absolute left-0 w-full min-w-[240px] rounded-[14px] bg-[var(--paper)] p-2 shadow-lg ${
            align === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'
          }`}
        >
          <p className="font-doopla-mono px-2.5 py-1.5 text-[10px] uppercase tracking-[.06em] text-[var(--ink)]/45">
            Quem vai fazer esse trabalho?
          </p>
          <div className="flex flex-col">
            {OPTIONS.map((opt) => (
              <Link
                key={opt.href}
                href={opt.href}
                onClick={() => setOpen(false)}
                className="rounded-[10px] px-2.5 py-2 text-[13px] text-[var(--ink)] hover:bg-[var(--paper-dim)]"
              >
                {opt.label}
              </Link>
            ))}
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="font-doopla-mono w-full rounded-full bg-[var(--accent)] px-4 py-3 text-center text-[13.5px] font-semibold text-[var(--ink)] sm:w-auto"
      >
        + Adicionar trabalho
      </button>
    </div>
  );
}
