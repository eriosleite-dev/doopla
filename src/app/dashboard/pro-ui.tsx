'use client';

import { useId, useState, type ReactNode } from 'react';

// Peças compartilhadas do novo Shell/Home (Professional Product UI —
// Shell + Home bloco). Puramente visuais/reutilizáveis — nenhuma
// lógica de produto aqui, só apresentação sobre dados já resolvidos
// pelos Server Components que chamam isso.

export function ProAccordion({
  title,
  count,
  rightLink,
  children,
  id,
  defaultOpen = false,
}: {
  title: string;
  count?: number;
  rightLink?: { label: string; href: string };
  children: ReactNode;
  id?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();

  return (
    <div
      id={id}
      className="mb-3.5 overflow-hidden rounded-[18px] border border-[var(--pro-line)] bg-[var(--pro-panel)] backdrop-blur-xl"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left text-[var(--pro-off)]"
      >
        <span className="font-pro-sub flex items-center gap-2 text-[16px] font-bold">
          {title}
          {typeof count === 'number' && count > 0 && (
            <span className="font-doopla-mono rounded-full bg-[var(--pro-red)] px-2 py-[1px] text-[11px] text-[var(--pro-off)] shadow-[0_0_10px_var(--pro-red-glow)]">
              {count}
            </span>
          )}
        </span>
        <span className="flex items-center gap-3.5">
          {rightLink && (
            <a
              href={rightLink.href}
              onClick={(e) => e.stopPropagation()}
              className="font-pro-sub text-[12px] font-bold text-[var(--pro-red)] hover:underline"
            >
              {rightLink.label}
            </a>
          )}
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`flex-none text-[var(--pro-tx-70)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>
      <div id={bodyId} hidden={!open} className="px-5 pb-4">
        {children}
      </div>
    </div>
  );
}

export function ProCopyButton({ value, label = 'Copiado.' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2200);
        } catch {
          // clipboard indisponível (ex.: contexto sem permissão) — não
          // trava a UI, só não copia.
        }
      }}
      aria-label={label}
      className="ml-auto flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full border border-[var(--pro-line)] text-[11px] text-[var(--pro-tx-70)] hover:border-[var(--pro-off)]/40 hover:text-[var(--pro-off)]"
    >
      {copied ? '✓' : '⧉'}
    </button>
  );
}
