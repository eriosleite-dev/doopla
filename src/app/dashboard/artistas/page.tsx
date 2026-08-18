import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import {
  getBookerArtistRelationships,
  getOutgoingRepresentationRequests,
  getRepresentationRequestStatusesFor,
  getDiscoverArtists,
  getFavoriteArtists,
  getFavoriteIds,
  getSentInvites,
} from '../data';
import { getSessionProfile } from '../session';
import { ListFilter } from '../list-filter';
import { eyebrowClass } from '../ui';
import { ArtistRow } from './artist-row';
import { DiscoverArtists } from './discover-artists';
import { InviteArtistCard } from './invite-artist-card';
import { MarkRepresentationsSeen } from './mark-seen';
import { OutgoingRequests } from './outgoing-requests';

export const metadata: Metadata = {
  title: 'Artistas | Doopla',
};

export default async function ArtistasPage(props: {
  searchParams: Promise<{ discoverLimit?: string }>;
}) {
  const { discoverLimit } = await props.searchParams;
  const { supabase, user, profile } = await getSessionProfile();
  if (profile.role !== 'booker') redirect('/dashboard');

  const [myArtists, outgoingRequests, favoriteArtists, favoriteIds] = await Promise.all([
    getBookerArtistRelationships(user.id, supabase),
    getOutgoingRepresentationRequests(user.id, supabase),
    getFavoriteArtists(user.id, supabase),
    getFavoriteIds(user.id, supabase),
  ]);

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
    <main className="flex flex-col gap-10">
      <MarkRepresentationsSeen />
      <header>
        <p className={eyebrowClass}>Artistas</p>
        <h1 className="font-doopla-display mt-1 text-3xl font-semibold">
          Artistas que você representa
        </h1>
      </header>

      {outgoingRequests.length > 0 && (
        <section className="flex flex-col gap-3">
          <p className={eyebrowClass}>Solicitações enviadas</p>
          <OutgoingRequests requests={outgoingRequests} />
        </section>
      )}

      <section className="flex flex-col gap-3">
        <p className={eyebrowClass}>Meus artistas</p>
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
            renderItem={(a) => (
              <ArtistRow artist={a} isFavorited={favoriteIds.has(a.profileId)} />
            )}
            emptyMessage="Nenhum artista combina com esses filtros."
            itemLabel={{ singular: 'artista', plural: 'artistas' }}
          />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <p className={eyebrowClass}>Meus favoritos</p>
        {favoriteArtists.length === 0 ? (
          <p className="rounded-[18px] bg-white p-6 text-sm text-[var(--ink)]/55">
            Nenhum artista favoritado ainda. Clique no coração de um perfil pra guardar aqui —
            diferente de &quot;já trabalhei com&quot;, é só uma lista sua pra acompanhar.
          </p>
        ) : (
          <ListFilter
            items={favoriteArtists}
            getKey={(a) => a.profileId}
            searchPlaceholder="Buscar entre seus artistas favoritos..."
            getSearchText={(a) => `${a.fullName} ${a.stageName ?? ''} ${a.city ?? ''} ${a.mercados ?? ''}`}
            renderItem={(a) => <ArtistRow artist={a} isFavorited />}
            emptyMessage="Nenhum favorito combina com esses filtros."
            itemLabel={{ singular: 'favorito', plural: 'favoritos' }}
          />
        )}
      </section>

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
        favoriteIds={[...favoriteIds]}
      />

      <section className="flex flex-col gap-3">
        <p className={eyebrowClass}>Convites enviados</p>
        <InviteArtistCard invites={sentInvites} />
      </section>
    </main>
  );
}
