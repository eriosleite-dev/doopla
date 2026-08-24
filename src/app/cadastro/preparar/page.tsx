import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import type { ArtistProfile } from '@/lib/supabase/types';
import { PrepareForm } from './PrepareForm';

export const metadata: Metadata = {
  title: 'Preparar sua Doopla | Doopla',
};

// Etapas 2 a 6 do funil novo (já autenticado — a conta foi criada na
// etapa 1). Lê o artist_profile atual pra pré-preencher: se o usuário
// atualizar a página, fechar e voltar depois, o que já foi salvo
// continua lá — o estado mora no banco, não só na memória do
// formulário. Sem estrutura de profissão → tipos de trabalho: "o que
// você faz" é texto livre (category), e a IA aprende o resto pela
// resposta aberta "Conte um pouco sobre o seu trabalho" (bio).
export default async function PrepararPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/cadastro/preparar');

  const { data: artistProfile } = await supabase
    .from('artist_profiles')
    .select('*')
    .eq('profile_id', user.id)
    .single<ArtistProfile>();

  // Sem artist_profile pra esse usuário = não é uma conta de artista do
  // funil novo (ex.: booker acessando essa URL direto). Manda pro painel
  // em vez de quebrar a página.
  if (!artistProfile) redirect('/dashboard');

  // Já preencheu essa etapa antes (retomando um onboarding iniciado) —
  // segue direto pra escolha de plano em vez de pedir tudo de novo.
  // attention_channel só existe depois do submit final do carrossel
  // (etapa Conclusão), então é o sinal mais confiável de "já terminou".
  if (artistProfile.stage_name && artistProfile.category && artistProfile.bio && artistProfile.attention_channel) {
    redirect('/cadastro/plano');
  }

  return (
    <PrepareForm
      initialStageName={artistProfile.stage_name ?? ''}
      initialProfession={artistProfile.category ?? ''}
      initialLocal={artistProfile.local ?? ''}
      initialBio={artistProfile.bio ?? ''}
      initialLink={artistProfile.other_links ?? ''}
      initialFeeCents={artistProfile.base_fee_cents}
      initialPricingNotes={artistProfile.pricing_notes ?? ''}
      initialIssuesInvoice={artistProfile.issues_invoice}
      initialNegotiationNotes={artistProfile.negotiation_notes ?? ''}
      initialChannel={artistProfile.attention_channel}
    />
  );
}
