import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import type { Subscription } from '@/lib/supabase/types';
import { PlanForm } from './PlanForm';

export const metadata: Metadata = {
  title: 'Escolha seu plano | Doopla',
};

// Etapa 7, última do funil novo. O trial de 7 dias já começou de
// verdade na etapa 1 (handle_new_user grava status='trialing' e
// trial_ends_at na hora da conta ser criada) — essa tela só confirma
// qual dos dois planos a assinatura em trial aponta. artist_plan já
// vem pré-selecionado se o usuário clicou "Começar grátis" num card
// específico da Home (passado como metadata na etapa 1), mas continua
// livre pra trocar aqui antes de continuar.
export default async function PlanoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/cadastro/plano');

  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('profile_id', user.id)
    .single<Subscription>();

  if (!subscription || subscription.role !== 'artista') redirect('/dashboard');

  const initialPlan = subscription.artist_plan === 'pro' ? 'pro' : 'doopla';

  return <PlanForm initialPlan={initialPlan} />;
}
