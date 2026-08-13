'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import type { BookerCard } from '../data';
import { MultiFilterList } from '../list-filter';
import { BookerRow } from './booker-row';

export function DiscoverBookers({
  bookers,
  limit,
  hasMore,
}: {
  bookers: BookerCard[];
  limit: number;
  hasMore: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [loadedLimit, setLoadedLimit] = useState(limit);

  function loadMore() {
    const next = loadedLimit + 12;
    setLoadedLimit(next);
    startTransition(() => {
      router.push(`/dashboard/bookers?discoverLimit=${next}#descubra`);
    });
  }

  return (
    <MultiFilterList
      items={bookers}
      getKey={(b) => b.profileId}
      searchPlaceholder="Digite e aperte Enter... ex: marcas, São Paulo"
      getSearchText={(b) => `${b.fullName} ${b.city ?? ''} ${b.state ?? ''} ${b.mercados ?? ''} ${b.perfil ?? ''}`}
      renderItem={(b) => <BookerRow booker={b} />}
      emptyMessage="Nenhum booker novo combina com esses filtros ainda."
      itemLabel={{ singular: 'booker encontrado', plural: 'bookers encontrados' }}
      onLoadMore={hasMore ? loadMore : undefined}
      loadMoreLabel={pending ? 'Carregando…' : `Carregar mais bookers · mostrando ${bookers.length}`}
    />
  );
}
