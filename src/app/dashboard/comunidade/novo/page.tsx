import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getSessionProfile } from '../../session';
import { NovoTopicoHeader } from './novo-header';
import { ProComunidadeNovoForm } from './pro-comunidade-novo-form';

export const metadata: Metadata = {
  title: 'Novo tópico | Comunidade | Doopla',
};

export default async function ComunidadeNovoPage() {
  const { profile } = await getSessionProfile();
  if (profile.role !== 'artista') redirect('/dashboard');

  // Busca universal (16/09/2026) — categoria deixou de ser exigida na
  // criação de tópico, então esta página nem busca mais
  // community_categories (nenhum consumidor restante aqui). Tags
  // livres (16/09/2026) — idem pra community_tags: não existe mais
  // catálogo fixo pra buscar, a pessoa digita o que quiser (ver
  // ProComunidadeNovoForm/DECISOES.md).
  return (
    <main>
      <NovoTopicoHeader />
      <ProComunidadeNovoForm />
    </main>
  );
}
