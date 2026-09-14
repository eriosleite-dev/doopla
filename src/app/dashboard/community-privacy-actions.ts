'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { ensureCommunityProfileActivated, getMyCommunityProfile, updateCommunityProfile } from '@/lib/community/data';
import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/lib/supabase/types';

export interface CommunityPrivacyFormState {
  error?: string;
  success?: boolean;
}

export interface CommunityPrivacySnapshotState {
  error?: string;
  loaded?: {
    availableForReferrals: boolean;
    showCity: boolean;
    showAvatar: boolean;
    showBio: boolean;
    showSpecialties: boolean;
    showWorkTypes: boolean;
    showInstagram: boolean;
    showPortfolio: boolean;
  };
}

// Configurações inline (Settings V2, 14/09/2026) — os 7 toggles de
// "Privacidade na Comunidade" saíram da subpágina própria
// (/dashboard/perfil/privacidade/comunidade) e viraram um painel
// dentro do acordeão de "Privacidade e dados". Mas a busca só pode
// acontecer quando o profissional de fato abre esse painel — carregar
// isso junto com o resto de Configurações ativaria a participação na
// Comunidade (ensureCommunityProfileActivated) só por abrir
// Configurações, o que nunca foi a intenção (mesma regra já aplicada
// no App, ver mobile/app/(tabs)/mais/configuracoes.tsx). Por isso esta
// action existe separada, chamada por um Client Component só na
// primeira expansão do painel, nunca no carregamento da página.
export async function loadCommunityPrivacyAction(): Promise<CommunityPrivacySnapshotState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sessão expirada. Recarregue a página.' };

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single<Profile>();
  if (!profile || profile.role !== 'artista') {
    return { error: 'Privacidade na Comunidade só está disponível pra artistas.' };
  }

  try {
    await ensureCommunityProfileActivated(supabase);
    const snapshot = await getMyCommunityProfile(supabase);
    if (!snapshot) return { error: 'Não foi possível carregar agora. Tente novamente.' };
    return {
      loaded: {
        availableForReferrals: snapshot.availableForReferrals,
        showCity: snapshot.showCity,
        showAvatar: snapshot.showAvatar,
        showBio: snapshot.showBio,
        showSpecialties: snapshot.showSpecialties,
        showWorkTypes: snapshot.showWorkTypes,
        showInstagram: snapshot.showInstagram,
        showPortfolio: snapshot.showPortfolio,
      },
    };
  } catch {
    return { error: 'Não foi possível carregar agora. Tente novamente.' };
  }
}

// Bloco 7, P1 — "Privacidade na Comunidade" (feature nova, não
// re-skin): os 7 campos show_* de community_profiles (migration 0059)
// já tinham RPC/RLS prontos, mas nenhuma tela os escrevia em nenhuma
// plataforma. Esta action é o único caminho de escrita — mesmo boundary
// (update_community_profile) já usado pela camada de dados, nenhuma
// lógica nova.
//
// availableForReferrals nunca é exposto nesta tela (não é um dos 7
// campos pedidos, é um sinal de produto diferente — "disponível pra
// indicações"), mas a RPC exige os 8 parâmetros juntos, sem update
// parcial — por isso o valor atual chega via campo hidden no form
// (lido de getMyCommunityProfile no page.tsx) e é reenviado aqui sem
// alteração, nunca reinterpretado nem resetado.
export async function updateCommunityPrivacyAction(
  _prevState: CommunityPrivacyFormState,
  formData: FormData
): Promise<CommunityPrivacyFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login?next=/dashboard/perfil/privacidade/comunidade');
  }

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single<Profile>();
  if (!profile || profile.role !== 'artista') {
    return { error: 'Privacidade na Comunidade só está disponível pra artistas.' };
  }

  const availableForReferrals = formData.get('availableForReferrals') === 'true';
  const showCity = formData.get('showCity') === 'on';
  const showAvatar = formData.get('showAvatar') === 'on';
  const showBio = formData.get('showBio') === 'on';
  const showSpecialties = formData.get('showSpecialties') === 'on';
  const showWorkTypes = formData.get('showWorkTypes') === 'on';
  const showInstagram = formData.get('showInstagram') === 'on';
  const showPortfolio = formData.get('showPortfolio') === 'on';

  try {
    // Defesa, não fluxo esperado: a página já ativa antes de renderizar
    // o form, mas garante que um submit não falhe com
    // community_membership_required num caso de corrida improvável.
    await ensureCommunityProfileActivated(supabase);
    await updateCommunityProfile(supabase, {
      availableForReferrals,
      showCity,
      showAvatar,
      showBio,
      showSpecialties,
      showWorkTypes,
      showInstagram,
      showPortfolio,
    });
  } catch {
    return { error: 'Não foi possível salvar agora. Tente novamente.' };
  }

  revalidatePath('/dashboard/perfil/privacidade/comunidade');
  revalidatePath('/dashboard/perfil/privacidade');
  revalidatePath('/dashboard/perfil');
  return { success: true };
}
