import Link from 'next/link';

export function DashboardFooter() {
  return (
    <footer className="mt-16 border-t border-[var(--line-light)] pt-8 pb-4 text-[12.5px] text-[var(--ink)]/50">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-doopla-display text-[15px] font-semibold text-[var(--ink)]/80">
            doopla
          </p>
          <p className="mt-1 max-w-[32ch]">
            Plataforma de representação para artistas independentes.
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <p className="font-doopla-mono text-[10px] uppercase tracking-[.08em] text-[var(--ink)]/35">
            Suporte
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <Link href="/ajuda" className="hover:text-[var(--ink)]/80">
              Central de Ajuda
            </Link>
            <span aria-hidden>·</span>
            <Link href="/ajuda" className="hover:text-[var(--ink)]/80">
              Fale com a Doopla
            </Link>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <p className="font-doopla-mono text-[10px] uppercase tracking-[.08em] text-[var(--ink)]/35">
            Legal e segurança
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <Link href="/termos" className="hover:text-[var(--ink)]/80">
              Termos de Uso
            </Link>
            <span aria-hidden>·</span>
            <Link href="/privacidade" className="hover:text-[var(--ink)]/80">
              Política de Privacidade
            </Link>
            <span aria-hidden>·</span>
            <Link href="/seguranca#pagamento" className="hover:text-[var(--ink)]/80">
              Pagamentos e Segurança
            </Link>
            <span aria-hidden>·</span>
            <Link href="/seguranca#verified" className="hover:text-[var(--ink)]/80">
              Doopla Verified
            </Link>
          </div>
        </div>
      </div>

      <p className="mt-6 text-[11px] text-[var(--ink)]/35">© 2026 Doopla</p>
    </footer>
  );
}
