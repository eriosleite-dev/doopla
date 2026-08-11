import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getRepresentingBookers } from '../data';
import { getSessionProfile } from '../session';
import { avatarClass, cardClass, eyebrowClass, initialsFromName } from '../ui';

export const metadata: Metadata = {
  title: 'Minha equipe | Doopla',
};

export default async function MinhaEquipePage() {
  const { supabase, user, profile } = await getSessionProfile();
  if (profile.role !== 'artista') {
    redirect('/dashboard');
  }

  const bookers = await getRepresentingBookers(user.id, supabase);

  return (
    <main className="flex flex-col gap-8">
      <header>
        <p className={eyebrowClass}>Quem trabalha comigo</p>
        <h1 className="font-doopla-display mt-1 text-3xl font-semibold">
          Minha equipe
        </h1>
      </header>

      {bookers.length === 0 ? (
        <p className={`${cardClass} text-sm text-[var(--ink)]/60`}>
          Nenhum booker te representa ainda. Quando um convite for
          confirmado, ele aparece aqui.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {bookers.map((booker) => (
            <li
              key={booker.id}
              className={`${cardClass} flex items-center gap-3 !p-4`}
            >
              <span className={avatarClass}>{initialsFromName(booker.full_name)}</span>
              <span className="text-sm font-medium">{booker.full_name}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
