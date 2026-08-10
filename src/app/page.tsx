import Link from 'next/link';

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-1 flex-col items-center justify-center gap-8 px-6 text-center">
      <div className="flex flex-col gap-3">
        <h1 className="text-4xl font-semibold tracking-tight">Doopla</h1>
        <p className="max-w-md text-lg text-black/60 dark:text-white/60">
          Marketplace de representação para artistas independentes. Conecte
          artistas, bookers e agências em um só lugar.
        </p>
      </div>

      <div className="flex flex-col gap-4 text-base font-medium sm:flex-row">
        <Link
          href="/cadastro"
          className="flex h-12 w-full items-center justify-center rounded-full bg-black px-6 text-white transition-colors hover:bg-black/80 dark:bg-white dark:text-black dark:hover:bg-white/80 sm:w-auto"
        >
          Criar conta
        </Link>
        <Link
          href="/login"
          className="flex h-12 w-full items-center justify-center rounded-full border border-black/15 px-6 transition-colors hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10 sm:w-auto"
        >
          Entrar
        </Link>
      </div>
    </main>
  );
}
