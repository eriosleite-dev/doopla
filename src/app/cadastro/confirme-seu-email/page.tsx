import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Confirme seu e-mail | Doopla',
};

export default function ConfirmeSeuEmailPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6 py-12 text-center">
      <h1 className="text-2xl font-semibold">Quase lá!</h1>
      <p className="text-sm text-black/60 dark:text-white/60">
        Enviamos um link de confirmação para o seu e-mail. Abra a mensagem e
        clique no link para ativar sua conta.
      </p>
      <Link href="/login" className="text-sm font-medium underline">
        Voltar para o login
      </Link>
    </main>
  );
}
