import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getUserBookings } from '../data';
import { BookerMoneyStats } from '../money-stats';
import { getSessionProfile } from '../session';
import { eyebrowClass } from '../ui';

export const metadata: Metadata = {
  title: 'Meus ganhos | Doopla',
};

export default async function GanhosPage() {
  const { supabase, user, profile } = await getSessionProfile();
  if (profile.role !== 'booker') {
    redirect('/dashboard/dinheiro');
  }

  const bookings = await getUserBookings(user.id, profile.role, supabase);

  return (
    <main className="flex flex-col gap-10">
      <header>
        <p className={eyebrowClass}>Detalhamento</p>
        <h1 className="font-doopla-display mt-1 text-3xl font-semibold">
          Meus ganhos
        </h1>
      </header>

      <BookerMoneyStats bookings={bookings} />
    </main>
  );
}
