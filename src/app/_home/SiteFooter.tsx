import Link from 'next/link';

import { EyeLogo } from './EyeLogo';

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <Link href="/" className="eye-logo" aria-label="Ir para a página inicial da Doopla">
        <EyeLogo onDark />
      </Link>
      <div className="foot-links">
        <Link href="/seguranca">Segurança</Link>
        <Link href="/termos">Termos</Link>
        <Link href="/privacidade">Privacidade</Link>
        <Link href="/contato">Contato</Link>
        <span className="foot-legal">Doopla © 2026 · CNPJ: 68.636.132/0001-48</span>
      </div>
    </footer>
  );
}
