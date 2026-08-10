import type { Metadata } from 'next';

import { formatCentsAsBRL, formatPercent } from '@/lib/format';

import { BookingsList } from './bookings-list';
import {
  computeArtistStats,
  computeBookerStats,
  getAttentionItems,
  getPendingInvites,
  getUserBookings,
} from './data';
import { confirmInviteAction } from './actions';
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

      {attentionItems.length > 0 && (
        <section className={cardClass}>
          <p className={eyebrowClass}>Precisa da sua atenção</p>
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
        <p className={eyebrowClass}>Seus bookings</p>
        <div className="mt-4">
          <BookingsList bookings={bookings} role={profile.role} />
        </div>
      </section>
    </main>
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
        <p className="mt-2 text-[12.5px] text-[var(--paper)]/60">
          Em bookings concluídos
        </p>
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
        <p className="mt-2 text-[12.5px] text-[var(--paper)]/60">
          Já descontada a comissão do booker
        </p>
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
