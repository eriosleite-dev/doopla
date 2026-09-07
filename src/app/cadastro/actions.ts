'use server';

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import type { PlanId } from '@/lib/market';

export interface OnboardingFormState {
  error?: string;
  // Presente só quando a chamada veio com modalMode=1 (funil iniciado
  // pelo modal da Home, ver CreateAccountModal.tsx) — sinaliza pro
  // componente cliente avançar de etapa sem redirect().
  success?: boolean;
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

// Etapas 2 a 5 ("Prepare sua Doopla" até "Conclusão") são um carrossel
// só, dentro de uma página só — grava tudo de uma vez, no fim. Sem
// taxonomia de profissão nenhuma (produto não é nichado em DJ/artista):
// "o que você faz" é texto livre (coluna category), e o contexto que a
// Doopla precisa vem inteiro da resposta aberta "Conte um pouco sobre o
// seu trabalho" (bio). negotiation_notes (etapa Como você trabalha) é
// semanticamente diferente de bio — nunca concatenados.
//
// Sem pergunta de valor/cachê aqui de propósito (07/09/2026, removida a
// pedido do produto): base_fee_cents/pricing_notes (artist_profiles)
// CONTINUAM existindo no schema, nullable, sem CHECK — a Doopla pode
// aprender esse contexto depois (perfil, conversas, bookings), só não
// faz mais sentido perguntar isso de cara no cadastro. Por isso este
// UPDATE nunca toca nessas duas colunas: ficam com o que já existia
// (nunca sobrescritas pra null por um onboarding que não coleta mais
// esse dado).
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

  const { error } = await supabase
    .from('artist_profiles')
    .update({
      stage_name: stageName,
      category: profession,
      local,
      bio,
      other_links: link || null,
      issues_invoice: issuesInvoiceRaw === '' ? null : issuesInvoiceRaw === 'true',
      negotiation_notes: negotiationNotes || null,
      attention_channel: channel as 'whatsapp' | 'painel' | 'ambos',
    })
    .eq('profile_id', user.id);

  if (error) {
    return { error: 'Não foi possível salvar. Tente novamente.' };
  }

  if (String(formData.get('modalMode') ?? '') === '1') return { success: true };
  redirect('/cadastro/plano');
}

export async function savePlanAction(
  _prevState: OnboardingFormState,
  formData: FormData
): Promise<OnboardingFormState> {
  const { supabase } = await requireArtist();

  const plan = String(formData.get('artistPlan') ?? '') as PlanId;
  if (plan !== 'doopla' && plan !== 'pro') {
    return { error: 'Escolha um plano pra continuar.' };
  }

  // Autoridade segura (07/09/2026, migration 0075) — nunca mais UPDATE
  // cru em subscriptions: select_artist_plan valida auth.uid(),
  // ownership, role='artista' e status='trialing' no servidor, sem
  // aceitar nada além do enum do plano.
  const { error } = await supabase.rpc('select_artist_plan', { p_plan: plan });

  if (error) {
    return { error: 'Não foi possível salvar o plano. Tente novamente.' };
  }

  // A conclusão de verdade (etapa 7) sempre sai da Home pro painel, modo
  // modal ou não — só as etapas INTERMEDIÁRIAS (1→2, 2→3) evitam
  // redirect() quando o funil começou no modal. Ver CreateAccountModal.tsx.
  if (String(formData.get('modalMode') ?? '') === '1') return { success: true };
  redirect('/dashboard');
}
