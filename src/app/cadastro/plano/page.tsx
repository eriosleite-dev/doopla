import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { eyebrowClass } from '@/app/auth/ui';
import { createClient } from '@/lib/supabase/server';
import type { Subscription } from '@/lib/supabase/types';
import { PlanForm } from './PlanForm';

export const metadata: Metadata = {
  title: 'Escolha seu plano | Doopla',
};

// Passo 3, último do funil novo. O trial de 7 dias já começou de
// verdade no passo 1 (handle_new_user grava status='trialing' e
// trial_ends_at na hora da conta ser criada) — essa tela só confirma
// qual dos dois planos a assinatura em trial aponta. artist_plan já
// vem pré-selecionado se o usuário clicou "Começar grátis" num card
// específico da Home (passado como metadata no passo 1), mas continua
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

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--paper)] px-6 py-12 font-doopla-sans text-[var(--ink)]">
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <div className="flex flex-col gap-1">
          <span className={eyebrowClass}>passo 3 de 3</span>
          <h1 className="font-doopla-display text-3xl">Escolha seu plano</h1>
          <p className="text-sm text-[var(--ink)]/60">
            Comece grátis por 7 dias. Sem cartão. Troque de plano quando quiser.
          </p>
        </div>

        <PlanForm initialPlan={initialPlan} />
      </div>
    </main>
  );
}
