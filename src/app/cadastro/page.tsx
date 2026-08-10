import type { Metadata } from 'next';
import Link from 'next/link';

import { eyebrowClass } from '@/app/auth/ui';
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
    <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--paper)] px-6 py-12 font-doopla-sans text-[var(--ink)]">
      <div className="flex w-full max-w-md flex-col gap-6">
        <Link
          href="/"
          className="font-doopla-display inline-flex w-fit items-baseline text-xl font-semibold"
        >
          doopla
        </Link>

        <div className="flex flex-col gap-1">
          <span className={eyebrowClass}>toda carreira merece representação</span>
          <h1 className="font-doopla-display text-3xl">Criar conta</h1>
          <p className="text-sm text-[var(--ink)]/60">
            Marketplace de representação para artistas independentes.
          </p>
        </div>

        <SignupForm defaultRole={defaultRole} />
      </div>
    </main>
  );
}
