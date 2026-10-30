'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';

// Overlay de MENU das páginas institucionais, migrado pra reaproveitar
// a MESMA marcação/classes do overlay real da Home V2
// (#home-menu-overlay, ver HomeMenuOverlay.tsx) — que já é globalmente
// escopado em home.css (fora de #home-marketing, de propósito, com
// fallback de cor pra funcionar em qualquer árvore), então dá pra usar
// aqui sem duplicar CSS nenhum. Só a origem do open/close muda: a Home
// real intercepta um trigger DOM nativo (home.html não é React);
// SiteHeader já é uma árvore React comum, então aqui é só prop normal.
const MENU_ITEMS = [
  { href: '/#como-funciona', label: 'Como funciona' },
  { href: '/#o-que-a-doopla-faz', label: 'O que a Doopla faz' },
  { href: '/#planos', label: 'Planos' },
  { href: '/seguranca', label: 'Segurança' },
  { href: '/#faq', label: 'FAQ' },
  { href: '/sobre', label: 'Sobre' },
];

export function SiteMenuOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    closeBtnRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  return (
    <div
      id="home-menu-overlay"
      className={open ? 'open' : ''}
      role="dialog"
      aria-modal="true"
      aria-label="Navegação"
      aria-hidden={!open}
    >
      <div className="overlay-top">
        <Link href="/" className="nav-logo" onClick={onClose} aria-label="Doopla, ir para a home">
          d<span className="eye-slot"><span className="mascot-pupil" /></span>
          <span className="eye-slot"><span className="mascot-pupil" /></span>pla
        </Link>
        <button ref={closeBtnRef} type="button" className="close-btn" onClick={onClose} aria-label="Fechar menu">
          ×
        </button>
      </div>
      <nav className="overlay-items">
        {MENU_ITEMS.map((item) => (
          <Link key={item.href} href={item.href} onClick={onClose}>
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="overlay-bottom">
        <span className="overlay-tagline">Quero minha Doopla</span>
        <Link href="/cadastro" className="btn btn-primary" onClick={onClose}>
          Criar conta
        </Link>
      </div>
    </div>
  );
}
