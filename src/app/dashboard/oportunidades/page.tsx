import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getBookerMatchProfile, getFavoriteIds, getOpenOpportunities } from '../data';
import { getSessionProfile } from '../session';
import { eyebrowClass } from '../ui';
import { DiscoverWorkDeck } from './discover-work-deck';
import { MarkOpportunitiesSeen } from './mark-seen';

export async function generateMetadata(): Promise<Metadata> {
  const { profile } = await getSessionProfile();
  return { title: profile.role === 'artista' ? 'Bookings | Doopla' : 'Descobrir trabalhos | Doopla' };
}

export default async function OportunidadesPage() {
  const { supabase, user, profile } = await getSessionProfile();

  // BOOKING — reestruturação da experiência Web (correção 15/09/2026,
  // achado da fundadora): "Pedidos" deixou de ser uma área própria do
  // Professional. Um pedido recebido pelo link de booking/orçamento
  // agora aparece dentro de Bookings (/dashboard/trabalhos), junto com
  // os demais trabalhos, tagueado por canal ("Link de booking") — ver
  // work-items.ts. Esta rota (e a lista que existia aqui pro artista)
  // só redireciona pra lá agora; o detalhe de cada pedido continua
  // existindo em /dashboard/oportunidades/[id] (destino de clique dos
  // itens de origem "Link de booking" em Bookings). Nunca apagada: um
  // link salvo/histórico pra cá ainda funciona, só não é mais navegação
  // de primeira classe. A seção "O que você publicou" (mural — legado
  // de matching) segue fora daqui desde 14/09/2026; a rota
  // `/dashboard/publicar-trabalho` não foi apagada, só não é
  // referenciada por nenhuma tela nova.
  if (profile.role === 'artista') {
    redirect('/dashboard/trabalhos');
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
