import type { Metadata } from 'next';

import { getUserBookings } from '../data';
import { getSessionProfile } from '../session';
import { eyebrowClass } from '../ui';
import { ContratosList } from './contratos-list';

export const metadata: Metadata = {
  title: 'Contratos | Doopla',
};

export default async function ContratosPage() {
  const { supabase, user, profile } = await getSessionProfile();
  const bookings = await getUserBookings(user.id, profile.role, supabase);

  return (
    <main className="flex flex-col gap-8">
      <header>
        <p className={eyebrowClass}>Contratos</p>
        <h1 className="font-doopla-display mt-1 text-3xl font-semibold">Contratos</h1>
        <p className="mt-2 text-sm text-[var(--ink)]/60">
          Anexe o link do contrato combinado fora da doopla (Google Doc, PDF etc). Ainda não
          temos geração nem assinatura eletrônica por aqui.
        </p>
      </header>
      <ContratosList bookings={bookings} />
    </main>
  );
}
