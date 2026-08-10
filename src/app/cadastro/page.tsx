import type { Metadata } from 'next';

import { SignupForm } from './signup-form';

export const metadata: Metadata = {
  title: 'Criar conta | Doopla',
};

export default function CadastroPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Criar conta na Doopla</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Marketplace de representação para artistas independentes.
        </p>
      </div>

      <SignupForm />
    </main>
  );
}
