'use client';

import Link from 'next/link';
import { useState } from 'react';

import { LoginModal } from './LoginModal';
import { SiteMenuOverlay } from './SiteMenuOverlay';

// Header das páginas institucionais (Sobre/Segurança/Termos/
// Privacidade/Contato), migrado pra usar a MESMA marcação/classes do
// header real da Home V2 (home.html: header > .wrap > .nav-logo +
// .header-actions), estilizado por home.css — nunca um header próprio
// reinventado. Só a interatividade muda: home.html não é React (usa
// listeners nativos via HomeMenuOverlay/HomeLoginModal), aqui é tudo
// estado React comum, já que esta página inteira é uma árvore React de
// verdade.
export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  return (
    <>
      <header>
        <div className="wrap">
          <Link href="/" className="nav-logo" aria-label="Doopla, ir para a home">
            d<span className="eye-slot"><span className="mascot-pupil" /></span>
            <span className="eye-slot"><span className="mascot-pupil" /></span>pla
          </Link>
          <div className="header-actions">
            <button
              type="button"
              className="menu-trigger"
              aria-haspopup="true"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              <span className="bars" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              Menu
            </button>
            <Link
              href="/login"
              className="btn btn-ghost"
              onClick={(event) => {
                event.preventDefault();
                setLoginOpen(true);
              }}
            >
              Entrar
            </Link>
            <Link href="/cadastro" className="btn btn-primary">
              Criar conta
            </Link>
          </div>
        </div>
      </header>

      <SiteMenuOverlay open={menuOpen} onClose={() => setMenuOpen(false)} />

      {/* LoginModal espera um ancestral #site-chrome de verdade pro
          EyeLogo interno (ver site-chrome.css) — mesmo wrapper local que
          HomeLoginModal.tsx já usa pra Home real, que também não tem
          #site-chrome no resto da árvore. */}
      <div id="site-chrome">
        <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
      </div>
    </>
  );
}
