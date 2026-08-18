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
    const allOpportunities = await getMyOpportunities(user.id, supabase);
    const pedidosRecebidos = allOpportunities.filter((o) => o.source === 'artist_link');
    const publicados = allOpportunities.filter((o) => o.source !== 'artist_link');

    const renderCard = (o: (typeof allOpportunities)[number]) => (
      <li key={o.id}>
        <Link href={`/dashboard/oportunidades/${o.id}`} className={`${cardClass} block`}>
          <p className="text-sm text-[var(--ink)]/75">{o.description}</p>
          {o.client_name && (
            <p className="mt-1 text-[12.5px] text-[var(--ink)]/55">Cliente: {o.client_name}</p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-[var(--ink)]/55">
            <span className="font-doopla-mono uppercase tracking-[.03em]">
              {STATUS_LABEL[o.status] ?? o.status}
            </span>
            <span>
              {o.cache_amount_cents != null
                ? formatCentsAsBRL(o.cache_amount_cents)
                : o.client_offered_cents != null
                  ? `Cliente ofereceu ${formatCentsAsBRL(o.client_offered_cents)}`
                  : 'Cachê ainda não fechado'}
            </span>
            <span>
              {o.commission_percent != null
                ? `${formatPercent(o.commission_percent)} de comissão`
                : 'Comissão ainda não negociada'}
            </span>
            <span>{formatRelativeDate(o.created_at)}</span>
          </div>
        </Link>
      </li>
    );

    return (
      <main className="flex flex-col gap-10">
        <header>
          <p className={eyebrowClass}>Pedidos e trabalhos</p>
          <h1 className="font-doopla-display mt-1 text-3xl font-semibold">
            O que chegou e o que você publicou
          </h1>
        </header>

        <section className="flex flex-col gap-3">
          <div>
            <p className={eyebrowClass}>Pedidos recebidos</p>
            <p className="mt-1 text-[12.5px] text-[var(--ink)]/55">
              Solicitações que clientes enviaram pelo seu link de orçamento.
            </p>
          </div>
          {pedidosRecebidos.length === 0 ? (
            <p className="rounded-[18px] bg-white p-6 text-sm text-[var(--ink)]/60">
              Nenhum pedido recebido ainda pelo seu link de orçamento.{' '}
              <Link href="/dashboard/perfil" className="underline">
                Ver seu link
              </Link>
              .
            </p>
          ) : (
            <ul className="flex flex-col gap-4">{pedidosRecebidos.map(renderCard)}</ul>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <p className={eyebrowClass}>O que você publicou</p>
          {publicados.length === 0 ? (
            <p className="rounded-[18px] bg-white p-6 text-sm text-[var(--ink)]/60">
              Você ainda não publicou nenhum trabalho.{' '}
              <Link href="/dashboard/publicar-trabalho" className="underline">
                Publicar agora
              </Link>
              .
            </p>
          ) : (
            <ul className="flex flex-col gap-4">{publicados.map(renderCard)}</ul>
          )}
        </section>
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
