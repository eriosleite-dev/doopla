'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';

import { ProCard, ProEmptyState } from '../pro-ui';
import { loadPendingDecisionsPageAction, loadResolvedDecisionsPageAction } from './actions';
import type { PendingCard, ResolvedCard } from './format-cards';

type PendingSort = 'prioridade' | 'recentes' | 'antigas';
type ResolvedSort = 'recentes' | 'antigas';

// Reescrita pra paginação real server-side (migration 0070/hotfix
// pedido explicitamente: 20 inicialmente, "Carregar mais" +20, sem
// paginação numérica, sem infinite scroll, contador = total real,
// filtro/ordenação sempre no servidor, trocar sort RESETA a janela
// (nunca soma sobre o sort anterior), Resolvidas segue a mesma regra.
// Ordem default agora é "Recentes" (decisão de produto já registrada —
// antes abria em "Prioridade" por engano). Web e App usam a mesma RPC
// por trás (list_actionable_decisions_page/list_resolved_decisions_page).
export function ProDecisoesView({
  initialPendingCards,
  initialPendingTotal,
  initialResolvedCards,
  initialResolvedTotal,
}: {
  initialPendingCards: PendingCard[];
  initialPendingTotal: number;
  initialResolvedCards: ResolvedCard[];
  initialResolvedTotal: number;
}) {
  const [tab, setTab] = useState<'pendentes' | 'resolvidas'>('pendentes');

  const [pendingSort, setPendingSort] = useState<PendingSort>('recentes');
  const [pendingCards, setPendingCards] = useState(initialPendingCards);
  const [pendingTotal, setPendingTotal] = useState(initialPendingTotal);
  const [pendingPending, startPendingTransition] = useTransition();

  const [resolvedSort, setResolvedSort] = useState<ResolvedSort>('recentes');
  const [resolvedCards, setResolvedCards] = useState(initialResolvedCards);
  const [resolvedTotal, setResolvedTotal] = useState(initialResolvedTotal);
  const [resolvedPending, startResolvedTransition] = useTransition();

  function changePendingSort(sort: PendingSort) {
    setPendingSort(sort);
    startPendingTransition(async () => {
      const { cards, totalCount } = await loadPendingDecisionsPageAction(sort, 0);
      setPendingCards(cards);
      setPendingTotal(totalCount);
    });
  }

  function loadMorePending() {
    startPendingTransition(async () => {
      const { cards, totalCount } = await loadPendingDecisionsPageAction(pendingSort, pendingCards.length);
      setPendingCards((prev) => [...prev, ...cards]);
      setPendingTotal(totalCount);
    });
  }

  function changeResolvedSort(sort: ResolvedSort) {
    setResolvedSort(sort);
    startResolvedTransition(async () => {
      const { cards, totalCount } = await loadResolvedDecisionsPageAction(sort, 0);
      setResolvedCards(cards);
      setResolvedTotal(totalCount);
    });
  }

  function loadMoreResolved() {
    startResolvedTransition(async () => {
      const { cards, totalCount } = await loadResolvedDecisionsPageAction(resolvedSort, resolvedCards.length);
      setResolvedCards((prev) => [...prev, ...cards]);
      setResolvedTotal(totalCount);
    });
  }

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
          Precisa de você{pendingTotal > 0 ? ` (${pendingTotal})` : ''}
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
                onChange={(v) => changePendingSort(v as PendingSort)}
                options={[
                  { value: 'recentes', label: 'Mais recentes' },
                  { value: 'antigas', label: 'Mais antigas' },
                  { value: 'prioridade', label: 'Prioridade' },
                ]}
              />
            </div>
            <div className={`flex flex-col gap-2.5 ${pendingPending ? 'opacity-60' : ''}`}>
              {pendingCards.map((c) => (
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
            {pendingCards.length < pendingTotal && (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  disabled={pendingPending}
                  onClick={loadMorePending}
                  className="font-pro-sub rounded-full border border-[var(--pro-line)] px-5 py-2 text-[12.5px] font-bold text-[var(--pro-tx-70)] hover:text-[var(--pro-off)]"
                >
                  {pendingPending ? 'Carregando…' : `Carregar mais (${pendingTotal - pendingCards.length})`}
                </button>
              </div>
            )}
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
                onChange={(v) => changeResolvedSort(v as ResolvedSort)}
                options={[
                  { value: 'recentes', label: 'Mais recentes' },
                  { value: 'antigas', label: 'Mais antigas' },
                ]}
              />
            </div>
            <div className={`flex flex-col gap-2 ${resolvedPending ? 'opacity-60' : ''}`}>
              {resolvedCards.map((c) => (
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
            {resolvedCards.length < resolvedTotal && (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  disabled={resolvedPending}
                  onClick={loadMoreResolved}
                  className="font-pro-sub rounded-full border border-[var(--pro-line)] px-5 py-2 text-[12.5px] font-bold text-[var(--pro-tx-70)] hover:text-[var(--pro-off)]"
                >
                  {resolvedPending ? 'Carregando…' : `Carregar mais (${resolvedTotal - resolvedCards.length})`}
                </button>
              </div>
            )}
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
