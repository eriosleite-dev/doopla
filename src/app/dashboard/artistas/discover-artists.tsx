'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import type { ArtistCard } from '../data';
import { MultiFilterList } from '../list-filter';
import type { RepresentationRequestStatus } from '@/lib/supabase/types';
import { ArtistRow } from './artist-row';

export function DiscoverArtists({
  artists,
  requestStatuses,
  limit,
  hasMore,
  favoriteIds = [],
}: {
  artists: ArtistCard[];
  requestStatuses: Record<string, RepresentationRequestStatus | null>;
  limit: number;
  hasMore: boolean;
  favoriteIds?: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [loadedLimit, setLoadedLimit] = useState(limit);
  const favoriteSet = new Set(favoriteIds);

  function loadMore() {
    const next = loadedLimit + 12;
    setLoadedLimit(next);
    startTransition(() => {
      router.push(`/dashboard/artistas?discoverLimit=${next}#descubra`);
    });
  }

  return (
    <MultiFilterList
      items={artists}
      getKey={(a) => a.profileId}
      searchPlaceholder="Digite e aperte Enter... ex: DJ, São Paulo"
      getSearchText={(a) => `${a.fullName} ${a.stageName ?? ''} ${a.city ?? ''} ${a.state ?? ''} ${a.mercados ?? ''} ${a.category ?? ''}`}
      renderItem={(a) => (
        <ArtistRow
          artist={a}
          requestStatus={requestStatuses[a.profileId] ?? null}
          isFavorited={favoriteSet.has(a.profileId)}
        />
      )}
      emptyMessage="Nenhum artista novo combina com esses filtros ainda."
      itemLabel={{ singular: 'artista encontrado', plural: 'artistas encontrados' }}
      onLoadMore={hasMore ? loadMore : undefined}
      loadMoreLabel={pending ? 'Carregando…' : `Carregar mais artistas · mostrando ${artists.length}`}
    />
  );
}
