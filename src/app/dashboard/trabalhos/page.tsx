import type { Metadata } from 'next';
import Link from 'next/link';

import { getUserBookings } from '../data';
import { getSessionProfile } from '../session';
import { eyebrowClass } from '../ui';
import { TrabalhosList } from './trabalhos-list';

export const metadata: Metadata = {
  title: 'Trabalhos | Doopla',
};

export default async function TrabalhosPage() {
  const { supabase, user, profile } = await getSessionProfile();
  const bookings = await getUserBookings(user.id, profile.role, supabase);

  return (
    <main className="flex flex-col gap-8">
      <div>
        <Link
          href="/dashboard"
          className="font-doopla-mono text-[11px] uppercase tracking-[.06em] text-[var(--ink)]/50 hover:text-[var(--ink)]"
        >
          ← Voltar pro painel
        </Link>
      </div>
      <header>
        <p className={eyebrowClass}>Trabalhos</p>
        <h1 className="font-doopla-display mt-1 text-3xl font-semibold">Seus trabalhos</h1>
      </header>
      <TrabalhosList bookings={bookings} role={profile.role} />
    </main>
  );
}
