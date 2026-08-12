import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getRepresentedArtists } from '../data';
import { getSessionProfile } from '../session';
import { eyebrowClass } from '../ui';
import { ProposeForm } from './propose-form';

export const metadata: Metadata = {
  title: 'Nova proposta | Doopla',
};

export default async function ProporPage() {
  const { supabase, user, profile } = await getSessionProfile();
  if (profile.role !== 'booker') redirect('/dashboard');

  const artists = await getRepresentedArtists(user.id, supabase);

  return (
    <main className="flex max-w-xl flex-col gap-8">
      <header>
        <p className={eyebrowClass}>Nova proposta</p>
        <h1 className="font-doopla-display mt-1 text-3xl font-semibold">
          Propor um booking
        </h1>
      </header>

      {artists.length === 0 ? (
        <p className="rounded-[18px] bg-white p-6 text-sm text-[var(--ink)]/60">
          Você ainda não representa nenhum artista na doopla. Convide quem já trabalha com
          você antes de propor um booking.
        </p>
      ) : (
        <ProposeForm artists={artists} />
      )}
    </main>
  );
}
