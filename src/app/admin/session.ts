import { cache } from 'react';
import { redirect } from 'next/navigation';

// Commit vazio de propósito (QA, 01/10/2026): esta branch existe só pra
// disparar um Preview deployment na Vercel (ambiente Preview →
// doopla-qa-staging) pra validar o Admin V1 — a branch canônica virou
// Production Branch e não gera Preview em push direto. Sem mudança de
// comportamento aqui.

import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/lib/supabase/types';

// Painel Admin V1 — gate de boundary (UX/defesa adicional, nunca a
// barreira real: cada RPC admin_* já verifica profiles.is_admin
// internamente via _assert_is_admin). Reusa a mesma sessão/cookies do
// resto do produto, nunca service_role. Quem não é admin é mandado pro
// dashboard normal, não pra /login (sessão existe, só não tem
// autoridade) — mesmo não-vazamento de existência de rota que o resto
// do produto já pratica (ex.: getConversationOperationalFacts nunca
// devolve 403 distinguível, só notFound()).
export const getAdminSession = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?next=/admin');
  }

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single<Profile>();

  if (!profile || profile.status === 'closed' || !profile.is_admin) {
    redirect('/dashboard');
  }

  return { supabase, user, profile };
});
