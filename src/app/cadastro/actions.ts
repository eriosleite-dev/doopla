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

// "Cachê de referência" aceita texto livre (ex: "R$ 2.500", "2500",
// "R$ 2.500,00") — não é cobrança de verdade, só referência pra Doopla
// entender a realidade de preço do artista. Sem casas decimais válidas
// ou vazio: sem cachê de referência (equivalente a "ainda não").
function parseFeeToCents(raw: string): number | null {
  const stripped = raw.replace(/[^\d,.-]/g, '');
  if (!stripped) return null;
  const normalized = stripped.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

// Etapas 2 a 6 ("Prepare sua Doopla" até "Conclusão") são um carrossel
// só, dentro de uma página só — grava tudo de uma vez, no fim. Sem
// taxonomia de profissão nenhuma (produto não é nichado em DJ/artista):
// "o que você faz" é texto livre (coluna category), e o contexto que a
// Doopla precisa vem inteiro da resposta aberta "Conte um pouco sobre o
// seu trabalho" (bio). pricing_notes (etapa Valores, só quando o valor
// "depende do trabalho") e negotiation_notes (etapa Como você trabalha)
// são semanticamente diferentes entre si e de bio — nunca concatenados.
export async function savePrepareAction(
  _prevState: OnboardingFormState,
  formData: FormData
): Promise<OnboardingFormState> {
  const { supabase, user } = await requireArtist();

  const stageName = String(formData.get('stageName') ?? '').trim();
  const profession = String(formData.get('profession') ?? '').trim();
  const local = String(formData.get('local') ?? '').trim();
  const bio = String(formData.get('bio') ?? '').trim();
  const link = String(formData.get('link') ?? '').trim();

  const priceChoice = String(formData.get('priceChoice') ?? '');
  const feeValueRaw = String(formData.get('feeValue') ?? '').trim();
  const pricingNotes = String(formData.get('pricingNotes') ?? '').trim();
  const issuesInvoiceRaw = String(formData.get('issuesInvoice') ?? '');
  const negotiationNotes = String(formData.get('negotiationNotes') ?? '').trim();
  const channel = String(formData.get('channel') ?? '');

  if (!stageName || !profession || !local || !bio) {
    return {
      error: 'Preencha nome profissional, o que você faz, cidade-base e conte sobre seu trabalho.',
    };
  }
  if (channel !== 'whatsapp' && channel !== 'painel' && channel !== 'ambos') {
    return { error: 'Escolha como sua Doopla deve falar com você.' };
  }

  let feeCents: number | null = null;
  if (priceChoice === 'valor') {
    feeCents = parseFeeToCents(feeValueRaw);
    if (feeCents === null) {
      return { error: 'Informe um valor válido, ou marque "Depende do trabalho".' };
    }
  }

  const { error } = await supabase
    .from('artist_profiles')
    .update({
      stage_name: stageName,
      category: profession,
      local,
      bio,
      other_links: link || null,
      base_fee_cents: feeCents,
      pricing_notes: priceChoice === 'depende' ? pricingNotes || null : null,
      issues_invoice: issuesInvoiceRaw === '' ? null : issuesInvoiceRaw === 'true',
      negotiation_notes: negotiationNotes || null,
      attention_channel: channel as 'whatsapp' | 'painel' | 'ambos',
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
