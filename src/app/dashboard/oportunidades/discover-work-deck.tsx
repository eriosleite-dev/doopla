'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { formatCentsAsBRL, formatPercent, formatRelativeDate } from '@/lib/format';

import {
  declineInvitationAction,
  dismissOpportunityAction,
  expressInterestAction,
  withdrawInterestAction,
} from '../actions';
import { FavoriteButton } from '../favorite-button';
import type { OpportunityWithArtist } from '../data';
import { accentButtonClass, avatarClass, ghostButtonClass, initialsFromName } from '../ui';

type DeckItem = OpportunityWithArtist & { matchReasons: string[] };

export function DiscoverWorkDeck({
  items,
  favoriteIds,
}: {
  items: DeckItem[];
  favoriteIds: string[];
}) {
  const [search, setSearch] = useState('');
  const [index, setIndex] = useState(0);
  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((o) =>
      [o.artistName, o.category, o.location, o.description]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(q))
    );
  }, [items, search]);

  // A lista revalida do servidor sempre que uma ação (interesse/agora não)
  // termina — o item some do array e o próximo passa a ocupar o índice
  // atual sozinho. Clampa na leitura em vez de corrigir via efeito (ex:
  // descartou o último item da lista, índice ficaria fora do novo
  // tamanho).
  const safeIndex = Math.min(index, Math.max(filtered.length - 1, 0));

  if (items.length === 0) {
    return (
      <div className="rounded-[18px] bg-white p-8 text-center">
        <p className="text-sm text-[var(--ink)]/70">Nenhum trabalho novo para você agora.</p>
        <p className="mt-1.5 text-[13px] text-[var(--ink)]/50">
          Novos trabalhos aparecem aqui conforme artistas publicam oportunidades. Enquanto isso,
          explore artistas e aumente sua rede.
        </p>
        <Link href="/dashboard/artistas#descubra" className={`${accentButtonClass} mt-4 inline-flex`}>
          Explorar artistas
        </Link>
        <p className="mt-4 text-[12px] text-[var(--ink)]/45">
          Melhore suas recomendações →{' '}
          <Link href="/dashboard/perfil" className="underline">
            Complete seu perfil
          </Link>{' '}
          para receber trabalhos mais compatíveis com você.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setIndex(0);
          }}
          placeholder="Buscar por local, categoria, artista..."
          className="w-full max-w-sm rounded-full border border-[var(--ink)]/15 bg-white px-4 py-2 text-[13px] outline-none focus:border-[var(--accent)] sm:w-auto"
        />
        {filtered.length > 0 && (
          <span className="font-doopla-mono ml-auto text-[11px] uppercase tracking-[.05em] text-[var(--ink)]/45">
            {safeIndex + 1} de {filtered.length} trabalhos para você
          </span>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-[18px] bg-white p-6 text-sm text-[var(--ink)]/60">
          Nenhum trabalho combina com essa busca.
        </p>
      ) : (
        <WorkCard
          key={filtered[safeIndex].id}
          opportunity={filtered[safeIndex]}
          isFavorited={favoriteSet.has(filtered[safeIndex].artist_profile_id)}
          onPrev={safeIndex > 0 ? () => setIndex(safeIndex - 1) : undefined}
          onSkipLocally={
            filtered.length > 1 ? () => setIndex((safeIndex + 1) % filtered.length) : undefined
          }
        />
      )}
    </div>
  );
}

function WorkCard({
  opportunity: o,
  isFavorited,
  onPrev,
  onSkipLocally,
}: {
  opportunity: DeckItem;
  isFavorited: boolean;
  onPrev?: () => void;
  onSkipLocally?: () => void;
}) {
  const invited = o.myInvitationStatus === 'pendente';
  const declined = o.myInvitationStatus === 'recusada';
  const interested = o.myInterestStatus === 'pendente';
  const negotiated = o.cache_amount_cents != null;

  return (
    <div className="rounded-[22px] bg-white p-7">
      <div className="flex items-start gap-4">
        <span className={`${avatarClass} h-14 w-14 text-base`}>{initialsFromName(o.artistName)}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-doopla-display text-lg font-semibold">{o.artistName}</p>
            <FavoriteButton
              targetId={o.artist_profile_id}
              initialFavorited={isFavorited}
              className="text-[var(--ink)]/30 hover:text-[var(--accent-ink)]"
            />
          </div>
          {invited && (
            <span className="font-doopla-mono mt-1 inline-block rounded-full bg-[var(--accent)]/15 px-2.5 py-1 text-[10px] uppercase tracking-[.03em] text-[var(--accent-ink)]">
              Você foi convidado
            </span>
          )}
          {o.matchReasons.length > 0 && (
            <span className="font-doopla-mono mt-1 block text-[10.5px] uppercase tracking-[.03em] text-[var(--musgo)]">
              ✓ Combina com seu perfil — {o.matchReasons.join(', ')}
            </span>
          )}
        </div>
      </div>

      <p className="mt-4 text-[15px] leading-relaxed text-[var(--ink)]/80">{o.description}</p>

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-[var(--ink)]/60">
        {o.location && <span>📍 {o.location}</span>}
        {o.event_date && (
          <span>{new Date(`${o.event_date}T00:00:00`).toLocaleDateString('pt-BR')}</span>
        )}
        <span>
          {negotiated
            ? `Cachê do artista: ${formatCentsAsBRL(o.cache_amount_cents!)}`
            : o.client_offered_cents != null
              ? `Cliente ofereceu: ${formatCentsAsBRL(o.client_offered_cents)}`
              : 'Cachê: ainda não definido'}
        </span>
        <span>
          {o.commission_percent != null
            ? `Comissão: ${formatPercent(o.commission_percent)}`
            : 'Comissão: ainda não negociada'}
        </span>
        <span className="font-doopla-mono text-[11px]">{formatRelativeDate(o.created_at)}</span>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-[var(--line-light)] pt-5">
        {invited ? (
          <>
            <span className="text-[13px] text-[var(--ink)]/60">
              Convite recebido do artista — quem decide é ele, você só confirma que topa.
            </span>
            <form action={declineInvitationAction} className="ml-auto">
              <input type="hidden" name="opportunityId" value={o.id} />
              <button type="submit" className={ghostButtonClass}>
                Recusar convite
              </button>
            </form>
          </>
        ) : !declined ? (
          <>
            {onPrev && (
              <button type="button" onClick={onPrev} className={ghostButtonClass}>
                ← Anterior
              </button>
            )}
            <form action={dismissOpportunityAction} onSubmit={() => onSkipLocally?.()}>
              <input type="hidden" name="opportunityId" value={o.id} />
              <button type="submit" className={ghostButtonClass}>
                Agora não
              </button>
            </form>
            {interested ? (
              <form action={withdrawInterestAction} className="ml-auto">
                <input type="hidden" name="opportunityId" value={o.id} />
                <button type="submit" className={ghostButtonClass}>
                  Retirar interesse
                </button>
              </form>
            ) : (
              <form action={expressInterestAction} className="ml-auto">
                <input type="hidden" name="opportunityId" value={o.id} />
                <button type="submit" className={accentButtonClass}>
                  Tenho interesse
                </button>
              </form>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
