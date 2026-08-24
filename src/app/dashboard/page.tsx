import type { Metadata } from 'next';
import Link from 'next/link';

import { formatCentsAsBRL, formatPercent } from '@/lib/format';
import { siteOrigin } from '@/lib/site-url';

import { ArtistLimitBanner } from './booker-pro/artist-limit-banner';
import { BookerOficialCard } from './booker-oficial-card';
import { BookingsPreview } from './bookings-list';
import { PostDowngradeBanner } from './booker-pro/post-downgrade-banner';
import { ProUpsellCard } from './booker-pro/pro-upsell-card';
import { CompletePreferencesCard } from './complete-preferences-card';
import {
  computeArtistStats,
  computeBookerStats,
  getAgendaEvents,
  getArtistBookers,
  getArtistMatchingCompletion,
  getArtistMatchProfile,
  getAttentionItems,
  getBookerArtistRelationships,
  getBookerMatchingCompletion,
  getBookerMatchReasons,
  getDiscoverBookers,
  getOfficialBookerProgress,
  getOpenOpportunities,
  getOrcamentoLinkInfo,
  getPendingInvites,
  getRecentActivity,
  getSubscription,
  getUserBookings,
  type ArtistCard,
  type BookerCard,
  type OpportunityWithArtist,
} from './data';
import { confirmInviteAction } from './actions';
import { OrcamentoLinkCard } from './orcamento-link-card';
import { getSessionProfile } from './session';
import {
  accentButtonClass,
  avatarClass,
  cardClass,
  eyebrowClass,
  initialsFromName,
  statCardClass,
  statCardLeadClass,
  statLabelClass,
  statLabelLeadClass,
  statSubClass,
  statValueClass,
  statValueLeadClass,
} from './ui';

export const metadata: Metadata = {
  title: 'Painel | Doopla',
};

export default async function DashboardPage(props: {
  searchParams: Promise<{ limiteBooker?: string }>;
}) {
  const { limiteBooker } = await props.searchParams;
  const { supabase, user, profile } = await getSessionProfile();

  const bookings = await getUserBookings(user.id, profile.role, supabase);
  const attentionItems = await getAttentionItems(user.id, profile.role, bookings, supabase);
  const recentActivity = await getRecentActivity(user.id, profile.role, bookings, supabase);
  const pendingInvites =
    profile.role === 'artista' ? await getPendingInvites(user.id, supabase) : [];
  const myBookers =
    profile.role === 'artista' ? await getArtistBookers(user.id, supabase) : [];
  const discoverBookers =
    profile.role === 'artista'
      ? await getDiscoverBookers(myBookers.map((b) => b.profileId), supabase, 4)
      : [];
  const discoverBookersMatchReasons =
    profile.role === 'artista'
      ? await getBookerMatchReasons(
          discoverBookers.map((b) => b.profileId),
          await getArtistMatchProfile(user.id, supabase),
          supabase
        )
      : new Map<string, string[]>();
  const officialProgress =
    profile.role === 'booker' ? await getOfficialBookerProgress(user.id, bookings, supabase) : null;
  const orcamentoInfo =
    profile.role === 'artista' ? await getOrcamentoLinkInfo(user.id, supabase) : null;
  const matchingCompletion =
    profile.role === 'artista'
      ? await getArtistMatchingCompletion(user.id, supabase)
      : await getBookerMatchingCompletion(user.id, supabase);
  const subscription = profile.role === 'booker' ? await getSubscription(user.id, supabase) : null;
  const myArtists =
    profile.role === 'booker' ? await getBookerArtistRelationships(user.id, supabase) : [];
  const previewOpportunities =
    profile.role === 'booker' ? (await getOpenOpportunities(user.id, supabase)).slice(0, 3) : [];
  const upcomingAgenda =
    profile.role === 'booker'
      ? (await getAgendaEvents(user.id, profile.role, bookings, supabase))
          .filter((e) => e.date >= new Date().toISOString().slice(0, 10))
          .sort((a, b) => a.date.localeCompare(b.date))
          .slice(0, 3)
      : [];
  const origin = orcamentoInfo ? await siteOrigin() : null;
  const orcamentoUrl =
    orcamentoInfo?.publicEnabled && profile.slug ? `${origin}/orcamento/${profile.slug}` : null;

  return (
    <main className="flex flex-col gap-10">
      <header>
        <p className={eyebrowClass}>
          {profile.role === 'booker' ? 'Booker' : 'Artista'}
        </p>
        <h1 className="font-doopla-display mt-1 text-3xl font-semibold">
          Olá, {profile.full_name || user.email}
        </h1>
      </header>

      {limiteBooker === '1' && <ArtistLimitBanner />}

      {subscription?.active_artist_pending_choice && (
        <PostDowngradeBanner
          artists={myArtists.map((a) => ({
            profileId: a.profileId,
            name: a.stageName || a.fullName,
          }))}
          activeArtistId={subscription.active_artist_profile_id}
        />
      )}

      {profile.role === 'booker' ? (
        <BookerStats bookings={bookings} />
      ) : (
        <ArtistStats bookings={bookings} />
      )}

      {attentionItems.length > 0 && (
        <section id="atencao" className={cardClass}>
          <p className={`${eyebrowClass} inline-flex items-center gap-1.5`}>
            Precisa da sua atenção
            {attentionItems.some((i) => i.kind === 'urgente') && (
              <span className="h-[7px] w-[7px] rounded-full bg-[var(--alert)]" />
            )}
          </p>
          <ul className="mt-4 flex flex-col gap-3">
            {attentionItems.map((item, i) => (
              <li key={i}>
                <a
                  href={item.href}
                  className="flex items-start gap-2.5 text-sm text-[var(--ink)] hover:text-[var(--accent-ink)]"
                >
                  <span className="mt-[7px] h-[7px] w-[7px] flex-none rounded-full">
                    {item.kind === 'urgente' && <span className="block h-full w-full rounded-full bg-[var(--alert)]" />}
                    {item.kind === 'atencao' && <span className="block h-full w-full rounded-full bg-[var(--accent)]" />}
                  </span>
                  <span className="underline decoration-[var(--accent)] decoration-2 underline-offset-4">
                    {item.text}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {pendingInvites.length > 0 && (
        <section className={cardClass}>
          <p className={eyebrowClass}>Convites pendentes</p>
          <ul className="mt-4 flex flex-col gap-3">
            {pendingInvites.map((invite) => (
              <li
                key={invite.id}
                className="flex flex-wrap items-center justify-between gap-3"
              >
                <span className="flex items-center gap-3 text-sm">
                  <span className={avatarClass}>
                    {initialsFromName(invite.inviterName)}
                  </span>
                  <span>
                    <strong>{invite.inviterName}</strong> convidou você para
                    trabalhar junto na doopla.
                  </span>
                </span>
                <form action={confirmInviteAction}>
                  <input type="hidden" name="inviteId" value={invite.id} />
                  <button type="submit" className={accentButtonClass}>
                    Confirmar
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      {profile.role === 'booker' && (
        <section>
          <div className="flex items-center justify-between">
            <p className={eyebrowClass}>Bookings em andamento</p>
            <Link
              href="/dashboard/trabalhos"
              className="font-doopla-mono text-[10.5px] uppercase tracking-[.05em] text-[var(--ink)]/50 hover:text-[var(--accent-ink)]"
            >
              Ver todos
            </Link>
          </div>
          <div className="mt-4">
            <BookingsPreview
              bookings={bookings}
              role={profile.role}
              emptyState={{
                message: 'Você ainda não tem bookings em andamento.',
                cta: { label: 'Descobrir oportunidades', href: '/dashboard/oportunidades' },
              }}
            />
          </div>
        </section>
      )}

      {profile.role === 'booker' && (
        <section>
          <div className="flex items-center justify-between">
            <p className={eyebrowClass}>Oportunidades para você</p>
            <Link
              href="/dashboard/oportunidades"
              className="font-doopla-mono text-[10.5px] uppercase tracking-[.05em] text-[var(--ink)]/50 hover:text-[var(--accent-ink)]"
            >
              Descobrir trabalhos
            </Link>
          </div>
          <div className="mt-4">
            {previewOpportunities.length === 0 ? (
              <p className="rounded-[18px] bg-white p-6 text-sm text-[var(--ink)]/55">
                Nenhuma oportunidade nova para você agora.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {previewOpportunities.map((o) => (
                  <li key={o.id}>
                    <Link
                      href="/dashboard/oportunidades"
                      className="block rounded-[14px] border border-[var(--line-light)] p-4 text-sm hover:border-[var(--accent)]"
                    >
                      <span className="font-medium">{o.artistName}</span>
                      <span className="mt-1 block truncate text-[13px] text-[var(--ink)]/65">
                        {o.description}
                      </span>
                      <span className="mt-1 block text-[12px] text-[var(--ink)]/50">
                        {opportunityStateLine(o)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {profile.role !== 'booker' && (
        <section>
          <div className="flex items-center justify-between">
            <p className={eyebrowClass}>Bookings em andamento</p>
            <Link
              href="/dashboard/trabalhos"
              className="font-doopla-mono text-[10.5px] uppercase tracking-[.05em] text-[var(--ink)]/50 hover:text-[var(--accent-ink)]"
            >
              Ver todos
            </Link>
          </div>
          <div className="mt-4">
            <BookingsPreview
              bookings={bookings}
              role={profile.role}
              emptyState={{
                message: 'Você ainda não tem bookings em andamento.',
                cta: { label: 'Publicar um trabalho', href: '/dashboard/publicar-trabalho' },
              }}
            />
          </div>
        </section>
      )}

      {profile.role === 'booker' && (
        <section>
          <div className="flex items-center justify-between">
            <p className={eyebrowClass}>Seus artistas</p>
            <Link
              href="/dashboard/artistas"
              className="font-doopla-mono text-[10.5px] uppercase tracking-[.05em] text-[var(--ink)]/50 hover:text-[var(--accent-ink)]"
            >
              Ver todos
            </Link>
          </div>
          <div className="mt-4">
            <ArtistPeopleRow people={myArtists} emptyMessage="Nenhum artista na sua rede ainda." />
          </div>
        </section>
      )}

      {profile.role === 'booker' && (
        <section>
          <div className="flex items-center justify-between">
            <p className={eyebrowClass}>Agenda</p>
            <Link
              href="/dashboard/agenda"
              className="font-doopla-mono text-[10.5px] uppercase tracking-[.05em] text-[var(--ink)]/50 hover:text-[var(--accent-ink)]"
            >
              Ver agenda
            </Link>
          </div>
          <div className="mt-4">
            {upcomingAgenda.length === 0 ? (
              <p className="rounded-[18px] bg-white p-6 text-sm text-[var(--ink)]/55">
                Nenhum compromisso agendado.
              </p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {upcomingAgenda.map((e, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-3 rounded-[14px] border border-[var(--line-light)] p-3.5 text-sm"
                  >
                    <span>{e.title}</span>
                    <span className="font-doopla-mono text-[11px] text-[var(--ink)]/50">
                      {new Date(`${e.date}T00:00:00`).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: 'short',
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {profile.role === 'artista' && orcamentoInfo && (
        <OrcamentoLinkCard
          publicEnabled={orcamentoInfo.publicEnabled}
          orcamentoUrl={orcamentoUrl}
          routingMode={orcamentoInfo.routingMode}
          bookerId={orcamentoInfo.bookerId}
          bookerName={orcamentoInfo.bookerName}
          bookers={myBookers}
        />
      )}

      {/* Secundário de propósito (spec: nunca acima de dinheiro, pendências
          ou bookings) — por isso vem depois das funções operacionais. */}
      {officialProgress && <BookerOficialCard progress={officialProgress} />}

      <CompletePreferencesCard filled={matchingCompletion.filled} total={matchingCompletion.total} />

      {subscription?.booker_plan === 'basic' && <ProUpsellCard />}

      {profile.role === 'artista' && (
        <>
          <section>
            <div className="flex items-center justify-between">
              <p className={eyebrowClass}>Seus Bookers</p>
              <Link
                href="/dashboard/bookers"
                className="font-doopla-mono text-[10.5px] uppercase tracking-[.05em] text-[var(--ink)]/50 hover:text-[var(--accent-ink)]"
              >
                Ver todos
              </Link>
            </div>
            <div className="mt-4">
              <PeopleRow people={myBookers} emptyMessage="Nenhum booker com vínculo ativo ainda." />
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between">
              <p className={eyebrowClass}>Bookers para você</p>
              <Link
                href="/dashboard/bookers#descubra"
                className="font-doopla-mono text-[10.5px] uppercase tracking-[.05em] text-[var(--ink)]/50 hover:text-[var(--accent-ink)]"
              >
                Ver todos
              </Link>
            </div>
            <div className="mt-4">
              <PeopleRow
                people={discoverBookers}
                emptyMessage="Nenhum booker novo pra mostrar ainda."
                matchReasons={discoverBookersMatchReasons}
              />
            </div>
          </section>
        </>
      )}

      {recentActivity.length > 0 && (
        <section className={cardClass}>
          <p className={eyebrowClass}>Atividade recente</p>
          <ul className="mt-4 flex flex-col gap-3">
            {recentActivity.map((item, i) => (
              <li key={i}>
                <a
                  href={item.href}
                  className="flex items-start gap-2.5 text-sm text-[var(--ink)]/75 hover:text-[var(--accent-ink)]"
                >
                  <span className="mt-[1px] flex-none text-[var(--ink)]/40">
                    {item.tone === 'positivo' ? '✓' : '·'}
                  </span>
                  <span>{item.text}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function PeopleRow({
  people,
  emptyMessage,
  matchReasons,
}: {
  people: BookerCard[];
  emptyMessage: string;
  matchReasons?: Map<string, string[]>;
}) {
  if (people.length === 0) {
    return <p className="rounded-[18px] bg-white p-6 text-sm text-[var(--ink)]/55">{emptyMessage}</p>;
  }
  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {people.map((p) => {
        const reasons = matchReasons?.get(p.profileId) ?? [];
        return (
          <Link
            key={p.profileId}
            href={`/dashboard/bookers/${p.profileId}`}
            className="flex min-w-[150px] flex-col gap-1.5 rounded-[14px] border border-[var(--line-light)] p-3.5 hover:border-[var(--accent)]"
          >
            <span className={avatarClass}>{initialsFromName(p.fullName)}</span>
            <span className="truncate text-[13px] font-semibold">{p.fullName}</span>
            <span className="truncate text-[11px] text-[var(--ink)]/55">
              {[p.city, p.state].filter(Boolean).join(' · ') || p.mercados || 'Booker'}
            </span>
            {reasons.length > 0 && (
              <span className="font-doopla-mono truncate text-[10px] uppercase tracking-[.02em] text-[var(--musgo)]">
                ✓ {reasons.join(', ')}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

function ArtistPeopleRow({ people, emptyMessage }: { people: ArtistCard[]; emptyMessage: string }) {
  if (people.length === 0) {
    return <p className="rounded-[18px] bg-white p-6 text-sm text-[var(--ink)]/55">{emptyMessage}</p>;
  }
  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {people.map((p) => (
        <Link
          key={p.profileId}
          href={`/dashboard/artistas/${p.profileId}`}
          className="flex min-w-[150px] flex-col gap-1.5 rounded-[14px] border border-[var(--line-light)] p-3.5 hover:border-[var(--accent)]"
        >
          <span className={avatarClass}>{initialsFromName(p.stageName || p.fullName)}</span>
          <span className="truncate text-[13px] font-semibold">{p.stageName || p.fullName}</span>
          <span className="truncate text-[11px] text-[var(--ink)]/55">
            {[p.category, p.city].filter(Boolean).join(' · ') || 'Artista'}
          </span>
        </Link>
      ))}
    </div>
  );
}

// Mesma copy do card de "Descobrir trabalhos" (discover-work-deck.tsx) —
// nunca deixar um número solto sem dizer se já foi negociado ou não.
function opportunityStateLine(o: OpportunityWithArtist): string {
  const cacheLine =
    o.cache_amount_cents != null
      ? `Cachê do artista: ${formatCentsAsBRL(o.cache_amount_cents)}`
      : o.client_offered_cents != null
        ? `Cliente ofereceu: ${formatCentsAsBRL(o.client_offered_cents)}`
        : 'Cachê: ainda não definido';
  const commissionLine =
    o.commission_percent != null
      ? `Comissão: ${formatPercent(o.commission_percent)}`
      : 'Comissão: ainda não negociada';
  return `${commissionLine} · ${cacheLine}`;
}

function BookerStats({ bookings }: { bookings: Parameters<typeof computeBookerStats>[0] }) {
  const stats = computeBookerStats(bookings);

  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className={statCardClass}>
        <p className={statLabelClass}>Valor total negociado</p>
        <p className={statValueClass}>{formatCentsAsBRL(stats.totalNegotiatedCents)}</p>
        <p className={statSubClass}>Bruto, em bookings confirmados</p>
      </div>
      <div className={statCardLeadClass}>
        <p className={statLabelLeadClass}>Comissão ganha</p>
        <p className={statValueLeadClass}>{formatCentsAsBRL(stats.totalEarnedCents)}</p>
        <p className="mt-2 text-[12.5px] text-[var(--paper)]/60">Em bookings concluídos</p>
      </div>
      <div className={statCardClass}>
        <p className={statLabelClass}>Disponível para sacar</p>
        <p className={statValueClass}>—</p>
        <p className={statSubClass}>Disponível quando os pagamentos pela Doopla forem ativados</p>
      </div>
      <div className={statCardClass}>
        <p className={statLabelClass}>Bookings ativos</p>
        <p className={statValueClass}>{stats.activeCount}</p>
        <p className={statSubClass}>
          {stats.awaitingPaymentCount > 0
            ? `${stats.awaitingPaymentCount} aguardando pagamento`
            : 'Em andamento'}
        </p>
      </div>
    </section>
  );
}

function ArtistStats({ bookings }: { bookings: Parameters<typeof computeArtistStats>[0] }) {
  const stats = computeArtistStats(bookings);

  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className={statCardClass}>
        <p className={statLabelClass}>Total em trabalhos</p>
        <p className={statValueClass}>{formatCentsAsBRL(stats.totalGrossCents)}</p>
        <p className={statSubClass}>Bruto, em bookings confirmados</p>
      </div>
      <div className={statCardLeadClass}>
        <p className={statLabelLeadClass}>Total recebido</p>
        <p className={statValueLeadClass}>{formatCentsAsBRL(stats.netReceivedCents)}</p>
        <p className="mt-2 text-[12.5px] text-[var(--paper)]/60">Líquido, já descontada a comissão do booker</p>
      </div>
      <div className={statCardClass}>
        <p className={statLabelClass}>Disponível para sacar</p>
        <p className={statValueClass}>—</p>
        <p className={statSubClass}>Disponível quando os pagamentos pela Doopla forem ativados</p>
      </div>
      <div className={statCardClass}>
        <p className={statLabelClass}>Bookings ativos</p>
        <p className={statValueClass}>{stats.activeCount}</p>
        <p className={statSubClass}>
          {stats.awaitingPaymentCount > 0
            ? `${stats.awaitingPaymentCount} aguardando pagamento`
            : 'Em andamento'}
        </p>
      </div>
    </section>
  );
}
