import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import {
  getRepresentationRequestStatusesFor,
  getRepresentedArtistCards,
  getDiscoverArtists,
  getSentInvites,
} from '../data';
import { getSessionProfile } from '../session';
import { ListFilter } from '../list-filter';
import { eyebrowClass } from '../ui';
import { ArtistRow } from './artist-row';
import { DiscoverArtists } from './discover-artists';
import { InviteArtistCard } from './invite-artist-card';
import { MarkRepresentationsSeen } from './mark-seen';

export const metadata: Metadata = {
  title: 'Artistas | Doopla',
};

export default async function ArtistasPage(props: {
  searchParams: Promise<{ discoverLimit?: string }>;
}) {
  const { discoverLimit } = await props.searchParams;
  const { supabase, user, profile } = await getSessionProfile();
  if (profile.role !== 'booker') redirect('/dashboard');

  const myArtists = await getRepresentedArtistCards(user.id, supabase);

  const limit = Math.min(Math.max(Number(discoverLimit) || 12, 12), 96);
  const discoverArtists = await getDiscoverArtists(
    myArtists.map((a) => a.profileId),
    supabase,
    limit + 1
  );
  const hasMore = discoverArtists.length > limit;
  const visibleDiscover = discoverArtists.slice(0, limit);
  const requestStatuses = await getRepresentationRequestStatusesFor(
    user.id,
    visibleDiscover.map((a) => a.profileId),
    supabase
  );
  const requestStatusRecord = Object.fromEntries(requestStatuses);
  const sentInvites = await getSentInvites(user.id, supabase);

  return (
    <main className="flex flex-col gap-8">
      <MarkRepresentationsSeen />
      <header>
        <p className={eyebrowClass}>Artistas</p>
        <h1 className="font-doopla-display mt-1 text-3xl font-semibold">
          Artistas que você representa
        </h1>
      </header>

      {myArtists.length === 0 ? (
        <p className="rounded-[18px] bg-white p-6 text-sm text-[var(--ink)]/55">
          Você ainda não representa nenhum artista na doopla. Descubra novos artistas abaixo, ou
          convide quem já trabalha com você no cadastro.
        </p>
      ) : (
        <ListFilter
          items={myArtists}
          getKey={(a) => a.profileId}
          searchPlaceholder="Buscar entre os artistas que você representa..."
          getSearchText={(a) => `${a.fullName} ${a.stageName ?? ''} ${a.city ?? ''} ${a.mercados ?? ''}`}
          renderItem={(a) => <ArtistRow artist={a} />}
          emptyMessage="Nenhum artista combina com esses filtros."
          itemLabel={{ singular: 'artista', plural: 'artistas' }}
        />
      )}

      <div id="descubra" className="flex flex-col gap-2 pt-4">
        <p className={eyebrowClass}>Descubra novos artistas</p>
        <p className="text-[12.5px] text-[var(--ink)]/55">
          Mostrando artistas ativos recentemente na doopla, não por popularidade. Use a busca pra
          ver outros perfis.
        </p>
      </div>
      <DiscoverArtists
        artists={visibleDiscover}
        requestStatuses={requestStatusRecord}
        limit={limit}
        hasMore={hasMore}
      />

      <InviteArtistCard invites={sentInvites} />
    </main>
  );
}
