import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getProfessionalHomeFacts } from '@/lib/professional-home/data';
import { listActionableDecisions } from '@/lib/decisions/data';

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
