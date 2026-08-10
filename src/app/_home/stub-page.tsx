import Link from 'next/link';

export function StubPage({ title }: { title: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-sm text-black/60 dark:text-white/60">
        Esta página ainda está em construção.
      </p>
      <Link href="/" className="text-sm font-medium underline">
        Voltar para a home
      </Link>
    </main>
  );
}
