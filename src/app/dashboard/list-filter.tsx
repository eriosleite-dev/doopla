'use client';

import { useMemo, useState } from 'react';

import { filterChipClass } from './ui';

function normalizeText(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

export type StatusFilterOption = { value: string; label: string };
export type SortOption = { value: string; label: string };
export type ItemLabel = { singular: string; plural: string };

type ListFilterProps<T> = {
  items: T[];
  getKey: (item: T) => string;
  searchPlaceholder: string;
  getSearchText: (item: T) => string;
  statusFilters?: StatusFilterOption[];
  getStatus?: (item: T) => string;
  sortOptions?: SortOption[];
  // Retorna os itens ordenados, ou null se essa ordenação ainda não é
  // real (depende de dado de atividade que o backend não guarda ainda).
  sortFn?: (items: T[], sortValue: string) => T[] | null;
  renderItem: (item: T) => React.ReactNode;
  emptyMessage: string;
  itemLabel: ItemLabel;
};

// Busca ao vivo + filtro de status (single-select) + ordenação — mesmo
// padrão em toda lista que pode crescer (Trabalhos, Contratos, Artistas
// com quem trabalho, Seus bookers etc). REGRA FIXA: um componente só.
export function ListFilter<T>({
  items,
  getKey,
  searchPlaceholder,
  getSearchText,
  statusFilters,
  getStatus,
  sortOptions,
  sortFn,
  renderItem,
  emptyMessage,
  itemLabel,
}: ListFilterProps<T>) {
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState('todos');
  const [sort, setSort] = useState(sortOptions?.[0]?.value ?? '');

  const { filtered, sortUnavailable } = useMemo(() => {
    const normalizedTerm = normalizeText(term);
    let result = items.filter((item) => {
      const matchesStatus = !getStatus || status === 'todos' || getStatus(item) === status;
      const matchesText =
        !normalizedTerm || normalizeText(getSearchText(item)).includes(normalizedTerm);
      return matchesStatus && matchesText;
    });

    let unavailable = false;
    if (sortFn && sort) {
      const sorted = sortFn(result, sort);
      if (sorted) {
        result = sorted;
      } else {
        unavailable = true;
      }
    }

    return { filtered: result, sortUnavailable: unavailable };
  }, [items, term, status, sort, sortFn, getStatus, getSearchText]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-full border border-[var(--line-light)] bg-white px-5 py-3.5">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="flex-none text-[var(--ink)]/40"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="text"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--ink)]/40"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {statusFilters && statusFilters.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {statusFilters.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setStatus(f.value)}
                className={filterChipClass(status === f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>
        ) : (
          <span />
        )}
        {sortOptions && sortOptions.length > 0 && (
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="font-doopla-mono rounded-full border border-[var(--line-light)] bg-white px-3 py-2 text-[11px] uppercase tracking-[.03em] text-[var(--ink)]/70"
          >
            {sortOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        )}
      </div>

      <p className="font-doopla-mono text-[11px] uppercase tracking-[.03em] text-[var(--ink)]/40">
        {filtered.length} {filtered.length === 1 ? itemLabel.singular : itemLabel.plural}
        {sortUnavailable &&
          ' · essa ordenação depende de dado de atividade real, ainda não disponível'}
      </p>

      {filtered.length === 0 ? (
        <p className="rounded-[18px] bg-white p-6 text-sm text-[var(--ink)]/55">{emptyMessage}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((item) => (
            <li key={getKey(item)}>{renderItem(item)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

type MultiFilterListProps<T> = {
  items: T[];
  getKey: (item: T) => string;
  searchPlaceholder: string;
  getSearchText: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
  emptyMessage: string;
  itemLabel: ItemLabel;
  onLoadMore?: () => void;
  loadMoreLabel?: string;
};

// Busca por filtros múltiplos: termo + Enter vira chip removível, filtros
// combinam em AND. Usado só em telas de descoberta (Bookers para você /
// Encontrar artistas na doopla), separado da busca simples acima.
export function MultiFilterList<T>({
  items,
  getKey,
  searchPlaceholder,
  getSearchText,
  renderItem,
  emptyMessage,
  itemLabel,
  onLoadMore,
  loadMoreLabel,
}: MultiFilterListProps<T>) {
  const [input, setInput] = useState('');
  const [filters, setFilters] = useState<string[]>([]);

  const filtered = useMemo(() => {
    if (filters.length === 0) return items;
    return items.filter((item) => {
      const haystack = normalizeText(getSearchText(item));
      return filters.every((f) => haystack.includes(normalizeText(f)));
    });
  }, [items, filters, getSearchText]);

  function addFilter() {
    const value = input.trim();
    if (!value) return;
    if (!filters.some((f) => normalizeText(f) === normalizeText(value))) {
      setFilters((prev) => [...prev, value]);
    }
    setInput('');
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-full border border-[var(--line-light)] bg-white px-5 py-3.5">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="flex-none text-[var(--ink)]/40"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addFilter();
            }
          }}
          placeholder={searchPlaceholder}
          className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--ink)]/40"
        />
      </div>

      {filters.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-2">
            {filters.map((f, i) => (
              <span
                key={f}
                className="font-doopla-mono inline-flex items-center gap-1.5 rounded-full bg-[var(--ink)] py-1.5 pl-3 pr-2 text-[11px] uppercase tracking-[.02em] text-[var(--paper)]"
              >
                {f}
                <button
                  type="button"
                  onClick={() => setFilters((prev) => prev.filter((_, idx) => idx !== i))}
                  aria-label={`Remover filtro ${f}`}
                  className="opacity-60 hover:opacity-100"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setFilters([])}
            className="font-doopla-mono text-[11px] uppercase tracking-[.03em] text-[var(--accent-ink)] underline"
          >
            Limpar filtros
          </button>
        </div>
      )}

      {filters.length > 0 && (
        <p className="font-doopla-mono text-[11px] uppercase tracking-[.03em] text-[var(--ink)]/40">
          {filtered.length} {filtered.length === 1 ? itemLabel.singular : itemLabel.plural}
        </p>
      )}

      {filtered.length === 0 ? (
        <p className="rounded-[18px] bg-white p-6 text-sm text-[var(--ink)]/55">{emptyMessage}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((item) => (
            <li key={getKey(item)}>{renderItem(item)}</li>
          ))}
        </ul>
      )}

      {onLoadMore && filters.length === 0 && (
        <button
          type="button"
          onClick={onLoadMore}
          className="mx-auto mt-2 rounded-full border border-[var(--line-light)] px-6 py-2.5 text-[12.5px] font-medium hover:border-[var(--accent)] hover:bg-[var(--paper-dim)]"
        >
          {loadMoreLabel ?? 'Carregar mais'}
        </button>
      )}
    </div>
  );
}
