'use client';

import Link from 'next/link';
import { useState } from 'react';

import { ProCard, ProEmptyState } from '../pro-ui';

type PendingCard = {
  id: string;
  title: string;
  description: string;
  preparedContent: string | null;
  timeLabel: string;
  href: string;
};

type ResolvedCard = {
  id: string;
  title: string;
  description: string;
  timeLabel: string;
  href: string;
};

// Rodada de correção/consistência (06/09/2026) — item 3. "Precisa de
// você" e "Resolvidas" são duas VISÕES PRIMÁRIAS (abas), nunca um
// dropdown Pendente/Resolvida escondendo a separação. O controle de
// ordenação (recentes/antigas) vive dentro da aba Resolvidas — é onde
// faz sentido real (histórico cronológico); "Precisa de você" mantém a
// ordenação por prioridade já decidida em sortDecisionsByPriority
// (nunca substituída por ordenação crua por data, que reduziria o
// sinal de urgência). O badge "Decisões N" da sidebar e o "Precisa de
// você (N)" aqui usam o MESMO pendingCount vindo do servidor — nenhuma
// contagem nova é inventada neste componente.
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
  const [order, setOrder] = useState<'recentes' | 'antigas'>('recentes');

  const orderedResolved = order === 'recentes' ? resolvedCards : [...resolvedCards].reverse();

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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {pendingCards.map((c) => (
              <ProCard key={c.id}>
                <p className="font-pro-sub text-[14.5px] font-bold">{c.title}</p>
                <p className="mt-1 text-[12.5px] text-[var(--pro-tx-50)]">{c.description}</p>
                {c.preparedContent && (
                  <p className="mt-2 line-clamp-3 text-[12.5px] italic text-[var(--pro-tx-70)]">&ldquo;{c.preparedContent}&rdquo;</p>
                )}
                <p className="font-doopla-mono mt-3 text-[10.5px] text-[var(--pro-tx-30)]">{c.timeLabel}</p>
                <Link
                  href={c.href}
                  className="font-pro-sub mt-3 inline-flex items-center gap-1.5 rounded-full bg-[var(--pro-red)] px-4 py-2 text-[12px] font-bold text-[var(--pro-off)] shadow-[0_0_20px_rgba(226,41,28,.35)]"
                >
                  Ver conversa
                </Link>
              </ProCard>
            ))}
          </div>
        ))}

      {tab === 'resolvidas' &&
        (resolvedCards.length === 0 ? (
          <ProEmptyState message="Nenhuma decisão resolvida ainda." />
        ) : (
          <div>
            <div className="mb-3 flex items-center justify-end">
              <label className="font-doopla-mono flex items-center gap-2 text-[10.5px] uppercase tracking-[.03em] text-[var(--pro-tx-30)]">
                Ordenar
                <select
                  value={order}
                  onChange={(e) => setOrder(e.target.value as 'recentes' | 'antigas')}
                  className="rounded-full border border-[var(--pro-line)] bg-[var(--pro-panel)] px-3 py-1.5 text-[11px] text-[var(--pro-tx-70)] outline-none"
                >
                  <option value="recentes">Mais recentes</option>
                  <option value="antigas">Mais antigas</option>
                </select>
              </label>
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
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
                    <p className="font-doopla-mono text-[10px] text-[var(--pro-tx-30)]">{c.timeLabel}</p>
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
