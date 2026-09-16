import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { listCommunityTags } from '@/lib/community/data';

import { ProPageHeader } from '../../pro-ui';
import { getSessionProfile } from '../../session';
import { ProComunidadeNovoForm } from './pro-comunidade-novo-form';

export const metadata: Metadata = {
  title: 'Novo tópico | Comunidade | Doopla',
};

export default async function ComunidadeNovoPage() {
  const { supabase, profile } = await getSessionProfile();
  if (profile.role !== 'artista') redirect('/dashboard');

  // Busca universal (16/09/2026) — categoria deixou de ser exigida na
  // criação de tópico, então esta página nem busca mais
  // community_categories (nenhum consumidor restante aqui).
  const tags = await listCommunityTags(supabase);

  return (
    <main>
      <ProPageHeader title="Criar tópico" subtitle="Pergunte, compartilhe ou peça conselho pra outros profissionais da Doopla." />
      <ProComunidadeNovoForm tags={tags} />
    </main>
  );
}
