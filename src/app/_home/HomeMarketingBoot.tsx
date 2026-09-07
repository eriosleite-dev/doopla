'use client';

import { useEffect } from 'react';

declare global {
  interface Window {
    __bootHomeMarketing?: () => void;
  }
}

// Dispara window.__bootHomeMarketing (definido em home.js, injetado via
// <Script id="home-marketing-anim"> em page.tsx) em toda MONTAGEM real
// deste componente — diferente do próprio <Script>, que só executa seu
// conteúdo uma vez por sessão de app (next/script deduplica por id).
// Sem isto, sair da Home (Sobre, "Como funciona" etc., tudo navegação
// client-side do Next) e voltar depois nunca reconectava o GSAP/
// ScrollTrigger ao <div id="home-marketing"> novo — o nav ficava preso
// pra sempre no estado inicial escondido (bug: "o header desaparece").
// Poll com requestAnimationFrame porque a ordem entre o <Script> injetar
// window.__bootHomeMarketing e este efeito rodar não é garantida (mesmo
// princípio já usado dentro do próprio boot() pra esperar window.gsap).
export function HomeMarketingBoot() {
  useEffect(() => {
    let cancelled = false;
    function tryBoot() {
      if (cancelled) return;
      if (typeof window.__bootHomeMarketing === 'function') {
        window.__bootHomeMarketing();
      } else {
        requestAnimationFrame(tryBoot);
      }
    }
    tryBoot();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
