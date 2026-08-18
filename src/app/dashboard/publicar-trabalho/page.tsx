import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getSessionProfile } from '../session';
import { eyebrowClass } from '../ui';
import { PublishForm } from './publish-form';

export const metadata: Metadata = {
  title: 'Publicar trabalho | Doopla',
};

export default async function PublicarTrabalhoPage() {
  const { profile } = await getSessionProfile();
  if (profile.role !== 'artista') redirect('/dashboard');

  return (
    <main className="flex max-w-xl flex-col gap-8">
      <header>
        <p className={eyebrowClass}>Publicar trabalho</p>
        <h1 className="font-doopla-display mt-1 text-3xl font-semibold">
          Tenho um trabalho, preciso de um booker
        </h1>
        <p className="mt-2 text-sm text-[var(--ink)]/60">
          Encontre um booker pra negociar, cobrar, fechar contrato ou ajudar você neste
          trabalho. Isso aparece no mural de Pedidos e trabalhos pra todos os bookers da
          doopla.
        </p>
      </header>
      <PublishForm />
    </main>
  );
}
