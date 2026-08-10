import type { Metadata } from 'next';

import { SignupForm } from './signup-form';
import type { UserRole } from '@/lib/supabase/types';

export const metadata: Metadata = {
  title: 'Criar conta | Doopla',
};

const VALID_ROLES: UserRole[] = ['artista', 'booker', 'agencia'];

function isUserRole(value: string | undefined): value is UserRole {
  return VALID_ROLES.includes(value as UserRole);
}

export default async function CadastroPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const params = await searchParams;
  const defaultRole = isUserRole(params.role) ? params.role : 'artista';

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Criar conta na Doopla</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Marketplace de representação para artistas independentes.
        </p>
      </div>

      <SignupForm defaultRole={defaultRole} />
    </main>
  );
}
