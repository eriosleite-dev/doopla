import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getProfessionalHomeFacts } from '@/lib/professional-home/data';
import { listActionableDecisions } from '@/lib/decisions/data';
import { listConversationOperationalFacts } from '@/lib/conversations/data';
import { summarizeConversationStates, type ConversationStateSummary } from '@/lib/conversations/summary';

// Shell + Home bloco. Wrapper local (nunca dentro dos arquivos da
// Foundation) só pra dedupe de request: layout.tsx (Shell, pro badge
// da sidebar) e page.tsx (Home) chamam a MESMA função nesse mesmo
// request — cache() garante que get_professional_home_facts() só
// bate no Supabase uma vez, mesmo padrão já usado por getSessionProfile
// (session.ts). Funciona porque supabase vem de getSessionProfile,
// também cache()-ado — mesma referência de objeto nos dois call sites.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any>;

export const getCachedProfessionalHomeFacts = cache(async (supabase: AnySupabaseClient) =>
  getProfessionalHomeFacts(supabase)
);

export const getCachedActionableDecisions = cache(async (supabase: AnySupabaseClient) =>
  listActionableDecisions(supabase)
);

// Fonte única de contagem por estado de conversa (item 1 da revisão
// Professional Web Dashboard, 06/09/2026) — sidebar (badge de
// Decisões), Home (cards + accordion "Precisa de você") e
// /dashboard/decisoes chamam SEMPRE esta função, nunca uma
// reimplementação de deriveConversationState em outro lugar. cache()
// garante uma chamada só por request, mesma referência de supabase de
// getSessionProfile — layout.tsx e page.tsx nunca calculam números
// diferentes dentro do mesmo carregamento de página.
export const getCachedConversationStateSummary = cache(
  async (supabase: AnySupabaseClient): Promise<ConversationStateSummary> => {
    const facts = await listConversationOperationalFacts(supabase);
    return summarizeConversationStates(facts);
  }
);
