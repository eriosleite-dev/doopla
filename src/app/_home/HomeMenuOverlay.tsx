'use client';

import { useEffect, useRef, useState } from 'react';

import { SiteMenuOverlay } from './SiteMenuOverlay';

// Menu da Home real (07/09/2026) — mesma ilha React-do-lado-do-HTML-cru
// já usada em HomeLoginModal.tsx (home.html não é React, então o
// trigger #home-menu-trigger precisa de um listener nativo no DOM).
// Mesmo overlay compartilhado com SiteHeader — nunca um menu paralelo
// só pra Home real.
export function HomeMenuOverlay() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const trigger = document.getElementById('home-menu-trigger');
    if (!trigger) return;
    function handleClick(event: MouseEvent) {
      event.preventDefault();
      triggerRef.current = trigger;
      setOpen(true);
    }
    trigger.addEventListener('click', handleClick);
    return () => trigger.removeEventListener('click', handleClick);
  }, []);

  function handleClose() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div id="site-chrome">
      <SiteMenuOverlay open={open} onClose={handleClose} />
    </div>
  );
}
