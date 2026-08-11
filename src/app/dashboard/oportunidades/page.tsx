import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { formatCentsAsBRL, formatPercent } from '@/lib/format';

import { claimOpportunityAction, dismissOpportunityAction } from '../actions';
import { CommissionField } from '../commission-field';
import { getOpenOpportunitiesForBooker } from '../data';
import { getSessionProfile } from '../session';
import { avatarClass, cardClass, eyebrowClass, ghostButtonClass, initialsFromName, primaryButtonClass } from '../ui';

export const metadata: Metadata = {
  title: 'Oportunidades | Doopla',
};

export default async function OportunidadesPage() {
  const { supabase, user, profile } = await getSessionProfile();
  if (profile.role !== 'booker') {
    redirect('/dashboard');
  }

  const opportunities = await getOpenOpportunitiesForBooker(user.id, supabase);

  await supabase
    .from('booker_profiles')
    .update({ opportunities_seen_at: new Date().toISOString() })
    .eq('profile_id', user.id);

  return (
    <main className="flex flex-col gap-8">
      <header>
        <p className={eyebrowClass}>Novos trabalhos</p>
        <h1 className="font-doopla-display mt-1 text-3xl font-semibold">
          Oportunidades
        </h1>
      </header>

      {opportunities.length === 0 ? (
        <p className={`${cardClass} text-sm text-[var(--ink)]/60`}>
          Nenhuma oportunidade aberta agora. Volta aqui daqui a pouco.
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
