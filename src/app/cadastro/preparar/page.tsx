import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import type { ArtistProfile } from '@/lib/supabase/types';
import { PrepareForm } from './PrepareForm';

export const metadata: Metadata = {
  title: 'Preparar sua Doopla | Doopla',
};

// Etapas 2 a 5 do funil novo (já autenticado — a conta foi criada na
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
  // Correção 15/09/2026 (achado da fundadora): a pergunta de canal
  // (WhatsApp/Painel/Ambos, attention_channel) saiu do onboarding —
  // nunca representou uma escolha operacional real (auditoria: zero
  // consumidor no pipeline de notificação/WhatsApp). O sinal de "já
  // terminou" passa a ser exatamente os OUTROS 4 campos que
  // savePrepareAction sempre exige e grava juntos, no mesmo UPDATE
  // atômico, no fim do carrossel — stage_name/category/local/bio.
  // `local` é o mais robusto dos 4 (nenhuma outra tela do sistema
  // escreve nele, diferente de stage_name/category/bio, editáveis
  // depois em "Perfil e trabalho") — não é um campo novo nem uma
  // heurística nova, é o restante do mesmo grupo já obrigatório.
  if (artistProfile.stage_name && artistProfile.category && artistProfile.local && artistProfile.bio) {
    redirect('/cadastro/plano');
  }

  return (
    <PrepareForm
      initialStageName={artistProfile.stage_name ?? ''}
      initialProfession={artistProfile.category ?? ''}
      initialLocal={artistProfile.local ?? ''}
      initialBio={artistProfile.bio ?? ''}
      initialLink={artistProfile.other_links ?? ''}
      initialNegotiationNotes={artistProfile.negotiation_notes ?? ''}
    />
  );
}
