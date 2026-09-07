'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { ProCard, ProEmptyState } from '../pro-ui';

type PendingCard = {
  id: string;
  heading: string;
  counterpartName: string;
  eventDateLabel: string | null;
  preparedContent: string | null;
  ctaLabel: string;
  timeLabel: string;
  createdAtIso: string;
  href: string;
};

type ResolvedCard = {
  id: string;
  title: string;
  description: string;
  timeLabel: string;
  resolvedAtIso: string;
  href: string;
};

type PendingSort = 'prioridade' | 'recentes' | 'antigas';
type ResolvedSort = 'recentes' | 'antigas';

// Rodada de correção/consistência (06/09/2026) — item 3, revisão 2.
// "Precisa de você" e "Resolvidas" continuam duas VISÕES PRIMÁRIAS
// (abas), nunca um dropdown escondendo a separação — isso já estava
// certo. O que mudou: os cards agora lideram com O QUE PRECISA SER
// DECIDIDO (não mais "Conversa em andamento" seguido do estado
// genérico), lista vertical compacta em vez de grade 2 colunas (melhor
// escaneabilidade em volume), e um controle de ordenação de verdade —
// "Prioridade" (default, já existia) / "Mais recentes" / "Mais
// antigas" pra Precisa de você; "Mais recentes"/"Mais antigas" pra
// Resolvidas. Nunca um filtro por "tipo de decisão" — hoje só existe 1
// blockReason real no produto, um filtro assim não teria utilidade
// nenhuma (instrução explícita: nunca preencher com filtro inútil).
export function ProDecisoesView({
  pendingCount,
  pendingCards,
  resolvedCards,
}: {
  pendingCount: number;
  pendingCards: PendingCard[];
  resolvedCards: ResolvedCard[];
}) {
  const [tab, setTab] = useState<'pendentes' | 'resolvidas'>('pendentes');
  const [pendingSort, setPendingSort] = useState<PendingSort>('prioridade');
  const [resolvedSort, setResolvedSort] = useState<ResolvedSort>('recentes');

  const orderedPending = useMemo(() => {
    if (pendingSort === 'prioridade') return pendingCards;
    const sorted = [...pendingCards].sort((a, b) => a.createdAtIso.localeCompare(b.createdAtIso));
    return pendingSort === 'recentes' ? sorted.reverse() : sorted;
  }, [pendingCards, pendingSort]);

  const orderedResolved = resolvedSort === 'recentes' ? resolvedCards : [...resolvedCards].reverse();

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2 border-b border-[var(--pro-line)]">
        <button
          type="button"
          onClick={() => setTab('pendentes')}
          className={`font-pro-sub -mb-px border-b-2 px-1 pb-3 text-[14px] font-bold transition-colors ${
            tab === 'pendentes'
              ? 'border-[var(--pro-red)] text-[var(--pro-off)]'
              : 'border-transparent text-[var(--pro-tx-50)] hover:text-[var(--pro-off)]'
          }`}
        >
          Precisa de você{pendingCount > 0 ? ` (${pendingCount})` : ''}
        </button>
        <button
          type="button"
          onClick={() => setTab('resolvidas')}
          className={`font-pro-sub -mb-px ml-4 border-b-2 px-1 pb-3 text-[14px] font-bold transition-colors ${
            tab === 'resolvidas'
              ? 'border-[var(--pro-red)] text-[var(--pro-off)]'
              : 'border-transparent text-[var(--pro-tx-50)] hover:text-[var(--pro-off)]'
          }`}
        >
          Resolvidas
        </button>
      </div>

      {tab === 'pendentes' &&
        (pendingCards.length === 0 ? (
          <ProEmptyState message="Tudo resolvido por aqui. Sua Doopla te chama quando precisar de uma decisão." />
        ) : (
          <div>
            <div className="mb-3 flex items-center justify-end">
              <SortSelect
                value={pendingSort}
                onChange={(v) => setPendingSort(v as PendingSort)}
                options={[
                  { value: 'prioridade', label: 'Prioridade' },
                  { value: 'recentes', label: 'Mais recentes' },
                  { value: 'antigas', label: 'Mais antigas' },
                ]}
              />
            </div>
            <div className="flex flex-col gap-2.5">
              {orderedPending.map((c) => (
                <ProCard key={c.id} className="!p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-pro-sub text-[13.5px] font-bold leading-snug">{c.heading}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-[var(--pro-tx-50)]">
                        <span>{c.counterpartName}</span>
                        {c.eventDateLabel && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-bold">evento em {c.eventDateLabel}</span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span className="font-bold">{c.timeLabel}</span>
                      </p>
                      {c.preparedContent && (
                        <p className="mt-2 line-clamp-2 text-[12px] italic text-[var(--pro-tx-70)]">&ldquo;{c.preparedContent}&rdquo;</p>
                      )}
                    </div>
                    <Link
                      href={c.href}
                      className="font-pro-sub flex-none whitespace-nowrap rounded-full bg-[var(--pro-red)] px-4 py-2 text-[12px] font-bold text-[var(--pro-off)] shadow-[0_0_20px_rgba(226,41,28,.35)]"
                    >
                      {c.ctaLabel}
                    </Link>
                  </div>
                </ProCard>
              ))}
            </div>
          </div>
        ))}

      {tab === 'resolvidas' &&
        (resolvedCards.length === 0 ? (
          <ProEmptyState message="Nenhuma decisão resolvida ainda." />
        ) : (
          <div>
            <div className="mb-3 flex items-center justify-end">
              <SortSelect
                value={resolvedSort}
                onChange={(v) => setResolvedSort(v as ResolvedSort)}
                options={[
                  { value: 'recentes', label: 'Mais recentes' },
                  { value: 'antigas', label: 'Mais antigas' },
                ]}
              />
            </div>
            <div className="flex flex-col gap-2">
              {orderedResolved.map((c) => (
                <ProCard key={c.id} className="!p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-pro-sub text-[13px] font-bold">{c.title}</p>
                    <span className="font-doopla-mono flex-none rounded-full bg-[rgba(62,207,110,.15)] px-2 py-[2px] text-[9.5px] uppercase tracking-[.03em] text-[var(--pro-green)]">
                      Resolvida por você
                    </span>
                  </div>
                  <p className="mt-1.5 text-[12px] text-[var(--pro-tx-50)]">{c.description}</p>
                  <div className="mt-2.5 flex items-center justify-between gap-3">
                    <p className="font-doopla-mono text-[10px] font-bold text-[var(--pro-tx-30)]">{c.timeLabel}</p>
                    <Link href={c.href} className="text-[11.5px] text-[var(--pro-tx-50)] hover:text-[var(--pro-off)]">
                      Ver conversa →
                    </Link>
                  </div>
                </ProCard>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}

function SortSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="font-doopla-mono flex items-center gap-2 text-[10.5px] uppercase tracking-[.03em] text-[var(--pro-tx-30)]">
      Ordenar
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-full border border-[var(--pro-line)] bg-[var(--pro-panel)] px-3 py-1.5 text-[11px] text-[var(--pro-tx-70)] outline-none"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
