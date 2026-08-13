import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getArtistBookers, getDiscoverBookers } from '../data';
import { getSessionProfile } from '../session';
import { ListFilter } from '../list-filter';
import { eyebrowClass } from '../ui';
import { BookerRow } from './booker-row';
import { DiscoverBookers } from './discover-bookers';

export const metadata: Metadata = {
  title: 'Bookers | Doopla',
};

export default async function BookersPage(props: {
  searchParams: Promise<{ discoverLimit?: string }>;
}) {
  const { discoverLimit } = await props.searchParams;
  const { supabase, user, profile } = await getSessionProfile();
  if (profile.role !== 'artista') redirect('/dashboard');

  const myBookers = await getArtistBookers(user.id, supabase);

  const limit = Math.min(Math.max(Number(discoverLimit) || 12, 12), 96);
  const discoverBookers = await getDiscoverBookers(
    myBookers.map((b) => b.profileId),
    supabase,
    limit + 1
  );
  const hasMore = discoverBookers.length > limit;
  const visibleDiscover = discoverBookers.slice(0, limit);

  return (
    <main className="flex flex-col gap-8">
      <header>
        <p className={eyebrowClass}>Bookers</p>
        <h1 className="font-doopla-display mt-1 text-3xl font-semibold">
          Bookers que você já trabalhou
        </h1>
      </header>

      {myBookers.length === 0 ? (
        <p className="rounded-[18px] bg-white p-6 text-sm text-[var(--ink)]/55">
          Você ainda não tem nenhum booker confirmado na sua rede. Convide quem já trabalha
          com você no cadastro, ou espere alguém te representar.
        </p>
      ) : (
        <ListFilter
          items={myBookers}
          getKey={(b) => b.profileId}
          searchPlaceholder="Buscar entre os bookers que trabalham com você..."
          getSearchText={(b) => `${b.fullName} ${b.city ?? ''} ${b.mercados ?? ''}`}
          renderItem={(b) => <BookerRow booker={b} />}
          emptyMessage="Nenhum booker combina com esses filtros."
          itemLabel={{ singular: 'booker', plural: 'bookers' }}
        />
      )}

      <div id="descubra" className="flex flex-col gap-2 pt-4">
        <p className={eyebrowClass}>Descubra novos bookers</p>
        <p className="text-[12.5px] text-[var(--ink)]/55">
          Mostrando bookers ativos recentemente na doopla, não por popularidade. Use a busca
          pra ver outros perfis.
        </p>
      </div>
      <DiscoverBookers bookers={visibleDiscover} limit={limit} hasMore={hasMore} />
    </main>
  );
}
