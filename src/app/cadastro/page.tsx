import type { Metadata } from 'next';
import Link from 'next/link';

import { eyebrowClass } from '@/app/auth/ui';
import { SignupForm } from './signup-form';

export const metadata: Metadata = {
  title: 'Criar conta | Doopla',
};

// Agência não é mais um tipo de conta selecionável no cadastro — quem cai
// aqui com ?role=agencia (links antigos) recebe o padrão "artista".
type SignupRole = 'artista' | 'booker';

const VALID_ROLES: SignupRole[] = ['artista', 'booker'];

function isSignupRole(value: string | undefined): value is SignupRole {
  return VALID_ROLES.includes(value as SignupRole);
}

export default async function CadastroPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; ref?: string }>;
}) {
  const params = await searchParams;
  const defaultRole = isSignupRole(params.role) ? params.role : 'artista';

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
            Plataforma de representação para artistas independentes.
          </p>
        </div>

        <SignupForm defaultRole={defaultRole} referralCode={params.ref} />
      </div>
    </main>
  );
}
