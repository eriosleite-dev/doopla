'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// Navegação client-side pros links internos da Home real (07/09/2026)
// — bug reportado como "flash/entre-tela estranho ao clicar em Sobre":
// home.html não é React (HTML cru via dangerouslySetInnerHTML), então
// todo <a href="/..."> lá dentro sempre foi navegação de documento
// inteiro (hard reload), nunca troca de rota do Next. Em vez de
// reescrever a Home pra virar React, um único listener delegado em
// #home-marketing intercepta cliques em qualquer link interno (href
// começando com "/") e troca por router.push — mesmo princípio já
// usado em HomeLoginModal/HomeMenuOverlay pra interceptar UM trigger
// específico, generalizado aqui pra qualquer link da página.
//
// #home-login-trigger e #home-menu-trigger ficam de fora de propósito
// — já têm handler próprio (abrir modal/overlay, nunca navegar).
// Clique com modificador (nova aba/janela) nunca é interceptado.
// Link pro próprio "/" (logo) vira scroll suave pro topo em vez de
// no-op de router.push na mesma rota.
export function HomeSoftNav() {
  const router = useRouter();

  useEffect(() => {
    const root = document.getElementById('home-marketing');
    if (!root) return;

    function handleClick(event: MouseEvent) {
      if (event.defaultPrevented) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      const anchor = target?.closest('a');
      if (!anchor) return;
      if (anchor.id === 'home-login-trigger' || anchor.id === 'home-menu-trigger') return;

      const href = anchor.getAttribute('href');
      if (!href || !href.startsWith('/')) return;

      event.preventDefault();
      if (href === '/') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      router.push(href);
    }

    root.addEventListener('click', handleClick);
    return () => root.removeEventListener('click', handleClick);
  }, [router]);

  return null;
}
