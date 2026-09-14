import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { listCommunityCategories, listCommunityTags } from '@/lib/community/data';

import { ProPageHeader } from '../../pro-ui';
import { getSessionProfile } from '../../session';
import { ProComunidadeNovoForm } from './pro-comunidade-novo-form';

export const metadata: Metadata = {
  title: 'Novo tópico | Comunidade | Doopla',
};

export default async function ComunidadeNovoPage() {
  const { supabase, profile } = await getSessionProfile();
  if (profile.role !== 'artista') redirect('/dashboard');

  const [categories, tags] = await Promise.all([listCommunityCategories(supabase), listCommunityTags(supabase)]);

  return (
    <main>
      <ProPageHeader title="Criar tópico" subtitle="Pergunte, compartilhe ou peça conselho pra outros profissionais da Doopla." />
      <ProComunidadeNovoForm categories={categories} tags={tags} />
    </main>
  );
}
