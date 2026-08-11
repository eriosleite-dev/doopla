import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getUserBookings } from '../data';
import { ArtistMoneyStats } from '../money-stats';
import { getSessionProfile } from '../session';
import { eyebrowClass } from '../ui';
import { BookingsList } from '../bookings-list';

export const metadata: Metadata = {
  title: 'Dinheiro | Doopla',
};

export default async function DinheiroPage() {
  const { supabase, user, profile } = await getSessionProfile();
  if (profile.role !== 'artista') {
    redirect('/dashboard/ganhos');
  }

  const bookings = await getUserBookings(user.id, profile.role, supabase);

  return (
    <main className="flex flex-col gap-10">
      <header>
        <p className={eyebrowClass}>Detalhamento</p>
        <h1 className="font-doopla-display mt-1 text-3xl font-semibold">Dinheiro</h1>
      </header>

      <ArtistMoneyStats bookings={bookings} />

      <section>
        <p className={eyebrowClass}>Seus bookings</p>
        <div className="mt-4">
          <BookingsList bookings={bookings} role={profile.role} />
        </div>
      </section>
    </main>
  );
}
