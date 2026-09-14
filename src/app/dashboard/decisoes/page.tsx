import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { fetchActionableDecisionsPage, fetchResolvedDecisionsPage } from '@/lib/decisions/data';

import { ProPageHeader } from '../pro-ui';
import { getSessionProfile } from '../session';
import { formatPendingCards, formatResolvedCards } from './format-cards';
import { ProDecisoesView } from './pro-decisoes-view';

export const metadata: Metadata = {
  title: 'Decisões | Doopla',
};

const PAGE_SIZE = 20;

// Item 9 da revisão Professional Web Dashboard (06/09/2026) — lista
// completa do que a Home resume em "Precisa de você". Esta tela só
// REPRESENTA o que Runtime/Approval Engine/Policy Gate já decidiram —
// nunca contorna ou reinterpreta essa camada.
//
// Reescrita pra paginação real server-side (migration 0070): 20
// primeiro, "Carregar mais" busca o resto (ver pro-decisoes-view.tsx +
// decisoes/actions.ts). O agrupamento por conversa e a ordenação
// agora acontecem em SQL (list_actionable_decisions_page), não mais
// no client depois de carregar tudo. Ordem default é "Recentes" —
// decisão de produto já registrada, corrigindo o que antes abria em
// "Prioridade" por engano.
export default async function DecisoesPage() {
  const { supabase, user, profile } = await getSessionProfile();
  if (profile.role === 'booker') redirect('/dashboard');

  const [pendingPage, resolvedPage] = await Promise.all([
    fetchActionableDecisionsPage(supabase, { sort: 'recentes', limit: PAGE_SIZE, offset: 0 }),
    fetchResolvedDecisionsPage(supabase, { sort: 'recentes', limit: PAGE_SIZE, offset: 0 }),
  ]);

  const [pendingCards, resolvedCards] = await Promise.all([
    formatPendingCards(supabase, user.id, profile.role, pendingPage.rows),
    formatResolvedCards(supabase, user.id, profile.role, resolvedPage.rows),
  ]);

  return (
    <main>
      <ProPageHeader
        title="Decisões"
        subtitle="O que precisa da sua decisão e o que você já resolveu."
      />

      <ProDecisoesView
        initialPendingCards={pendingCards}
        initialPendingTotal={pendingPage.totalCount}
        initialResolvedCards={resolvedCards}
        initialResolvedTotal={resolvedPage.totalCount}
      />
    </main>
  );
}
