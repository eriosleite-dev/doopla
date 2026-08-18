import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AddConnectionModal } from '../add-connection-modal';
import { confirmInviteAction } from '../actions';
import {
  getArtistBookerRelationships,
  getDiscoverBookers,
  getFavoriteBookers,
  getFavoriteIds,
  getIncomingRepresentationRequests,
  getOutgoingRepresentationRequestsForArtist,
  getPendingInvites,
  getSentInvites,
} from '../data';
import { getSessionProfile } from '../session';
import { ListFilter } from '../list-filter';
import { PendingStatusList } from '../pending-status-list';
import { accentButtonClass, avatarClass, eyebrowClass, initialsFromName } from '../ui';
import { BookerRow } from './booker-row';
import { DiscoverBookers } from './discover-bookers';
import { IncomingRequests } from './incoming-requests';

export const metadata: Metadata = {
  title: 'Bookers | Doopla',
};

export default async function BookersPage(props: {
  searchParams: Promise<{
    discoverLimit?: string;
    bookerNoLimite?: string;
    vinculado?: string;
    roteamentoResetado?: string;
  }>;
}) {
  const { discoverLimit, bookerNoLimite, vinculado, roteamentoResetado } = await props.searchParams;
  const { supabase, user, profile } = await getSessionProfile();
  if (profile.role !== 'artista') redirect('/dashboard');

  const vinculadoBooker = vinculado
    ? (
        await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', vinculado)
          .maybeSingle<{ full_name: string }>()
      ).data
    : null;

  const [
    myBookers,
    incomingRequests,
    outgoingRequests,
    sentInvites,
    receivedInvites,
    favoriteBookers,
    favoriteIds,
  ] = await Promise.all([
    getArtistBookerRelationships(user.id, supabase),
    getIncomingRepresentationRequests(user.id, supabase),
    getOutgoingRepresentationRequestsForArtist(user.id, supabase),
    getSentInvites(user.id, supabase),
    getPendingInvites(user.id, supabase),
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

  const pendingInviteRows = sentInvites
    .filter((i) => i.status === 'pendente')
    .map((i) => ({
      key: i.id,
      name: i.invitee_name,
      status: 'Convite enviado · Aguardando cadastro',
    }));
  const outgoingRequestRows = outgoingRequests.map((r) => ({
    key: r.id,
    name: r.bookerName,
    status: 'Solicitação enviada · Aguardando aceite',
    href: `/dashboard/bookers/${r.booker.profileId}`,
  }));
  const hasAnyPending =
    incomingRequests.length > 0 ||
    outgoingRequestRows.length > 0 ||
    pendingInviteRows.length > 0 ||
    receivedInvites.length > 0;

  return (
    <main className="flex flex-col gap-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className={eyebrowClass}>Bookers</p>
          <h1 className="font-doopla-display mt-1 text-3xl font-semibold">Seus bookers</h1>
        </div>
        <AddConnectionModal myRole="artista" />
      </header>

      {bookerNoLimite === '1' && (
        <section className="rounded-[18px] border border-[var(--line-light)] bg-white p-5">
          <p className="text-sm text-[var(--ink)]/70">
            Esse booker atingiu o limite de artistas do plano dele e não pôde confirmar sua
            solicitação agora. Vale tentar de novo mais tarde, ou combinar diretamente com ele.
          </p>
        </section>
      )}

      {vinculadoBooker && (
        <section className="rounded-[18px] border border-[var(--accent)] bg-white p-5">
          <p className="text-sm text-[var(--ink)]/80">
            {vinculadoBooker.full_name} agora está conectado a você. Quer que ela também receba
            seus novos pedidos de orçamento?
          </p>
          <Link
            href="/dashboard/perfil#roteamento"
            className={`${accentButtonClass} mt-3 inline-flex`}
          >
            Configurar Link de Orçamento
          </Link>
        </section>
      )}

      {roteamentoResetado === '1' && (
        <section className="rounded-[18px] border border-[var(--line-light)] bg-white p-5">
          <p className="text-sm text-[var(--ink)]/70">
            Seus novos pedidos de orçamento agora estão sendo direcionados pra você, porque a
            conexão com o booker configurado no Link de Orçamento foi encerrada.
          </p>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <p className={eyebrowClass}>Meus bookers</p>
        {myBookers.length === 0 ? (
          <p className="rounded-[18px] bg-white p-6 text-sm text-[var(--ink)]/55">
            Você ainda não tem nenhum booker conectado. Use &quot;Adicionar um Booker&quot; acima
            pra convidar quem já trabalha com você, ou espere alguém te representar.
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

      {hasAnyPending && (
        <section id="solicitacoes" className="flex flex-col gap-3">
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

          {incomingRequests.length > 0 && <IncomingRequests requests={incomingRequests} />}

          <PendingStatusList rows={[...outgoingRequestRows, ...pendingInviteRows]} />
        </section>
      )}

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
        <p className={eyebrowClass}>Encontrar bookers</p>
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
    </main>
  );
}
