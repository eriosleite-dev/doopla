import Link from 'next/link';

// Footer das páginas institucionais, migrado pra usar a MESMA
// marcação/classes/copy do footer real da Home V2 (home.html), nunca
// um footer próprio — inclusive a tagline "Representa você." e a linha
// final "Da cena para a sua carreira.", que já são o texto real da
// Home hoje (não uma decisão nova desta migração visual).
export function SiteFooter() {
  return (
    <footer>
      <div className="foot-top">
        <div>
          <Link href="/" className="foot-logo" aria-label="Doopla, ir para a home">
            d<span className="eye-slot"><span className="mascot-pupil" /></span>
            <span className="eye-slot"><span className="mascot-pupil" /></span>pla
          </Link>
          <p className="foot-tagline">Representa você.</p>
        </div>
        <div className="foot-links">
          <Link href="/sobre">Sobre</Link>
          <Link href="/seguranca">Segurança</Link>
          <Link href="/termos">Termos</Link>
          <Link href="/privacidade">Privacidade</Link>
          <Link href="/contato">Contato</Link>
        </div>
      </div>
      <div className="foot-bottom">
        <span>Doopla © 2026 · CNPJ: 68.636.132/0001-48</span>
        <span>Da cena para a sua carreira.</span>
      </div>
    </footer>
  );
}
