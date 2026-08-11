import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getRepresentedArtists } from '../data';
import { getSessionProfile } from '../session';
import { avatarClass, cardClass, eyebrowClass, initialsFromName } from '../ui';

export const metadata: Metadata = {
  title: 'Artistas | Doopla',
};

export default async function ArtistasPage() {
  const { supabase, user, profile } = await getSessionProfile();
  if (profile.role !== 'booker') {
    redirect('/dashboard');
  }

  const artists = await getRepresentedArtists(user.id, supabase);

  return (
    <main className="flex flex-col gap-8">
      <header>
        <p className={eyebrowClass}>Quem trabalha comigo</p>
        <h1 className="font-doopla-display mt-1 text-3xl font-semibold">Artistas</h1>
      </header>

      {artists.length === 0 ? (
        <p className={`${cardClass} text-sm text-[var(--ink)]/60`}>
          Você ainda não representa nenhum artista. Quando um convite for
          confirmado, ele aparece aqui.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {artists.map((artist) => (
            <li
              key={artist.id}
              className={`${cardClass} flex items-center gap-3 !p-4`}
            >
              <span className={avatarClass}>{initialsFromName(artist.full_name)}</span>
              <span className="text-sm font-medium">{artist.full_name}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
