import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AddConnectionModal } from '../add-connection-modal';
import { confirmInviteAction } from '../actions';
import {
  getBookerArtistRelationships,
  getIncomingRepresentationRequestsForBooker,
  getOutgoingRepresentationRequests,
  getPendingInvites,
  getRepresentationRequestStatusesFor,
  getDiscoverArtists,
  getFavoriteArtists,
  getFavoriteIds,
  getSentInvites,
} from '../data';
import { getSessionProfile } from '../session';
import { ListFilter } from '../list-filter';
import { PendingStatusList } from '../pending-status-list';
import { accentButtonClass, avatarClass, eyebrowClass, initialsFromName } from '../ui';
import { ArtistRow } from './artist-row';
import { DiscoverArtists } from './discover-artists';
import { IncomingArtistRequests } from './incoming-artist-requests';
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

  const [
    myArtists,
    outgoingRequests,
    incomingRequests,
    sentInvites,
    receivedInvites,
    favoriteArtists,
    favoriteIds,
  ] = await Promise.all([
    getBookerArtistRelationships(user.id, supabase),
    getOutgoingRepresentationRequests(user.id, supabase),
    getIncomingRepresentationRequestsForBooker(user.id, supabase),
    getSentInvites(user.id, supabase),
    getPendingInvites(user.id, supabase),
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

  const pendingInviteRows = sentInvites
    .filter((i) => i.status === 'pendente')
    .map((i) => ({
      key: i.id,
      name: i.invitee_name,
      status: 'Convite enviado · Aguardando cadastro',
    }));
  const outgoingRequestRows = outgoingRequests.map((r) => ({
    key: r.id,
    name: r.artist.stageName || r.artist.fullName,
    status: 'Solicitação enviada · Aguardando aceite',
    href: `/dashboard/artistas/${r.artist.profileId}`,
  }));
  const hasAnyPending =
    incomingRequests.length > 0 ||
    outgoingRequestRows.length > 0 ||
    pendingInviteRows.length > 0 ||
    receivedInvites.length > 0;

  return (
    <main className="flex flex-col gap-10">
      <MarkRepresentationsSeen />
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className={eyebrowClass}>Artistas</p>
          <h1 className="font-doopla-display mt-1 text-3xl font-semibold">
            Artistas que você representa
          </h1>
        </div>
        <AddConnectionModal myRole="booker" />
      </header>

      <section className="flex flex-col gap-3">
        <p className={eyebrowClass}>Meus artistas</p>
        {myArtists.length === 0 ? (
          <p className="rounded-[18px] bg-white p-6 text-sm text-[var(--ink)]/55">
            Você ainda não representa nenhum artista na doopla. Use &quot;Adicionar um
            Artista&quot; acima, descubra novos artistas abaixo, ou espere alguém te procurar.
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

      {hasAnyPending && (
        <section className="flex flex-col gap-3">
          <p className={eyebrowClass}>Solicitações e convites</p>

          {receivedInvites.length > 0 && (
            <ul className="flex flex-col gap-2">
              {receivedInvites.map((invite) => (
                <li
                  key={invite.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] bg-white px-4 py-3"
                >
                  <span className="flex items-center gap-3 text-sm">
                    <span className={avatarClass}>{initialsFromName(invite.inviterName)}</span>
                    <span>
                      <strong>{invite.inviterName}</strong> quer se conectar com você na doopla.
                    </span>
                  </span>
                  <form action={confirmInviteAction}>
                    <input type="hidden" name="inviteId" value={invite.id} />
                    <button type="submit" className={accentButtonClass}>
                      Aceitar conexão
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}

          {incomingRequests.length > 0 && <IncomingArtistRequests requests={incomingRequests} />}

          <PendingStatusList rows={[...outgoingRequestRows, ...pendingInviteRows]} />
        </section>
      )}

      <section id="favoritos" className="flex flex-col gap-3 scroll-mt-6">
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
        <p className={eyebrowClass}>Encontrar artistas</p>
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
    </main>
  );
}
