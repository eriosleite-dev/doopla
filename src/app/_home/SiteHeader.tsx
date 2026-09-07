'use client';

import Link from 'next/link';
import { useState } from 'react';

import { EyeLogo } from './EyeLogo';
import { LoginModal } from './LoginModal';
import { SiteMenuOverlay } from './SiteMenuOverlay';

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  // "Entrar" também abre o modal aqui, não só no home.html (bug
  // reportado: Home → Sobre → Entrar ainda navegava pra /login de
  // verdade, porque este header é um componente totalmente separado do
  // trigger DOM cru da Home — ver HomeLoginModal.tsx). Mesmo LoginModal
  // compartilhado, já dentro do #site-chrome do PageShell, então não
  // precisa de wrapper extra pro EyeLogo.
  const [loginOpen, setLoginOpen] = useState(false);

  return (
    <>
      <header className="site-header">
        <Link href="/" className="eye-logo" aria-label="Ir para a página inicial da Doopla">
          <EyeLogo />
        </Link>
        <nav>
          <button type="button" className="menu-btn" onClick={() => setOpen(true)} aria-haspopup="true" aria-expanded={open}>
            <span className="bars" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            Menu
          </button>
          <Link href="/sobre">Sobre</Link>
          <Link
            href="/login"
            onClick={(event) => {
              event.preventDefault();
              setLoginOpen(true);
            }}
          >
            Entrar
          </Link>
          <Link href="/cadastro" className="btn-cta">
            Criar conta
          </Link>
        </nav>
      </header>

      <SiteMenuOverlay open={open} onClose={() => setOpen(false)} />
      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </>
  );
}
