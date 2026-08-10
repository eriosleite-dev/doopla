import type { Metadata } from 'next';

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
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6 py-12">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Entrar na Doopla</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Acesse sua conta de artista, booker ou agência.
        </p>
      </div>

      {params.error && ERROR_MESSAGES[params.error] && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {ERROR_MESSAGES[params.error]}
        </p>
      )}

      <LoginForm next={params.next ?? '/dashboard'} />
    </main>
  );
}
