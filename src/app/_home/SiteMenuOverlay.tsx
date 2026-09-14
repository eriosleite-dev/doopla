'use client';

import Link from 'next/link';
import { useEffect } from 'react';

import { EyeLogo } from './EyeLogo';
import './site-chrome.css';

const MENU_ITEMS = [
  { href: '/#como-funciona', label: 'Como funciona' },
  { href: '/#o-que-sua-doopla-faz', label: 'O que sua Doopla faz' },
  { href: '/#planos', label: 'Planos' },
  { href: '/seguranca', label: 'Segurança' },
  { href: '/#faq', label: 'FAQ' },
  { href: '/sobre', label: 'Sobre' },
];

// Overlay de MENU extraído de SiteHeader (07/09/2026) — reaproveitado
// também pelo "Menu" da Home real (home.html), que até aqui era só um
// <a href="#como-funciona"> sem overlay nenhum (bug reportado: "às
// vezes não abre" — na verdade nunca abria na Home, só nas páginas
// institucionais via SiteHeader; a inconsistência entre as duas é que
// parecia "às vezes"). Mesmo componente, mesmo comportamento nas duas
// origens — só quem dispara o open/close muda (ver SiteHeader.tsx e
// HomeMenuOverlay.tsx). Requer um ancestral #site-chrome real pro
// escopo de .menu-overlay/.eye-logo (site-chrome.css) — SiteHeader já
// vive dentro do #site-chrome do PageShell; a Home real não tem
// nenhum, por isso HomeMenuOverlay precisa prover o próprio wrapper.
export function SiteMenuOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
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
    <div className={`menu-overlay${open ? ' open' : ''}`} role="dialog" aria-modal="true" aria-label="Navegação" aria-hidden={!open}>
      <div className="overlay-top">
        <Link href="/" className="eye-logo on-dark" onClick={onClose}>
          <EyeLogo onDark />
        </Link>
        <button type="button" className="close-btn" onClick={onClose} aria-label="Fechar menu">
          ×
        </button>
      </div>
      <div className="overlay-items">
        {MENU_ITEMS.map((item) => (
          <Link key={item.href} href={item.href} onClick={onClose}>
            {item.label}
          </Link>
        ))}
      </div>
      <div className="overlay-bottom">
        <span className="overlay-tagline">Quero minha Doopla</span>
        <Link href="/cadastro" className="btn-cta" onClick={onClose}>
          Criar conta
        </Link>
      </div>
    </div>
  );
}
