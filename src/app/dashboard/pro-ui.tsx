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

// Cabeçalho de página compartilhado (revisão Professional Web
// Dashboard, 06/09/2026) — substitui o par eyebrowClass amarelo +
// font-doopla-display serifado do painel legado em toda rota nova
// (Bookings/Agenda/Financeiro/Minha equipe/Configurações). Mesma
// tipografia/peso do H1 já usado em ProHero (professional-home-view.tsx).
export function ProPageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="font-pro-sub text-[24px] font-bold sm:text-[26px]">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-[440px] text-[13.5px] text-[var(--pro-tx-50)]">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// Card escuro em glassmorphism — mesmo tratamento visual de todo card
// da Home (ProHero/StatCard/ProAccordion), pra nenhuma rota nova
// inventar seu próprio card branco/opaco.
export function ProCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-[18px] border border-[var(--pro-line)] bg-[var(--pro-panel)] p-5 backdrop-blur-xl sm:p-6 ${className}`}>
      {children}
    </div>
  );
}

// Estado vazio integrado ao painel — nunca o retângulo branco opaco do
// design legado. Usado por Bookings/Agenda/Minha equipe sempre que uma
// lista está vazia.
export function ProEmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[18px] border border-dashed border-[var(--pro-line)] bg-white/[0.015] p-8 text-center">
      <p className="text-[13.5px] text-[var(--pro-tx-50)]">{message}</p>
      {action}
    </div>
  );
}

// Busca compacta escura — equivalente pro da search bar branca gigante
// do painel legado (list-filter.tsx, mantido intocado por ser usado
// pelas telas legadas do Booker). Filtro de status opcional (chips).
export function ProSearchFilter<T>({
  items,
  getSearchText,
  searchPlaceholder,
  statusFilters,
  getStatus,
  renderItem,
  emptyMessage,
  itemLabel,
}: {
  items: T[];
  getSearchText: (item: T) => string;
  searchPlaceholder: string;
  statusFilters?: { value: string; label: string }[];
  getStatus?: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  emptyMessage: string;
  itemLabel: { singular: string; plural: string };
}) {
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState('todos');

  function normalize(str: string): string {
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .trim();
  }

  const normalizedTerm = normalize(term);
  const filtered = items.filter((item) => {
    const matchesStatus = !getStatus || status === 'todos' || getStatus(item) === status;
    const matchesText = !normalizedTerm || normalize(getSearchText(item)).includes(normalizedTerm);
    return matchesStatus && matchesText;
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-full border border-[var(--pro-line)] bg-[var(--pro-panel)] px-4 py-2.5">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-none text-[var(--pro-tx-50)]">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="text"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full bg-transparent text-[13px] text-[var(--pro-off)] outline-none placeholder:text-[var(--pro-tx-30)]"
        />
      </div>

      {statusFilters && statusFilters.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {statusFilters.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setStatus(f.value)}
              className={`font-doopla-mono rounded-full border px-3.5 py-1.5 text-[10.5px] uppercase tracking-[.04em] transition-colors ${
                status === f.value
                  ? 'border-[var(--pro-red)] bg-[var(--pro-red)]/15 text-[var(--pro-red)]'
                  : 'border-[var(--pro-line)] text-[var(--pro-tx-50)] hover:border-[var(--pro-tx-30)]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      <p className="font-doopla-mono text-[10.5px] uppercase tracking-[.03em] text-[var(--pro-tx-30)]">
        {filtered.length} {filtered.length === 1 ? itemLabel.singular : itemLabel.plural}
      </p>

      {filtered.length === 0 ? (
        <ProEmptyState message={emptyMessage} />
      ) : (
        <div className="flex flex-col gap-2.5">{filtered.map((item) => renderItem(item))}</div>
      )}
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
