import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Conta encerrada | Doopla',
};

// Estado neutro pós account closure (Settings V2, 08/09/2026) — nunca
// autenticado (a Server Action já revogou a sessão antes de redirecionar
// pra cá, ver account-closure-actions.ts + session.ts). Sem link de
// restauração de propósito: não existe fluxo de reabrir conta encerrada
// nesta rodada — um novo cadastro com o mesmo e-mail é uma conta nova.
export default function ContaEncerradaPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6 py-12 text-center">
      <h1 className="text-2xl font-semibold">Sua conta foi encerrada.</h1>
      <p className="text-sm text-black/60 dark:text-white/60">
        Você saiu da Doopla. Se quiser voltar no futuro, pode criar uma conta nova a qualquer momento.
      </p>
      <Link href="/" className="text-sm font-medium underline">
        Voltar para a página inicial
      </Link>
    </main>
  );
}
