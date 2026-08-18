import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import {
  getArtistBookerRelationships,
  getDiscoverBookers,
  getFavoriteBookers,
  getFavoriteIds,
  getIncomingRepresentationRequests,
  getSentInvites,
} from '../data';
import { getSessionProfile } from '../session';
import { ListFilter } from '../list-filter';
import { eyebrowClass } from '../ui';
import { BookerRow } from './booker-row';
import { DiscoverBookers } from './discover-bookers';
import { IncomingRequests } from './incoming-requests';
import { InviteBookerCard } from './invite-booker-card';

export const metadata: Metadata = {
  title: 'Bookers | Doopla',
};

export default async function BookersPage(props: {
  searchParams: Promise<{ discoverLimit?: string; bookerNoLimite?: string }>;
}) {
  const { discoverLimit, bookerNoLimite } = await props.searchParams;
  const { supabase, user, profile } = await getSessionProfile();
  if (profile.role !== 'artista') redirect('/dashboard');

  const [myBookers, incomingRequests, favoriteBookers, favoriteIds] = await Promise.all([
    getArtistBookerRelationships(user.id, supabase),
    getIncomingRepresentationRequests(user.id, supabase),
    getFavoriteBookers(user.id, supabase),
    getFavoriteIds(user.id, supabase),
  ]);

  const limit = Math.min(Math.max(Number(discoverLimit) || 12, 12), 96);
  const discoverBookers = await getDiscoverBookers(
    myBookers.map((b) => b.profileId),
    supabase,
    limit + 1
  );
  const hasMore = discoverBookers.length > limit;
  const visibleDiscover = discoverBookers.slice(0, limit);
  const sentInvites = await getSentInvites(user.id, supabase);

  return (
    <main className="flex flex-col gap-10">
      <header>
        <p className={eyebrowClass}>Bookers</p>
        <h1 className="font-doopla-display mt-1 text-3xl font-semibold">
          Bookers que você já trabalhou
        </h1>
      </header>

      {bookerNoLimite === '1' && (
        <section className="rounded-[18px] border border-[var(--line-light)] bg-white p-5">
          <p className="text-sm text-[var(--ink)]/70">
            Esse booker atingiu o limite de artistas do plano dele e não pôde confirmar sua
            solicitação agora. Vale tentar de novo mais tarde, ou combinar diretamente com ele.
          </p>
        </section>
      )}

      {incomingRequests.length > 0 && (
        <section id="solicitacoes" className="flex flex-col gap-3">
          <p className={eyebrowClass}>Solicitações pendentes recebidas</p>
          <IncomingRequests requests={incomingRequests} />
        </section>
      )}

      <section className="flex flex-col gap-3">
        <p className={eyebrowClass}>Meus bookers</p>
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
            renderItem={(b) => <BookerRow booker={b} isFavorited={favoriteIds.has(b.profileId)} />}
            emptyMessage="Nenhum booker combina com esses filtros."
            itemLabel={{ singular: 'booker', plural: 'bookers' }}
          />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <p className={eyebrowClass}>Meus favoritos</p>
        {favoriteBookers.length === 0 ? (
          <p className="rounded-[18px] bg-white p-6 text-sm text-[var(--ink)]/55">
            Nenhum booker favoritado ainda. Clique no coração de um perfil pra guardar aqui —
            diferente de &quot;já trabalhei com&quot;, é só uma lista sua pra acompanhar.
          </p>
        ) : (
          <ListFilter
            items={favoriteBookers}
            getKey={(b) => b.profileId}
            searchPlaceholder="Buscar entre seus bookers favoritos..."
            getSearchText={(b) => `${b.fullName} ${b.city ?? ''} ${b.mercados ?? ''}`}
            renderItem={(b) => <BookerRow booker={b} isFavorited />}
            emptyMessage="Nenhum favorito combina com esses filtros."
            itemLabel={{ singular: 'favorito', plural: 'favoritos' }}
          />
        )}
      </section>

      <div id="descubra" className="flex flex-col gap-2 pt-4">
        <p className={eyebrowClass}>Descubra novos bookers</p>
        <p className="text-[12.5px] text-[var(--ink)]/55">
          Mostrando bookers ativos recentemente na doopla, não por popularidade. Use a busca
          pra ver outros perfis.
        </p>
      </div>
      <DiscoverBookers
        bookers={visibleDiscover}
        limit={limit}
        hasMore={hasMore}
        favoriteIds={[...favoriteIds]}
      />

      <section className="flex flex-col gap-3">
        <p className={eyebrowClass}>Convites enviados</p>
        <InviteBookerCard invites={sentInvites} />
      </section>
    </main>
  );
}
