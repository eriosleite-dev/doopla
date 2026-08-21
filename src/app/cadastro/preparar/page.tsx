import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { eyebrowClass } from '@/app/auth/ui';
import { createClient } from '@/lib/supabase/server';
import type { ArtistProfile } from '@/lib/supabase/types';
import { PrepareForm } from './PrepareForm';

export const metadata: Metadata = {
  title: 'Preparar sua Doopla | Doopla',
};

// Passo 2 do funil novo (já autenticado — a conta foi criada no passo
// 1). Lê o artist_profile atual pra pré-preencher: se o usuário atualizar
// a página, fechar e voltar depois, o que já foi salvo continua lá — o
// estado mora no banco, não só na memória do formulário.
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
  if (artistProfile.stage_name && artistProfile.category && artistProfile.bio) {
    redirect('/cadastro/plano');
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--paper)] px-6 py-12 font-doopla-sans text-[var(--ink)]">
      <div className="flex w-full max-w-md flex-col gap-6">
        <div className="flex flex-col gap-1">
          <span className={eyebrowClass}>passo 2 de 3</span>
          <h1 className="font-doopla-display text-3xl">Prepare sua Doopla</h1>
          <p className="text-sm text-[var(--ink)]/60">
            Conte um pouco sobre como você trabalha para sua Doopla saber como representar você.
          </p>
        </div>

        <PrepareForm
          initialStageName={artistProfile.stage_name ?? ''}
          initialCategory={artistProfile.category ?? ''}
          initialLocal={artistProfile.local ?? ''}
          initialRegions={artistProfile.regions ?? []}
          initialWorkTypes={artistProfile.work_types ?? []}
          initialInstagramUrl={artistProfile.instagram_url ?? ''}
          initialPortfolioUrl={artistProfile.portfolio_url ?? ''}
          initialWebsiteUrl={artistProfile.website_url ?? ''}
          initialOtherLinks={artistProfile.other_links ?? ''}
          initialBio={artistProfile.bio ?? ''}
        />
      </div>
    </main>
  );
}
