import type { Metadata } from 'next';

import { formatCentsAsBRL } from '@/lib/format';

import {
  computeInMovementCents,
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
  statCardLeadClass,
  statLabelLeadClass,
  statValueLeadClass,
} from './ui';

export const metadata: Metadata = {
  title: 'Hoje | Doopla',
};

export default async function DashboardPage() {
  const { supabase, user, profile } = await getSessionProfile();

  const bookings = await getUserBookings(user.id, profile.role, supabase);
  const attentionItems = await getAttentionItems(user.id, profile.role, bookings, supabase);
  const pendingInvites =
    profile.role === 'artista' ? await getPendingInvites(user.id, supabase) : [];
  const inMovementCents = computeInMovementCents(bookings, profile.role);

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

      <section className={`${statCardLeadClass} max-w-sm`}>
        <p className={statLabelLeadClass}>
          {profile.role === 'booker' ? 'Comissões em movimento' : 'Ganhos em movimento'}
        </p>
        <p className={statValueLeadClass}>{formatCentsAsBRL(inMovementCents)}</p>
        <p className="mt-2 text-[12.5px] text-[var(--paper)]/60">
          Em bookings ainda não concluídos
        </p>
      </section>

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
    </main>
  );
}
