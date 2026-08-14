import type { Metadata } from 'next';
import Link from 'next/link';

import { formatCentsAsBRL, formatPercent } from '@/lib/format';
import { siteOrigin } from '@/lib/site-url';

import { BookerOficialCard } from './booker-oficial-card';
import { BookingsPreview } from './bookings-list';
import {
  computeArtistStats,
  computeBookerStats,
  getArtistBookers,
  getAttentionItems,
  getDiscoverBookers,
  getOfficialBookerProgress,
  getPendingInvites,
  getReferralSummary,
  getUserBookings,
  type BookerCard,
} from './data';
import { confirmInviteAction } from './actions';
import { ReferralCard } from './referral-card';
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
  statSubUpClass,
  statValueClass,
  statValueLeadClass,
} from './ui';

export const metadata: Metadata = {
  title: 'Painel | Doopla',
};

function pctChange(current: number, prev: number): number | null {
  if (prev === 0) return null;
  return Math.round(((current - prev) / prev) * 100);
}

export default async function DashboardPage() {
  const { supabase, user, profile } = await getSessionProfile();

  const bookings = await getUserBookings(user.id, profile.role, supabase);
  const attentionItems = await getAttentionItems(user.id, profile.role, bookings, supabase);
  const pendingInvites =
    profile.role === 'artista' ? await getPendingInvites(user.id, supabase) : [];
  const myBookers =
    profile.role === 'artista' ? await getArtistBookers(user.id, supabase) : [];
  const discoverBookers =
    profile.role === 'artista'
      ? await getDiscoverBookers(myBookers.map((b) => b.profileId), supabase, 4)
      : [];
  const officialProgress =
    profile.role === 'booker' ? await getOfficialBookerProgress(user.id, bookings, supabase) : null;
  const referralSummary =
    profile.role === 'artista' ? await getReferralSummary(user.id, profile.referral_code, supabase) : null;
  const referralUrl = referralSummary ? `${await siteOrigin()}/cadastro?ref=${referralSummary.referralCode}` : null;

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

      {profile.role === 'booker' ? (
        <BookerStats bookings={bookings} />
      ) : (
        <ArtistStats bookings={bookings} />
      )}

      {officialProgress && <BookerOficialCard progress={officialProgress} />}

      {referralSummary && referralUrl && (
        <ReferralCard
          referralUrl={referralUrl}
          referralCount={referralSummary.referrals.length}
          pendingCount={referralSummary.pendingCount}
          qualifiedTotalCents={referralSummary.qualifiedTotalCents}
        />
      )}

      {attentionItems.length > 0 && (
        <section className={cardClass}>
          <p className={`${eyebrowClass} inline-flex items-center gap-1.5`}>
            Precisa da sua atenção
            <span className="h-[7px] w-[7px] rounded-full bg-[var(--alert)]" />
          </p>
          <ul className="mt-4 flex flex-col gap-3">
            {attentionItems.map((item, i) => (
              <li key={i}>
                <a
                  href={item.href}
                  className="block text-sm text-[var(--ink)] underline decoration-[var(--accent)] decoration-2 underline-offset-4 hover:text-[var(--accent-ink)]"
                >
                  {item.text}
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

      <section>
        <div className="flex items-center justify-between">
          <p className={eyebrowClass}>Seus trabalhos</p>
          <Link
            href="/dashboard/trabalhos"
            className="font-doopla-mono text-[10.5px] uppercase tracking-[.05em] text-[var(--ink)]/50 hover:text-[var(--accent-ink)]"
          >
            Ver todos
          </Link>
        </div>
        <div className="mt-4">
          <BookingsPreview bookings={bookings} role={profile.role} />
        </div>
      </section>

      {profile.role === 'artista' && (
        <>
          <section>
            <div className="flex items-center justify-between">
              <p className={eyebrowClass}>Bookers que você já trabalhou</p>
              <Link
                href="/dashboard/bookers"
                className="font-doopla-mono text-[10.5px] uppercase tracking-[.05em] text-[var(--ink)]/50 hover:text-[var(--accent-ink)]"
              >
                Ver todos
              </Link>
            </div>
            <div className="mt-4">
              <PeopleRow people={myBookers} emptyMessage="Nenhum booker na sua rede ainda." />
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between">
              <p className={eyebrowClass}>Descubra novos bookers</p>
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
              />
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function PeopleRow({ people, emptyMessage }: { people: BookerCard[]; emptyMessage: string }) {
  if (people.length === 0) {
    return <p className="rounded-[18px] bg-white p-6 text-sm text-[var(--ink)]/55">{emptyMessage}</p>;
  }
  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {people.map((p) => (
        <div
          key={p.profileId}
          className="flex min-w-[150px] flex-col gap-1.5 rounded-[14px] border border-[var(--line-light)] p-3.5"
        >
          <span className={avatarClass}>{initialsFromName(p.fullName)}</span>
          <span className="truncate text-[13px] font-semibold">{p.fullName}</span>
          <span className="truncate text-[11px] text-[var(--ink)]/55">
            {[p.city, p.state].filter(Boolean).join(' · ') || p.mercados || 'Booker'}
          </span>
        </div>
      ))}
    </div>
  );
}

function BookerStats({ bookings }: { bookings: Parameters<typeof computeBookerStats>[0] }) {
  const stats = computeBookerStats(bookings);
  const change = pctChange(stats.monthEarnedCents, stats.monthEarnedPrevCents);

  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className={statCardLeadClass}>
        <p className={statLabelLeadClass}>Comissão total ganha</p>
        <p className={statValueLeadClass}>{formatCentsAsBRL(stats.totalEarnedCents)}</p>
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-[12.5px] text-[var(--paper)]/60">Em bookings concluídos</p>
          <Link
            href="/dashboard/dinheiro"
            className="font-doopla-mono flex-none rounded-full border border-[var(--paper)]/25 px-3 py-1.5 text-[10px] uppercase tracking-[.05em] text-[var(--paper)] hover:bg-[var(--paper)]/10"
          >
            Sacar
          </Link>
        </div>
      </div>
      <div className={statCardClass}>
        <p className={statLabelClass}>Receita do mês</p>
        <p className={statValueClass}>{formatCentsAsBRL(stats.monthEarnedCents)}</p>
        <p className={change !== null && change >= 0 ? statSubUpClass : statSubClass}>
          {change === null ? 'Sem comparação ainda' : `${change >= 0 ? '+' : ''}${change}% vs. mês anterior`}
        </p>
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
      <div className={statCardClass}>
        <p className={statLabelClass}>Taxa de aceite</p>
        <p className={statValueClass}>{formatPercent(stats.acceptanceRatePercent)}</p>
        <p className={statSubClass}>
          {stats.decidedCount > 0
            ? `${stats.acceptedCount} de ${stats.decidedCount} propostas`
            : 'Ainda sem propostas decididas'}
        </p>
      </div>
    </section>
  );
}

function ArtistStats({ bookings }: { bookings: Parameters<typeof computeArtistStats>[0] }) {
  const stats = computeArtistStats(bookings);

  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className={statCardLeadClass}>
        <p className={statLabelLeadClass}>Recebido líquido</p>
        <p className={statValueLeadClass}>{formatCentsAsBRL(stats.netReceivedCents)}</p>
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-[12.5px] text-[var(--paper)]/60">Já descontada a comissão do booker</p>
          <Link
            href="/dashboard/dinheiro"
            className="font-doopla-mono flex-none rounded-full border border-[var(--paper)]/25 px-3 py-1.5 text-[10px] uppercase tracking-[.05em] text-[var(--paper)] hover:bg-[var(--paper)]/10"
          >
            Sacar
          </Link>
        </div>
      </div>
      <div className={statCardClass}>
        <p className={statLabelClass}>Recebido no mês</p>
        <p className={statValueClass}>{formatCentsAsBRL(stats.monthNetReceivedCents)}</p>
        <p className={statSubClass}>Líquido, mês atual</p>
      </div>
      <div className={statCardClass}>
        <p className={statLabelClass}>Bookings fechados</p>
        <p className={statValueClass}>{stats.closedCount}</p>
        <p className={statSubClass}>Concluídos até agora</p>
      </div>
      <div className={statCardClass}>
        <p className={statLabelClass}>Comissão média paga</p>
        <p className={statValueClass}>{formatPercent(stats.avgCommissionPercent)}</p>
        <p className={statSubClass}>Últimos bookings fechados</p>
      </div>
    </section>
  );
}
