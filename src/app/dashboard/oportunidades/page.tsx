import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getOpenOpportunities } from '../data';
import { getSessionProfile } from '../session';
import { eyebrowClass } from '../ui';
import { MarkOpportunitiesSeen } from './mark-seen';
import { OpportunityCard } from './opportunity-card';

export const metadata: Metadata = {
  title: 'Oportunidades | Doopla',
};

export default async function OportunidadesPage() {
  const { supabase, user, profile } = await getSessionProfile();
  if (profile.role !== 'booker') redirect('/dashboard');

  const opportunities = await getOpenOpportunities(user.id, supabase);

  return (
    <main className="flex flex-col gap-8">
      <MarkOpportunitiesSeen />
      <header>
        <p className={eyebrowClass}>Oportunidades</p>
        <h1 className="font-doopla-display mt-1 text-3xl font-semibold">
          Trabalhos em aberto
        </h1>
        <p className="mt-2 text-sm text-[var(--ink)]/60">
          Artistas com um trabalho quase fechado publicam aqui procurando um booker.
        </p>
      </header>

      {opportunities.length === 0 ? (
        <p className="rounded-[18px] bg-white p-6 text-sm text-[var(--ink)]/60">
          Nenhuma oportunidade em aberto no momento.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {opportunities.map((opportunity) => (
            <OpportunityCard key={opportunity.id} opportunity={opportunity} />
          ))}
        </ul>
      )}
    </main>
  );
}
