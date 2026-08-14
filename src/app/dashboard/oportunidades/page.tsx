import type { Metadata } from 'next';
import Link from 'next/link';

import { formatCentsAsBRL, formatPercent, formatRelativeDate } from '@/lib/format';

import { getMyOpportunities, getOpenOpportunities } from '../data';
import { getSessionProfile } from '../session';
import { cardClass, eyebrowClass } from '../ui';
import { MarkOpportunitiesSeen } from './mark-seen';
import { OpportunityCard } from './opportunity-card';

export const metadata: Metadata = {
  title: 'Oportunidades | Doopla',
};

const STATUS_LABEL: Record<string, string> = {
  aberta: 'Aberta',
  em_distribuicao: 'Em distribuição',
  interesse_recebido: 'Com interesse recebido',
  booker_selecionado: 'Booker escolhido',
  cancelada: 'Cancelada',
};

export default async function OportunidadesPage() {
  const { supabase, user, profile } = await getSessionProfile();

  if (profile.role === 'artista') {
    const myOpportunities = await getMyOpportunities(user.id, supabase);
    return (
      <main className="flex flex-col gap-8">
        <header>
          <p className={eyebrowClass}>Oportunidades</p>
          <h1 className="font-doopla-display mt-1 text-3xl font-semibold">
            O que você publicou
          </h1>
        </header>

        {myOpportunities.length === 0 ? (
          <p className="rounded-[18px] bg-white p-6 text-sm text-[var(--ink)]/60">
            Você ainda não publicou nenhum trabalho.{' '}
            <Link href="/dashboard/publicar-trabalho" className="underline">
              Publicar agora
            </Link>
            .
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {myOpportunities.map((o) => (
              <li key={o.id}>
                <Link href={`/dashboard/oportunidades/${o.id}`} className={`${cardClass} block`}>
                  <p className="text-sm text-[var(--ink)]/75">{o.description}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-[var(--ink)]/55">
                    <span className="font-doopla-mono uppercase tracking-[.03em]">
                      {STATUS_LABEL[o.status] ?? o.status}
                    </span>
                    <span>
                      {o.cache_amount_cents != null
                        ? formatCentsAsBRL(o.cache_amount_cents)
                        : 'Cachê ainda não fechado'}
                    </span>
                    <span>{formatPercent(o.commission_percent)} de comissão</span>
                    <span>{formatRelativeDate(o.created_at)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    );
  }

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
