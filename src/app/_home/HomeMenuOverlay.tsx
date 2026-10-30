'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

// Menu da Home real (09/09/2026, redesign a partir do
// doopla-home-mockup.html) — mesma ilha React-do-lado-do-HTML-cru já
// usada em HomeLoginModal.tsx (home.html não é React, então o trigger
// #home-menu-trigger precisa de um listener nativo no DOM).
//
// Diferente da rodada anterior: este overlay NÃO delega mais pra
// SiteMenuOverlay (componente compartilhado com as páginas
// institucionais — Sobre/Segurança/Termos/Privacidade/Contato). Decisão
// explícita desta rodada: não re-skinar SiteHeader/SiteFooter/
// PageShell/páginas institucionais. Um overlay escuro dedicado, exclusivo
// da Home, reaproveitando o MESMO padrão de interação (abrir/fechar via
// trigger nativo, Escape fecha, scroll da página trava, foco volta pro
// trigger ao fechar) sem tocar no componente compartilhado nem no CSS
// das páginas institucionais (site-chrome.css intocado).
const MENU_ITEMS = [
  { href: '#como-funciona', label: 'Como funciona' },
  { href: '#o-que-a-doopla-faz', label: 'O que a Doopla faz' },
  { href: '#planos', label: 'Planos' },
  { href: '/seguranca', label: 'Segurança' },
  { href: '#faq', label: 'FAQ' },
  { href: '/sobre', label: 'Sobre' },
];

export function HomeMenuOverlay() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const trigger = document.getElementById('home-menu-trigger');
    if (!trigger) return;
    function handleClick(event: MouseEvent) {
      event.preventDefault();
      triggerRef.current = trigger;
      trigger?.setAttribute('aria-expanded', 'true');
      setOpen(true);
    }
    trigger.addEventListener('click', handleClick);
    return () => trigger.removeEventListener('click', handleClick);
  }, []);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    closeBtnRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') handleClose();
    }
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function handleClose() {
    setOpen(false);
    triggerRef.current?.setAttribute('aria-expanded', 'false');
    triggerRef.current?.focus();
  }

  // Âncoras da própria Home fecham o overlay e deixam o scroll nativo
  // do navegador levar até a seção; rotas reais (/seguranca, /sobre)
  // fecham e navegam normalmente.
  function handleItemClick() {
    setOpen(false);
    triggerRef.current?.setAttribute('aria-expanded', 'false');
  }

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
        <Link
          href="/"
          className="nav-logo"
          onClick={handleClose}
          aria-label="Doopla, ir para a home"
        >
          d<span className="eye-slot"><span className="mascot-pupil" /></span>
          <span className="eye-slot"><span className="mascot-pupil" /></span>pla
        </Link>
        <button ref={closeBtnRef} type="button" className="close-btn" onClick={handleClose} aria-label="Fechar menu">
          ×
        </button>
      </div>
      <nav className="overlay-items">
        {MENU_ITEMS.map((item) =>
          item.href.startsWith('#') ? (
            <a key={item.href} href={item.href} onClick={handleItemClick}>
              {item.label}
            </a>
          ) : (
            <Link key={item.href} href={item.href} onClick={handleItemClick}>
              {item.label}
            </Link>
          )
        )}
      </nav>
      <div className="overlay-bottom">
        <span className="overlay-tagline">Quero minha Doopla</span>
        <Link href="/cadastro" className="btn btn-primary" onClick={handleClose}>
          Começar agora
        </Link>
      </div>
    </div>
  );
}
