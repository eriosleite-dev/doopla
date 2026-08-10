import type { Metadata } from 'next';
import Link from 'next/link';

import { eyebrowClass } from '@/app/auth/ui';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Entrar | Doopla',
};

const ERROR_MESSAGES: Record<string, string> = {
  link_invalido: 'Esse link de confirmação expirou ou já foi usado.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--paper)] px-6 py-12 font-doopla-sans text-[var(--ink)]">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Link
          href="/"
          className="font-doopla-display inline-flex w-fit items-baseline text-xl font-semibold"
        >
          doopla
        </Link>

        <div className="flex flex-col gap-1">
          <span className={eyebrowClass}>bem-vinda de volta</span>
          <h1 className="font-doopla-display text-3xl">Entrar</h1>
          <p className="text-sm text-[var(--ink)]/60">
            Acesse sua conta de artista, booker ou agência.
          </p>
        </div>

        {params.error && ERROR_MESSAGES[params.error] && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {ERROR_MESSAGES[params.error]}
          </p>
        )}

        <LoginForm next={params.next ?? '/dashboard'} />
      </div>
    </main>
  );
}
