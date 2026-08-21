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
  const category = String(formData.get('category') ?? '').trim();
  const local = String(formData.get('local') ?? '').trim();
  const regions = formData.getAll('regions').map(String).filter(Boolean);
  const workTypes = formData.getAll('workTypes').map(String).filter(Boolean);
  const instagramUrl = String(formData.get('instagramUrl') ?? '').trim();
  const portfolioUrl = String(formData.get('portfolioUrl') ?? '').trim();
  const websiteUrl = String(formData.get('websiteUrl') ?? '').trim();
  const otherLinks = String(formData.get('otherLinks') ?? '').trim();
  const bio = String(formData.get('bio') ?? '').trim();

  if (!stageName || !category || !local || !bio) {
    return { error: 'Preencha nome artístico, profissão, cidade e o contexto pra sua Doopla.' };
  }

  // Não exige preencher os quatro links — só pelo menos um, pra sua
  // Doopla ter alguma referência profissional real (não é pra virar um
  // formulário obrigando tudo que "presença profissional" poderia ser).
  if (!instagramUrl && !portfolioUrl && !websiteUrl && !otherLinks) {
    return { error: 'Informe pelo menos um link (Instagram, site, portfólio ou outro).' };
  }

  const { error } = await supabase
    .from('artist_profiles')
    .update({
      stage_name: stageName,
      category,
      local,
      regions,
      work_types: workTypes,
      instagram_url: instagramUrl || null,
      portfolio_url: portfolioUrl || null,
      website_url: websiteUrl || null,
      other_links: otherLinks || null,
      bio,
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
