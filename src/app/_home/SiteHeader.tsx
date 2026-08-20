'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { EyeLogo } from './EyeLogo';

const MENU_ITEMS = [
  { href: '/#como-funciona', label: 'Como funciona' },
  { href: '/#o-que-sua-doopla-faz', label: 'O que sua Doopla faz' },
  { href: '/#planos', label: 'Planos' },
  { href: '/seguranca', label: 'Segurança' },
  { href: '/#faq', label: 'FAQ' },
  { href: '/sobre', label: 'Sobre' },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

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
          <Link href="/login">Entrar</Link>
          <Link href="/cadastro" className="btn-cta">
            Começar agora
          </Link>
        </nav>
      </header>

      <div className={`menu-overlay${open ? ' open' : ''}`} role="dialog" aria-modal="true" aria-label="Navegação" aria-hidden={!open}>
        <div className="overlay-top">
          <Link href="/" className="eye-logo on-dark" onClick={() => setOpen(false)}>
            <EyeLogo onDark />
          </Link>
          <button type="button" className="close-btn" onClick={() => setOpen(false)} aria-label="Fechar menu">
            ×
          </button>
        </div>
        <div className="overlay-items">
          {MENU_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>
              {item.label}
            </Link>
          ))}
        </div>
        <div className="overlay-bottom">
          <span className="overlay-tagline">Quero minha Doopla</span>
          <Link href="/cadastro" className="btn-cta" onClick={() => setOpen(false)}>
            Começar agora
          </Link>
        </div>
      </div>
    </>
  );
}
