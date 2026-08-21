'use server';

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import type { PlanId } from '@/lib/market';

export interface OnboardingFormState {
  error?: string;
}

// Continuação do onboarding DEPOIS que a conta já existe — cada etapa
// grava direto no banco (não só em memória do componente), pra
// sobreviver a refresh, fechar o navegador e voltar depois. A conta em
// si (profile/artist_profile/subscription) já foi criada no passo 1
// (createAccountAction, auth/actions.ts) via a trigger handle_new_user;
// essas ações só fazem UPDATE nas linhas que já existem.

async function requireArtist() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/cadastro/preparar');
  return { supabase, user };
}

export async function savePrepareAction(
  _prevState: OnboardingFormState,
  formData: FormData
): Promise<OnboardingFormState> {
  const { supabase, user } = await requireArtist();

  const stageName = String(formData.get('stageName') ?? '').trim();
  const bio = String(formData.get('bio') ?? '').trim();
  const local = String(formData.get('local') ?? '').trim();
  const temBooker = String(formData.get('temBooker') ?? '').trim();

  if (!stageName || !bio) {
    return { error: 'Preencha ao menos o nome artístico e conte um pouco sobre seu trabalho.' };
  }

  const { error } = await supabase
    .from('artist_profiles')
    .update({
      stage_name: stageName,
      bio,
      local: local || null,
      tem_booker: temBooker || null,
    })
    .eq('profile_id', user.id);

  if (error) {
    return { error: 'Não foi possível salvar. Tente novamente.' };
  }

  redirect('/cadastro/plano');
}

export async function savePlanAction(
  _prevState: OnboardingFormState,
  formData: FormData
): Promise<OnboardingFormState> {
  const { supabase, user } = await requireArtist();

  const plan = String(formData.get('artistPlan') ?? '') as PlanId;
  if (plan !== 'doopla' && plan !== 'pro') {
    return { error: 'Escolha um plano pra continuar.' };
  }

  const { error } = await supabase
    .from('subscriptions')
    .update({ artist_plan: plan })
    .eq('profile_id', user.id);

  if (error) {
    return { error: 'Não foi possível salvar o plano. Tente novamente.' };
  }

  redirect('/dashboard');
}
