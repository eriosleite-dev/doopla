import type { Metadata } from 'next';

import { formatCentsAsBRL, formatPercent } from '@/lib/format';

import { claimOpportunityAction, dismissOpportunityAction } from '../actions';
import { BookingsList } from '../bookings-list';
import { CommissionField } from '../commission-field';
import { getOpenOpportunitiesForBooker, getUserBookings } from '../data';
import { getSessionProfile } from '../session';
import {
  avatarClass,
  cardClass,
  eyebrowClass,
  ghostButtonClass,
  initialsFromName,
  primaryButtonClass,
} from '../ui';

export const metadata: Metadata = {
  title: 'Trabalhos | Doopla',
};

export default async function TrabalhosPage() {
  const { supabase, user, profile } = await getSessionProfile();

  if (profile.role !== 'booker') {
    const bookings = await getUserBookings(user.id, profile.role, supabase);
    return (
      <main className="flex flex-col gap-8">
        <header>
          <p className={eyebrowClass}>Seu trabalho</p>
          <h1 className="font-doopla-display mt-1 text-3xl font-semibold">
            Trabalhos
          </h1>
        </header>
        <BookingsList bookings={bookings} role={profile.role} />
      </main>
    );
  }

  const opportunities = await getOpenOpportunitiesForBooker(user.id, supabase);

  await supabase
    .from('booker_profiles')
    .update({ opportunities_seen_at: new Date().toISOString() })
    .eq('profile_id', user.id);

  return (
    <main className="flex flex-col gap-8">
      <header>
        <p className={eyebrowClass}>Novos trabalhos na Doopla</p>
        <h1 className="font-doopla-display mt-1 text-3xl font-semibold">
          Trabalhos
        </h1>
      </header>

      {opportunities.length === 0 ? (
        <p className={`${cardClass} text-sm text-[var(--ink)]/60`}>
          Nenhum trabalho novo no momento. Volta aqui daqui a pouco.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {opportunities.map((opp) => (
            <li key={opp.id} className={`${cardClass} flex flex-col gap-4`}>
              <div className="flex items-center gap-3">
                <span className={avatarClass}>{initialsFromName(opp.artistName)}</span>
                <span>
                  <span className="block text-sm font-medium">{opp.artistName}</span>
                  <span className="block text-[12.5px] text-[var(--ink)]/55">
                    {opp.cache_amount_cents != null
                      ? `${formatCentsAsBRL(opp.cache_amount_cents)} · sugestão de ${formatPercent(opp.commission_percent)}`
                      : `Cachê ainda não fechado · sugestão de ${formatPercent(opp.commission_percent)}`}
                  </span>
                </span>
              </div>

              <p className="text-sm text-[var(--ink)]">{opp.description}</p>

              <details className="group">
                <summary className={`${primaryButtonClass} inline-flex w-fit cursor-pointer list-none`}>
                  Demonstrar interesse
                </summary>
                <form
                  action={claimOpportunityAction}
                  className="mt-4 flex flex-col gap-4 border-t border-[var(--line-light)] pt-4"
                >
                  <input type="hidden" name="opportunityId" value={opp.id} />
                  <CommissionField
                    name="commission"
                    label="Comissão que você topa"
                    defaultValue={Number(opp.commission_percent)}
                  />
                  <button type="submit" className={`${primaryButtonClass} self-start`}>
                    Enviar interesse
                  </button>
                </form>
              </details>

              <form action={dismissOpportunityAction} className="self-start">
                <input type="hidden" name="opportunityId" value={opp.id} />
                <button type="submit" className={ghostButtonClass}>
                  Não é pra mim
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
