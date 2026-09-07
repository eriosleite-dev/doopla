'use server';

import { fetchActionableDecisionsPage, fetchResolvedDecisionsPage, type ActionableDecisionSort, type ResolvedDecisionSort } from '@/lib/decisions/data';

import { getSessionProfile } from '../session';
import { formatPendingCards, formatResolvedCards, type PendingCard, type ResolvedCard } from './format-cards';

const PAGE_SIZE = 20;

// "Carregar mais" (migration 0070) — sem paginação numérica, sem
// infinite scroll: o client mantém offset local e chama isto com o
// próximo múltiplo de 20. Trocar de sort é responsabilidade do
// CALLER resetar offset=0 (a janela reseta, nunca soma no sort
// anterior) — esta action não tem memória de estado nenhuma.
export async function loadPendingDecisionsPageAction(
  sort: ActionableDecisionSort,
  offset: number
): Promise<{ cards: PendingCard[]; totalCount: number }> {
  const { supabase, user, profile } = await getSessionProfile();
  const { rows, totalCount } = await fetchActionableDecisionsPage(supabase, { sort, limit: PAGE_SIZE, offset });
  const cards = await formatPendingCards(supabase, user.id, profile.role, rows);
  return { cards, totalCount };
}

export async function loadResolvedDecisionsPageAction(
  sort: ResolvedDecisionSort,
  offset: number
): Promise<{ cards: ResolvedCard[]; totalCount: number }> {
  const { supabase, user, profile } = await getSessionProfile();
  const { rows, totalCount } = await fetchResolvedDecisionsPage(supabase, { sort, limit: PAGE_SIZE, offset });
  const cards = await formatResolvedCards(supabase, user.id, profile.role, rows);
  return { cards, totalCount };
}
