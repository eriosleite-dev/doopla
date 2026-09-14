import type { Metadata } from 'next';
import Link from 'next/link';

import { formatCentsAsBRL, formatPercent, formatRelativeDate } from '@/lib/format';

import {
  getBookerMatchProfile,
  getFavoriteIds,
  getMyOpportunities,
  getOpenOpportunities,
} from '../data';
import { ProCard, ProEmptyState, ProPageHeader } from '../pro-ui';
import { getSessionProfile } from '../session';
import { eyebrowClass } from '../ui';
import { DiscoverWorkDeck } from './discover-work-deck';
import { MarkOpportunitiesSeen } from './mark-seen';

export async function generateMetadata(): Promise<Metadata> {
  const { profile } = await getSessionProfile();
  return { title: profile.role === 'artista' ? 'Pedidos | Doopla' : 'Descobrir trabalhos | Doopla' };
}

const STATUS_LABEL: Record<string, string> = {
  aberta: 'Aberta',
  em_distribuicao: 'Em distribuição',
  interesse_recebido: 'Com interesse recebido',
  booker_selecionado: 'Booker escolhido',
  cancelada: 'Cancelada',
};

export default async function OportunidadesPage() {
  const { supabase, user, profile } = await getSessionProfile();

  // FAIL BLOCKER corrigido (14/09/2026) — esta seção ("Pedidos
  // recebidos", pelo link individual de orçamento) já existia e
  // funcionava certo, só não tinha nenhum link de navegação até aqui
  // no shell novo. Re-skinada pro tema --pro-* nesta correção (achado
  // secundário registrado no PROGRESS.md: página ainda estava com o
  // visual antigo).
  //
  // A seção "O que você publicou" (mural — artista publica um trabalho
  // pra booker descobrir) foi REMOVIDA daqui de propósito: é o mesmo
  // modelo de marketplace já classificado LEGADO-MATCHING na auditoria
  // (achado da fundadora, 14/09/2026) — nunca deve ganhar visibilidade
  // nova. `getMyOpportunities` continua trazendo os dois tipos
  // (source='artist_link' e outros), mas só filtramos e mostramos o
  // primeiro aqui. A rota `/dashboard/publicar-trabalho` (destino do
  // antigo "Publicar agora") não foi apagada — só deixou de ser
  // referenciada por esta tela.
  if (profile.role === 'artista') {
    const allOpportunities = await getMyOpportunities(user.id, supabase);
    const pedidosRecebidos = allOpportunities.filter((o) => o.source === 'artist_link');

    return (
      <main>
        <ProPageHeader
          title="Pedidos"
          subtitle="Solicitações que clientes enviaram pelo seu link de booking/orçamento."
        />

        {pedidosRecebidos.length === 0 ? (
          <ProEmptyState message="Nenhum pedido recebido ainda pelo seu link de booking." />
        ) : (
          <div className="flex flex-col gap-3.5">
            {pedidosRecebidos.map((o) => (
              <Link key={o.id} href={`/dashboard/oportunidades/${o.id}`} className="block">
                <ProCard className="transition-colors hover:bg-white/[0.04]">
                  <p className="font-pro-sub text-[14px] font-bold">{o.description}</p>
                  {o.client_name && (
                    <p className="mt-1 text-[12.5px] text-[var(--pro-tx-50)]">Cliente: {o.client_name}</p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-[var(--pro-tx-50)]">
                    <span className="font-doopla-mono uppercase tracking-[.03em] text-[var(--pro-tx-30)]">
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
                </ProCard>
              </Link>
            ))}
          </div>
        )}
      </main>
    );
  }

  const [opportunities, matchProfile, favoriteIds] = await Promise.all([
    getOpenOpportunities(user.id, supabase),
    getBookerMatchProfile(user.id, supabase),
    getFavoriteIds(user.id, supabase),
  ]);

  const itemsWithMatch = opportunities.map((o) => ({
    ...o,
    matchReasons: matchReasonsFor(o, matchProfile),
  }));

  return (
    <main className="flex flex-col gap-8">
      <MarkOpportunitiesSeen />
      <header>
        <p className={eyebrowClass}>Descobrir trabalhos</p>
        <h1 className="font-doopla-display mt-1 text-3xl font-semibold">Trabalhos para você</h1>
        <p className="mt-2 text-sm text-[var(--ink)]/60">
          Encontre trabalhos em que artistas estão procurando ajuda para negociar, fechar ou
          organizar o booking.
        </p>
      </header>

      <DiscoverWorkDeck items={itemsWithMatch} favoriteIds={[...favoriteIds]} />
    </main>
  );
}

function matchReasonsFor(
  o: Awaited<ReturnType<typeof getOpenOpportunities>>[number],
  profile: Awaited<ReturnType<typeof getBookerMatchProfile>>
): string[] {
  const reasons: string[] = [];
  if (
    o.category &&
    profile.artistCategories.some((c) => c.toLowerCase() === o.category!.toLowerCase())
  ) {
    reasons.push(`categoria: ${o.category}`);
  }
  if (
    o.location &&
    profile.regions.some(
      (r) =>
        r.toLowerCase().includes(o.location!.toLowerCase()) ||
        o.location!.toLowerCase().includes(r.toLowerCase())
    )
  ) {
    reasons.push(`região: ${o.location}`);
  }
  return reasons;
}
